#!/usr/bin/env python3
"""
Altkarten georeferenzieren und als Web-Mercator-Kacheln ausgeben.

Je Karte liegt in scripts/altkarten/gcp/<id>.json eine Liste von Passpunkten
(Bildpixel ↔ Länge/Breite) und ein Maskenpolygon um den Kartenrahmen. Daraus
wird eine Thin-Plate-Spline (oder ein Polynom) gerechnet, die die Karte
verzerrt auf die heutige Lage zieht.

  scripts/altkarten/alt.sh crop <bild> x0 y0 x1 y1        Ausschnitt mit Pixelraster
  scripts/altkarten/alt.sh ort <regex> [bbox]             Orte im Ortsverzeichnis
  scripts/altkarten/alt.sh fit <id> [x0 y0 x1 y1] [--cls town,village]
                                                                  Restfehler und Prüfbild
  scripts/altkarten/alt.sh tiles <id> [--minzoom N --maxzoom N]
  scripts/altkarten/alt.sh index                          src/data/altkarten.json

Die Scans liegen nicht im Repo, ALTKARTEN_DIR zeigt auf den Ordner
(Standard ~/Downloads/Historische Landkarten). Braucht numpy, scipy, Pillow
und pyproj, alt.sh holt sie über uv.
"""

import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.interpolate import RBFInterpolator
from scipy.ndimage import map_coordinates

Image.MAX_IMAGE_PIXELS = None

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
GCP_DIR = HERE / "gcp"
CACHE = HERE / ".cache"
OUT_DIR = ROOT / "public" / "altkarten"
INDEX = ROOT / "src" / "data" / "altkarten.json"
SRC_DIR = Path(
    os.environ.get(
        "ALTKARTEN_DIR", Path.home() / "Downloads" / "Historische Landkarten"
    )
)
SCRATCH = Path(os.environ.get("ALTKARTEN_TMP", CACHE / "check"))

R = 6378137.0
WORLD = 2 * math.pi * R
# 512er-Kacheln: viermal weniger Anfragen als 256er. Bei tileSize 512 ist
# die Kachelstufe z gleich der MapLibre-Zoomstufe, auch minzoom/maxzoom in
# den gcp-Dateien sind so gemeint.
TILE = 512
# WebP-Qualität: q90 mit sharp_yuv ist bei doppelter Vergrößerung kaum vom
# Original zu unterscheiden (SSIM 0,98), near-lossless wäre dreimal so groß
CWEBP = ["cwebp", "-quiet", "-q", "90", "-m", "6", "-sharp_yuv", "-mt"]


def merc(lon, lat):
    lon = np.asarray(lon, float)
    lat = np.asarray(lat, float)
    x = np.radians(lon) * R
    y = np.log(np.tan(math.pi / 4 + np.radians(lat) / 2)) * R
    return x, y


def unmerc(x, y):
    lon = np.degrees(np.asarray(x) / R)
    lat = np.degrees(2 * np.arctan(np.exp(np.asarray(y) / R)) - math.pi / 2)
    return lon, lat


def font(size):
    for f in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    ):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def load_image(name, reduce=1):
    im = Image.open(SRC_DIR / name)
    if im.format == "JPEG" and reduce > 1:
        im.draft("RGB", (im.width // reduce, im.height // reduce))
    im = im.convert("RGB")
    return im


def load_spec(map_id):
    spec = json.loads((GCP_DIR / f"{map_id}.json").read_text())
    for p in spec["gcps"]:
        p["lonlat"] = to_wgs84(p)
    return spec


def save_spec(map_id, spec):
    """Wie von Hand gepflegt: Kopf mit Tabs, ein Passpunkt je Zeile."""

    def one(v):
        return json.dumps(v, ensure_ascii=False, separators=(", ", ": "))

    head = {k: v for k, v in spec.items() if k not in ("mask", "gcps")}
    lines = [f"\t{one(k)}: {one(v)}" for k, v in head.items()]
    if "mask" in spec:
        pts = ",\n".join(f"\t\t{one(p)}" for p in spec["mask"])
        lines.append(f'\t"mask": [\n{pts}\n\t]')
    gcps = ",\n".join(
        "\t\t{ " + one(g)[1:-1] + " }" for g in spec["gcps"]
    )
    lines.append(f'\t"gcps": [\n{gcps}\n\t]')
    (GCP_DIR / f"{map_id}.json").write_text("{\n" + ",\n".join(lines) + "\n}\n")


_TRANSFORMERS = {}


def to_wgs84(p):
    """Passpunkt in WGS84. Neben "lonlat" gehen Gradangaben im Potsdam-Datum
    ("dhdn", Greenwich; "ferro", Länge östlich Ferro) und Gauß-Krüger-Werte
    ("gk", Rechts/Hoch, Streifen aus der ersten Ziffer)."""
    if "lonlat" in p:
        return p["lonlat"]
    from pyproj import Transformer

    def tr(src):
        if src not in _TRANSFORMERS:
            _TRANSFORMERS[src] = Transformer.from_crs(src, 4326, always_xy=True)
        return _TRANSFORMERS[src]

    if "dhdn" in p:
        lon, lat = tr(4314).transform(*p["dhdn"])
    elif "ferro" in p:
        lon, lat = tr(4314).transform(p["ferro"][0] - (17 + 40 / 60), p["ferro"][1])
    elif "gk" in p:
        zone = int(str(int(p["gk"][0]))[0])
        lon, lat = tr(31464 + zone).transform(*p["gk"])
    else:
        raise SystemExit(f"Passpunkt ohne Koordinate: {p}")
    return [round(lon, 6), round(lat, 6)]


# ---------------------------------------------------------------- Transformation


class Warp:
    """Bildpixel <-> Web-Mercator-Meter, in beide Richtungen eigens gefittet."""

    def __init__(self, spec):
        g = [p for p in spec["gcps"] if not p.get("off")]
        if len(g) < 3:
            raise SystemExit("mindestens 3 Passpunkte nötig")
        self.names = [p.get("name", "?") for p in g]
        self.px = np.array([p["px"] for p in g], float)
        mx, my = merc([p["lonlat"][0] for p in g], [p["lonlat"][1] for p in g])
        self.mm = np.column_stack([mx, my])
        self.method = spec.get("method", "tps" if len(g) >= 8 else "poly1")
        self.smooth = spec.get("smooth", 0.0)
        # Normierung für stabile Numerik
        self.p0, self.ps = self.px.mean(0), self.px.std() or 1
        self.m0, self.ms = self.mm.mean(0), self.mm.std() or 1
        P = (self.px - self.p0) / self.ps
        M = (self.mm - self.m0) / self.ms
        self.fwd = self._fit(P, M)
        # Rückrichtung exakt durch die geglätteten Lagen der Hinrichtung,
        # sonst glätten beide Richtungen verschieden und passen nicht zusammen
        self.inv = self._fit(self.fwd(P), P, smooth=0.0)

    def _fit(self, a, b, method=None, smooth=None):
        method = method or self.method
        if method == "tps":
            return RBFInterpolator(
                a, b, kernel="thin_plate_spline",
                smoothing=self.smooth if smooth is None else smooth,
                degree=1,
            )
        deg = {"poly1": 1, "poly2": 2, "poly3": 3}[method]
        A = self._design(a, deg)
        coef, *_ = np.linalg.lstsq(A, b, rcond=None)
        return lambda q: self._design(q, deg) @ coef

    @staticmethod
    def _design(q, deg):
        x, y = q[:, 0], q[:, 1]
        cols = [np.ones_like(x)]
        for d in range(1, deg + 1):
            for i in range(d + 1):
                cols.append(x ** (d - i) * y**i)
        return np.column_stack(cols)

    def to_merc(self, px):
        px = np.atleast_2d(np.asarray(px, float))
        return self.fwd((px - self.p0) / self.ps) * self.ms + self.m0

    def to_px(self, mm):
        mm = np.atleast_2d(np.asarray(mm, float))
        return self.inv((mm - self.m0) / self.ms) * self.ps + self.p0

    def meters_per_px(self):
        """Mittlere Kartenauflösung in Mercator-Metern je Bildpixel."""
        c = self.px.mean(0)
        a = self.to_merc([c, c + [100, 0], c + [0, 100]])
        return (np.linalg.norm(a[1] - a[0]) + np.linalg.norm(a[2] - a[0])) / 200

    def residuals(self, method):
        """Abweichung je Passpunkt in Metern (Gelände) gegen ein Modell."""
        P = (self.px - self.p0) / self.ps
        M = (self.mm - self.m0) / self.ms
        f = self._fit(P, M, method)
        d = (f(P) - M) * self.ms
        lat = np.radians(unmerc(*self.mm.T)[1])
        return np.hypot(d[:, 0], d[:, 1]) * np.cos(lat)

    def loo(self):
        """Leave-one-out-Fehler der gewählten Methode in Metern."""
        out = []
        P = (self.px - self.p0) / self.ps
        M = (self.mm - self.m0) / self.ms
        for i in range(len(P)):
            keep = np.arange(len(P)) != i
            try:
                f = self._fit(P[keep], M[keep])
                d = (f(P[i : i + 1])[0] - M[i]) * self.ms
                lat = math.radians(float(unmerc(*self.mm[i])[1]))
                out.append(math.hypot(*d) * math.cos(lat))
            except Exception:
                out.append(float("nan"))
        return np.array(out)


# ---------------------------------------------------------------- Befehle


def cmd_crop(args):
    name, x0, y0, x1, y1 = args[0], *map(int, args[1:5])
    im = load_image(name)
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(im.width, x1), min(im.height, y1)
    c = im.crop((x0, y0, x1, y1))
    scale = min(1400 / c.width, 1400 / c.height, 2)
    c = c.resize((round(c.width * scale), round(c.height * scale)), Image.LANCZOS)
    d = ImageDraw.Draw(c)
    span = max(x1 - x0, y1 - y0)
    step = 10 ** math.floor(math.log10(span / 6))
    for m in (5, 2, 1):
        if span / (step * m) >= 5:
            step *= m
            break
    f = font(13)
    for gx in range(math.ceil(x0 / step) * step, x1, step):
        sx = (gx - x0) * scale
        d.line([(sx, 0), (sx, c.height)], fill=(255, 0, 255), width=1)
        d.text((sx + 2, 2), str(gx), fill=(255, 0, 255), font=f)
    for gy in range(math.ceil(y0 / step) * step, y1, step):
        sy = (gy - y0) * scale
        d.line([(0, sy), (c.width, sy)], fill=(255, 0, 255), width=1)
        d.text((2, sy + 2), str(gy), fill=(255, 0, 255), font=f)
    SCRATCH.mkdir(parents=True, exist_ok=True)
    out = SCRATCH / f"crop_{Path(name).stem}_{x0}_{y0}_{x1}_{y1}.jpg"
    c.save(out, quality=88)
    print(f"{out}  (Bild {im.width}x{im.height}, Raster {step} px)")


def gazetteer():
    return json.loads((CACHE / "orte.json").read_text())


def cmd_ort(args):
    rx = re.compile(args[0], re.I)
    bbox = [float(v) for v in args[1].split(",")] if len(args) > 1 else None
    for p in gazetteer():
        if not rx.search(p["name"]):
            continue
        if bbox and not (
            bbox[0] <= p["lon"] <= bbox[2] and bbox[1] <= p["lat"] <= bbox[3]
        ):
            continue
        print(f'{p["name"]:32s} {p["cls"]:16s} {p["lon"]:.5f} {p["lat"]:.5f}')


def cmd_fit(args):
    opts = parse_opts(args)
    spec = load_spec(opts["pos"][0])
    w = Warp(spec)
    print(f"{spec['id']}: {len(w.px)} Passpunkte, Methode {w.method}")
    r1 = w.residuals("poly1")
    r2 = w.residuals("poly2") if len(w.px) >= 7 else r1 * np.nan
    lo = w.loo()
    order = np.argsort(-np.nan_to_num(lo))
    print(f"{'Name':28s} {'affin':>8s} {'poly2':>8s} {'LOO':>8s}  (Meter)")
    for i in order:
        print(f"{w.names[i]:28s} {r1[i]:8.0f} {r2[i]:8.0f} {lo[i]:8.0f}")
    print(
        f"Median LOO {np.nanmedian(lo):.0f} m, Auflösung {w.meters_per_px():.1f} m/px"
    )

    # Prüfbild: heutige Orte in die Karte zurückgerechnet
    pos = opts["pos"][1:]
    im = load_image(spec["file"], reduce=4)
    full = Image.open(SRC_DIR / spec["file"]).size
    sx = im.width / full[0]
    if len(pos) == 4:
        x0, y0, x1, y1 = map(int, pos)
    else:
        x0, y0, x1, y1 = 0, 0, *full
    view = im.crop((round(x0 * sx), round(y0 * sx), round(x1 * sx), round(y1 * sx)))
    scale = min(1600 / view.width, 1600 / view.height, 3)
    view = view.resize(
        (round(view.width * scale), round(view.height * scale)), Image.LANCZOS
    )
    k = sx * scale  # Vollbildpixel -> Prüfbildpixel
    d = ImageDraw.Draw(view)
    f = font(14)
    classes = set(opts.get("cls", "city,town").split(","))
    places = [p for p in gazetteer() if p["cls"] in classes]
    corners = w.to_merc([[x0, y0], [x1, y0], [x0, y1], [x1, y1]])
    pad = 0.05 * (corners[:, 0].max() - corners[:, 0].min())
    mx, my = merc([p["lon"] for p in places], [p["lat"] for p in places])
    sel = (
        (mx > corners[:, 0].min() - pad)
        & (mx < corners[:, 0].max() + pad)
        & (my > corners[:, 1].min() - pad)
        & (my < corners[:, 1].max() + pad)
    )
    if sel.any():
        pp = w.to_px(np.column_stack([mx[sel], my[sel]]))
        for p, (x, y) in zip([p for p, s in zip(places, sel) if s], pp):
            vx, vy = (x - x0) * k, (y - y0) * k
            if 0 <= vx < view.width and 0 <= vy < view.height:
                d.line([(vx - 6, vy), (vx + 6, vy)], fill=(230, 0, 0), width=2)
                d.line([(vx, vy - 6), (vx, vy + 6)], fill=(230, 0, 0), width=2)
                d.text((vx + 5, vy + 2), p["name"], fill=(230, 0, 0), font=f)
    for n, (x, y) in zip(w.names, w.px):
        vx, vy = (x - x0) * k, (y - y0) * k
        d.ellipse([vx - 7, vy - 7, vx + 7, vy + 7], outline=(0, 120, 255), width=3)
        d.text((vx + 8, vy - 16), n, fill=(0, 90, 255), font=f)
    if spec.get("mask"):
        d.polygon(
            [((x - x0) * k, (y - y0) * k) for x, y in spec["mask"]],
            outline=(0, 170, 0),
            width=3,
        )
    SCRATCH.mkdir(parents=True, exist_ok=True)
    out = SCRATCH / f"fit_{spec['id']}_{x0}_{y0}.jpg"
    view.save(out, quality=85)
    print(out)


def parse_opts(args):
    opts, pos, i = {}, [], 0
    while i < len(args):
        if args[i].startswith("--"):
            opts[args[i][2:]] = args[i + 1]
            i += 2
        else:
            pos.append(args[i])
            i += 1
    opts["pos"] = pos
    return opts


def tile_res(z):
    return WORLD / (TILE * 2**z)


def zoom_range(spec, w):
    res = w.meters_per_px()
    # Stufe, deren Kachelpixel der Scanauflösung am nächsten kommt
    maxz = int(round(math.log2(WORLD / (TILE * res))))
    maxz = spec.get("maxzoom", maxz)
    minz = spec.get("minzoom", maxz - 5)
    return minz, maxz


def mask_polygon(spec, size):
    if spec.get("mask"):
        return [tuple(p) for p in spec["mask"]]
    W, H = size
    return [(0, 0), (W, 0), (W, H), (0, H)]


def densify(poly, n=40):
    out = []
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    return np.array(out)


def encode(png, webp):
    subprocess.run([*CWEBP, str(png), "-o", str(webp)], check=True)
    png.unlink()
    return webp.stat().st_size


def cmd_tiles(args):
    opts = parse_opts(args)
    spec = load_spec(opts["pos"][0])
    w = Warp(spec)
    print(f"{spec['id']}: lade {spec['file']}", flush=True)
    src = Image.open(SRC_DIR / spec["file"]).convert("RGB")
    poly = mask_polygon(spec, src.size)
    alpha = Image.new("L", src.size, 0)
    ImageDraw.Draw(alpha).polygon(poly, fill=255)
    # Freigestellt: Maske des Kreisgebiets (nachzeichnen.py maske)
    if spec.get("freistellen"):
        m = Image.open(CACHE / f"maske-{spec['id']}.png").convert("L")
        m = m.resize(src.size, Image.BILINEAR)
        alpha = Image.fromarray(np.minimum(np.asarray(alpha), np.asarray(m)))
        del m
    rgba = src.copy()
    rgba.putalpha(alpha)
    del src, alpha
    minz, maxz = zoom_range(spec, w)
    minz = int(opts.get("minzoom", minz))
    maxz = int(opts.get("maxzoom", maxz))
    res = w.meters_per_px()

    edge = w.to_merc(densify(poly))
    bx0, by0 = edge.min(0)
    bx1, by1 = edge.max(0)
    out = OUT_DIR / spec["id"]
    # alte Kacheln weg, sonst bleiben Reste anderer Stufen oder Größen liegen
    shutil.rmtree(out, ignore_errors=True)
    tmp = Path(tempfile.mkdtemp(prefix=f"alt-{spec['id']}-"))
    pool = ThreadPoolExecutor(max_workers=os.cpu_count() or 4)
    jobs = []
    count = 0
    for z in range(maxz, minz - 1, -1):
        tr = tile_res(z)
        # vorher auf Kachelauflösung verkleinern, sonst flimmern feine Linien
        f = max(1.0, tr / res)
        img = (
            rgba
            if f < 1.2
            else rgba.resize(
                (round(rgba.width / f), round(rgba.height / f)), Image.LANCZOS
            )
        )
        if f < 1.2:
            f = 1.0
        else:
            f = rgba.width / img.width
        arr = np.asarray(img)
        tx0 = int((bx0 + WORLD / 2) // (tr * TILE))
        tx1 = int((bx1 + WORLD / 2) // (tr * TILE))
        ty0 = int((WORLD / 2 - by1) // (tr * TILE))
        ty1 = int((WORLD / 2 - by0) // (tr * TILE))
        n = 17
        g = (np.arange(n) / (n - 1)) * TILE
        fine = np.arange(TILE) + 0.5
        for ty in range(ty0, ty1 + 1):
            for tx in range(tx0, tx1 + 1):
                # grobes Gitter exakt rechnen, dazwischen bilinear
                gx, gy = np.meshgrid(g, g)
                mx = -WORLD / 2 + (tx * TILE + gx) * tr
                my = WORLD / 2 - (ty * TILE + gy) * tr
                pp = w.to_px(np.column_stack([mx.ravel(), my.ravel()])) / f
                pxg = pp[:, 0].reshape(n, n)
                pyg = pp[:, 1].reshape(n, n)
                idx = fine / TILE * (n - 1)
                ii, jj = np.meshgrid(idx, idx)
                sx = map_coordinates(pxg, [jj, ii], order=1)
                sy = map_coordinates(pyg, [jj, ii], order=1)
                if (
                    sx.max() < 0
                    or sy.max() < 0
                    or sx.min() > arr.shape[1]
                    or sy.min() > arr.shape[0]
                ):
                    continue
                coords = [sy - 0.5, sx - 0.5]
                a = map_coordinates(arr[:, :, 3], coords, order=1, cval=0)
                if a.max() == 0:
                    continue
                chans = [
                    map_coordinates(arr[:, :, c], coords, order=1, cval=0)
                    for c in range(3)
                ]
                tile = Image.fromarray(np.dstack(chans + [a]).astype(np.uint8))
                if a.min() == 255:
                    tile = tile.convert("RGB")
                p = out / str(z) / str(tx)
                p.mkdir(parents=True, exist_ok=True)
                png = tmp / f"{z}-{tx}-{ty}.png"
                tile.save(png, compress_level=1)
                jobs.append(pool.submit(encode, png, p / f"{ty}.webp"))
                count += 1
        print(f"  z{z}: 1/{f:.1f}, bisher {count} Kacheln", flush=True)
    size = sum(j.result() for j in jobs)
    pool.shutdown()
    shutil.rmtree(tmp, ignore_errors=True)
    lon0, lat0 = unmerc(bx0, by0)
    lon1, lat1 = unmerc(bx1, by1)
    meta = {
        "bounds": [round(float(v), 5) for v in (lon0, lat0, lon1, lat1)],
        "minzoom": minz,
        "maxzoom": maxz,
        "tileSize": TILE,
        "tiles": count,
        "bytes": size,
    }
    (out / "meta.json").write_text(json.dumps(meta))
    print(meta)


def cmd_index(_args):
    maps = []
    for f in sorted(GCP_DIR.glob("*.json")):
        spec = json.loads(f.read_text())
        meta_f = OUT_DIR / spec["id"] / "meta.json"
        if not meta_f.exists():
            print(f"{spec['id']}: noch keine Kacheln")
            continue
        meta = json.loads(meta_f.read_text())
        maps.append(
            {
                "id": spec["id"],
                "year": spec["year"],
                "title": spec["title"],
                "short": spec.get("short", spec["title"]),
                "author": spec.get("author"),
                "provenance": spec.get("provenance"),
                "accuracy": spec.get("accuracy"),
                "showFrom": spec.get("showFrom", meta["minzoom"]),
                "bounds": meta["bounds"],
                "minzoom": meta["minzoom"],
                "maxzoom": meta["maxzoom"],
                "tileSize": meta.get("tileSize", 256),
            }
        )
    maps.sort(key=lambda m: (m["year"], m["id"]))
    INDEX.write_text(json.dumps(maps, ensure_ascii=False, indent="\t") + "\n")
    print(f"{len(maps)} Karten → {INDEX}")


if __name__ == "__main__":
    cmds = {
        "crop": cmd_crop,
        "ort": cmd_ort,
        "fit": cmd_fit,
        "tiles": cmd_tiles,
        "index": cmd_index,
    }
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        print(__doc__)
        sys.exit(1)
    cmds[sys.argv[1]](sys.argv[2:])

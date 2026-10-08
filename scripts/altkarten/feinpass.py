#!/usr/bin/env python3
"""
Feinpasspunkte für eine Altkarte aus der Uraufnahme.

Die Kreiskarten von 1843/44 sind nach den Katasterkarten gezeichnet, ihre
Linien (Wege, Bäche, Ortslagen, Waldränder) stehen auch in der Uraufnahme,
die auf etwa 10 m genau liegt. Nach einer ersten Entzerrung über Ortsmitten
(alt.py fit) wird die Karte hier in Fenstern von etwa 1,2 km gegen die
Uraufnahme verschoben, bis die Linien am besten übereinanderliegen
(normierte Kreuzkorrelation der Linienbilder). Jedes eindeutige Fenster
ergibt einen Passpunkt, Ausreißer gegenüber den Nachbarn fallen weg.

  scripts/altkarten/feinpass.sh <id> [--runden 2] [--debug]

Schreibt die Punkte mit "auto": true in scripts/altkarten/gcp/<id>.json,
von Hand gesetzte Punkte bleiben unverändert.
"""

import json
import math
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as nd
from scipy.ndimage import map_coordinates
from skimage.feature import match_template

sys.path.insert(0, str(Path(__file__).resolve().parent))
from alt import GCP_DIR, SRC_DIR, Warp, load_spec, merc, save_spec, unmerc  # noqa: E402

HERE = Path(__file__).resolve().parent
CACHE = HERE / ".cache" / "ura14k"
WMS_URA = (
    "https://www.wms.nrw.de/geobasis/wms_nw_uraufnahme?SERVICE=WMS&VERSION=1.3.0"
    "&REQUEST=GetMap&LAYERS=nw_uraufnahme_rw&STYLES=&CRS=EPSG:3857&FORMAT=image/jpeg"
)
HALF = 20037508.342789244
Z = 14
BLOCK = 1024
RES = 2 * HALF / (256 * 2**Z)  # Mercator-Meter je Pixel
# Fenster und Suchradius in Rasterpixeln (bei 52° etwa 5,9 m Gelände)
WIN = 200
SEARCH = 70
STEP = 100
# Mindestgüte: Korrelation und Abstand zum zweitbesten Gipfel
MIN_NCC = 0.22
MIN_GAP = 0.04


def ura_block(bx, by):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{bx}_{by}.jpg"
    if not f.exists():
        x0 = bx * BLOCK * RES - HALF
        x1 = (bx + 1) * BLOCK * RES - HALF
        y1 = HALF - by * BLOCK * RES
        y0 = HALF - (by + 1) * BLOCK * RES
        url = f"{WMS_URA}&BBOX={x0},{y0},{x1},{y1}&WIDTH={BLOCK}&HEIGHT={BLOCK}"
        for attempt in range(5):
            try:
                with urllib.request.urlopen(url, timeout=90) as res:
                    data = res.read()
                    if "jpeg" not in res.headers.get("content-type", ""):
                        raise OSError(data[:200])
                f.write_bytes(data)
                break
            except OSError as e:
                if attempt == 4:
                    raise
                print(f"  Uraufnahme {bx}_{by}: {e}, neuer Versuch", file=sys.stderr)
                time.sleep(3 * (attempt + 1))
    return np.asarray(Image.open(f).convert("RGB"))


def ura_raster(px0, py0, w, h):
    """Uraufnahme im Raster: globale Pixel (Zoom 14) px0..px0+w, py0..py0+h."""
    out = np.full((h, w, 3), 255, np.uint8)
    for by in range(py0 // BLOCK, (py0 + h - 1) // BLOCK + 1):
        for bx in range(px0 // BLOCK, (px0 + w - 1) // BLOCK + 1):
            b = ura_block(bx, by)
            ox, oy = bx * BLOCK - px0, by * BLOCK - py0
            sx0, sy0 = max(0, -ox), max(0, -oy)
            sx1, sy1 = min(BLOCK, w - ox), min(BLOCK, h - oy)
            out[oy + sy0 : oy + sy1, ox + sx0 : ox + sx1] = b[sy0:sy1, sx0:sx1]
    return out


def lines(rgb):
    """Linienbild: wie viel dunkler als die Umgebung, leicht verwischt."""
    g = rgb.astype(np.float32).mean(-1)
    dark = np.clip(nd.uniform_filter(g, 15) - g, 0, 60)
    return nd.gaussian_filter(dark, 1.5)


def main():
    args = sys.argv[1:]
    map_id = args[0]
    rounds = int(args[args.index("--runden") + 1]) if "--runden" in args else 2
    debug = "--debug" in args
    # Ortsmitten nur zum Einstieg, danach als unabhängige Kontrolle
    only_auto = "--nur-auto" in args
    spec_path = GCP_DIR / f"{map_id}.json"
    raw = json.loads(spec_path.read_text())
    manual = [p for p in raw["gcps"] if not p.get("auto")]

    src = Image.open(SRC_DIR / raw["file"]).convert("RGB")
    W, H = src.size
    mask_poly = raw.get("mask") or [[0, 0], [W, 0], [W, H], [0, H]]

    for rnd in range(rounds):
        spec = load_spec(map_id)
        w = Warp(spec)
        # Karte auf das Zoom-14-Raster verkleinert, Faktor so, dass ein
        # Kartenpixel etwa einem Rasterpixel entspricht
        f = max(1.0, RES / w.meters_per_px())
        small = np.asarray(src.resize((round(W / f), round(H / f)), Image.LANCZOS))
        edge = w.to_merc(np.array(mask_poly, float))
        mx0, my0 = edge.min(0)
        mx1, my1 = edge.max(0)
        gx0 = int((mx0 + HALF) / RES)
        gx1 = int((mx1 + HALF) / RES) + 1
        gy0 = int((HALF - my1) / RES)
        gy1 = int((HALF - my0) / RES) + 1
        gw, gh = gx1 - gx0, gy1 - gy0
        print(f"Runde {rnd + 1}: Raster {gw}x{gh}, Karte 1/{f:.2f}", flush=True)

        # Karte ins Raster ziehen (grobes Gitter exakt, dazwischen bilinear)
        n = 64
        cx = np.linspace(0, gw, n)
        cy = np.linspace(0, gh, n)
        CX, CY = np.meshgrid(cx, cy)
        mm = np.column_stack(
            [(gx0 + CX.ravel()) * RES - HALF, HALF - (gy0 + CY.ravel()) * RES]
        )
        pp = w.to_px(mm) / f
        fx = pp[:, 0].reshape(n, n)
        fy = pp[:, 1].reshape(n, n)
        ii, jj = np.meshgrid(np.arange(gw) / gw * (n - 1), np.arange(gh) / gh * (n - 1))
        sx = map_coordinates(fx, [jj, ii], order=1)
        sy = map_coordinates(fy, [jj, ii], order=1)
        old = np.dstack(
            [map_coordinates(small[..., c], [sy, sx], order=1, cval=255) for c in range(3)]
        ).astype(np.uint8)
        inside = (sx > 2) & (sy > 2) & (sx < small.shape[1] - 2) & (sy < small.shape[0] - 2)
        from matplotlib.path import Path as MPath

        poly = MPath(np.array(mask_poly, float) / f)
        inside &= poly.contains_points(np.column_stack([sx.ravel(), sy.ravel()])).reshape(
            sx.shape
        )
        ura = ura_raster(gx0, gy0, gw, gh)
        ura_ok = ~(ura > 238).all(-1)
        ura_ok = nd.binary_erosion(ura_ok, iterations=3)
        # leeres Papier der Altkarte (Nachbarländer) zählt nicht
        old_ink = nd.uniform_filter(lines(old), 41) > 1.2
        A = lines(old)
        B = lines(ura)
        if debug:
            Image.fromarray(old).save(HERE / ".cache" / f"fein-{map_id}-alt.jpg")
            Image.fromarray(ura).save(HERE / ".cache" / f"fein-{map_id}-ura.jpg")

        found = []
        for cy0 in range(SEARCH, gh - WIN - SEARCH, STEP):
            for cx0 in range(SEARCH, gw - WIN - SEARCH, STEP):
                win = (slice(cy0, cy0 + WIN), slice(cx0, cx0 + WIN))
                if inside[win].mean() < 0.9 or old_ink[win].mean() < 0.6:
                    continue
                big = (
                    slice(cy0 - SEARCH, cy0 + WIN + SEARCH),
                    slice(cx0 - SEARCH, cx0 + WIN + SEARCH),
                )
                if ura_ok[big].mean() < 0.95:
                    continue
                t = A[win]
                if t.std() < 1.0:
                    continue
                r = match_template(B[big], t)
                k = np.unravel_index(np.argmax(r), r.shape)
                best = r[k]
                r2 = r.copy()
                r2[max(0, k[0] - 8) : k[0] + 9, max(0, k[1] - 8) : k[1] + 9] = -1
                gap = best - r2.max()
                if best < MIN_NCC or gap < MIN_GAP:
                    continue
                if k[0] in (0, r.shape[0] - 1) or k[1] in (0, r.shape[1] - 1):
                    continue
                dy, dx = k[0] - SEARCH, k[1] - SEARCH
                found.append((cx0 + WIN / 2, cy0 + WIN / 2, dx, dy, best, gap))
        found = np.array(found)
        print(f"  {len(found)} Fenster mit eindeutigem Treffer", flush=True)
        if len(found) == 0:
            break
        # Ausreißer: Versatz weicht stark vom Median der Nachbarn ab
        keep = np.ones(len(found), bool)
        for i, (x, y, dx, dy, *_r) in enumerate(found):
            d = np.hypot(found[:, 0] - x, found[:, 1] - y)
            nb = (d < 3.2 * STEP) & (d > 0)
            if nb.sum() < 3:
                keep[i] = nb.sum() >= 1 and True
                if nb.sum() == 0:
                    keep[i] = False
                    continue
            mdx = np.median(found[nb, 2])
            mdy = np.median(found[nb, 3])
            if math.hypot(dx - mdx, dy - mdy) > 10:
                keep[i] = False
        found = found[keep]
        print(f"  {len(found)} nach Nachbarprüfung", flush=True)
        shift = np.hypot(found[:, 2], found[:, 3]) * RES * math.cos(math.radians(52.3))
        print(
            f"  Versatz Median {np.median(shift):.0f} m, 90 % {np.percentile(shift, 90):.0f} m"
        )

        # Passpunkte: Fenstermitte der Altkarte <-> Lage in der Uraufnahme.
        # Die alte Lage im Raster gehört zum Kartenpixel w.to_px(...), der
        # wahre Ort liegt um (dx, dy) verschoben
        cm = np.column_stack(
            [(gx0 + found[:, 0]) * RES - HALF, HALF - (gy0 + found[:, 1]) * RES]
        )
        pix = w.to_px(cm)
        true = np.column_stack(
            [
                (gx0 + found[:, 0] + found[:, 2]) * RES - HALF,
                HALF - (gy0 + found[:, 1] + found[:, 3]) * RES,
            ]
        )
        lon, lat = unmerc(true[:, 0], true[:, 1])
        auto = [
            {
                "name": f"auto {i}",
                "px": [round(float(x)), round(float(y))],
                "lonlat": [round(float(a), 6), round(float(b), 6)],
                "ncc": round(float(found[i, 4]), 2),
                "auto": True,
            }
            for i, ((x, y), a, b) in enumerate(zip(pix, lon, lat))
        ]
        if only_auto:
            for p in manual:
                p["off"] = True
        raw["gcps"] = manual + auto
        save_spec(map_id, raw)


if __name__ == "__main__":
    main()

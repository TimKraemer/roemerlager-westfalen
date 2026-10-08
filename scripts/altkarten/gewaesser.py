#!/usr/bin/env python3
"""
Gewässer aus Altkarten auslesen, je Karte ein Zeitschnitt, für den Kreis
Minden-Lübbecke. Ergebnis: public/precomputed/gewaesser-zeit.geojson.

Abgelöst durch nachzeichnen.py (Kreiskarten 1843/44), die App liest die
Datei nicht mehr. Die Leitlinien (guide_lines) nutzt nachzeichnen.py weiter.

Vorgehen je Karte:

1. Leitlinien sind die heutigen Flüsse und Bäche aus den OSM-Vektorkacheln
   (Klassen river und stream, dazu benannte Bäche, die OSM als Graben
   führt, ohne Kanäle), je Name zu durchgehenden Linien verbunden.
2. Ein Wasserwert je Pixel der Karte: In der Uraufnahme sind Bäche dünne
   blaugraue Linien, gezählt wird, was bläulicher und dunkler ist als die
   Umgebung (Moore und Wiesen sind flächig grünblau laviert). In der Karte
   des Deutschen Reiches sind Gewässer kräftig blau.
3. Entlang jeder Leitlinie wird in einem Korridor der günstigste Weg durch
   den Wasserwert gesucht, Stück für Stück. So folgt der Weg dem alten Lauf,
   auch wo der Bach heute begradigt ist.
4. Übernommen werden nur Abschnitte, auf denen der Weg deutlich mehr Wasser
   trifft als der Kartengrund daneben. Was die Karte nicht als Gewässer
   zeigt (spätere Gräben, verlegte Bäche), fehlt in diesem Zeitschnitt.

Bäche, die es heute nicht mehr gibt, findet das nicht, sie haben keine
Leitlinie.

  scripts/altkarten/gewaesser.sh [--bbox w s e n] [--quelle ura,kdr1904] [--debug]

Die Uraufnahme kommt vom WMS Geobasis NRW und wird in .cache/ura16
gehalten, die Karte des Deutschen Reiches aus public/altkarten.
"""

import argparse
import gzip
import io
import json
import math
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import mapbox_vector_tile
import numpy as np
from PIL import Image
from scipy import ndimage as nd
from shapely import set_precision
from shapely.geometry import LineString, MultiLineString, shape
from shapely.ops import linemerge, unary_union
from skimage.graph import MCP_Geometric

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CACHE = HERE / ".cache"
OUT = ROOT / "public" / "precomputed" / "gewaesser-zeit.geojson"
KREIS = ROOT / "src" / "data" / "kreis-minden-luebbecke.json"
VECTOR = "https://tiles.erleben.app/germany/{z}/{x}/{y}"
WMS_URA = (
    "https://www.wms.nrw.de/geobasis/wms_nw_uraufnahme?SERVICE=WMS&VERSION=1.3.0"
    "&REQUEST=GetMap&LAYERS=nw_uraufnahme_rw&STYLES=&CRS=EPSG:3857&FORMAT=image/jpeg"
)
HALF = 20037508.342789244
BLOCK = 1024

# Halbe Korridorbreite in Metern: so weit darf der alte Lauf vom heutigen
# abweichen. Flüsse mäandrierten weiter als Bäche.
CORRIDOR_RIVER = 400
CORRIDOR_STREAM = 150
# Länge eines Suchstücks entlang der Leitlinie
PIECE_M = 2500
# Abschnitte für die Bewertung und kürzeste übernommene Länge
JUDGE_M = 200
MIN_RUN_M = 300


def lonlat_to_px(lon, lat, z):
    n = 256 * 2**z
    x = (lon + 180) / 360 * n
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return x, y


def px_to_lonlat(x, y, z):
    n = 256 * 2**z
    lon = x / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lon, lat


# --- Quellen ------------------------------------------------------------------


class Ura:
    """Preußische Uraufnahme 1836–1850, WMS, Zoom 16 (etwa 2,4 m je Pixel)."""

    id = "ura"
    z = 16

    def __init__(self):
        self.dir = CACHE / "ura16"
        self.dir.mkdir(parents=True, exist_ok=True)

    def block(self, bx, by):
        f = self.dir / f"{bx}_{by}.jpg"
        if not f.exists():
            n = 256 * 2**self.z
            mx = lambda px: px / n * 2 * HALF - HALF  # noqa: E731
            my = lambda py: HALF - py / n * 2 * HALF  # noqa: E731
            bbox = f"{mx(bx * BLOCK)},{my((by + 1) * BLOCK)},{mx((bx + 1) * BLOCK)},{my(by * BLOCK)}"
            url = f"{WMS_URA}&BBOX={bbox}&WIDTH={BLOCK}&HEIGHT={BLOCK}"
            for attempt in range(5):
                try:
                    with urllib.request.urlopen(url, timeout=60) as res:
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

    def score(self, rgb):
        """Bläulicher und dunkler als die Umgebung, NaN außerhalb der Blätter."""
        a = nd.uniform_filter(rgb.astype(np.float32), (3, 3, 1))
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        br = b - r
        lum = (r + g + b) / 3
        rel = br - nd.uniform_filter(br, 15)
        dark = nd.uniform_filter(lum, 15) - lum
        s = np.clip(rel / 25, 0, 1) * np.clip(dark / 10 + 0.3, 0, 1)
        # Flächiges Wasser (Weser, Teiche): blassblau, Blau deutlich über Rot
        wide = np.clip((br + 5) / 30, 0, 1) * (lum > 90)
        s = np.maximum(s, nd.uniform_filter(wide, 9) ** 2)
        white = (rgb > 240).all(-1)
        s[white] = np.nan
        return s


class Altkarte:
    """Entzerrte Altkarte aus public/altkarten, Kacheln mit 512 Pixeln."""

    # Gewässer sind kräftig blau und eindeutig: alle Linien, nicht nur
    # entlang heutiger Bäche (extract_free)
    free = True

    def __init__(self, map_id, kz, year):
        self.id = map_id
        self.year = year
        self.kz = kz
        meta = json.loads((ROOT / "public" / "altkarten" / map_id / "meta.json").read_text())
        self.bounds = meta["bounds"]
        # 512er-Kachel auf Stufe kz hat die Auflösung einer 256er auf kz + 1
        self.z = kz + 1
        self.dir = ROOT / "public" / "altkarten" / map_id / str(kz)

    def block(self, bx, by):
        # BLOCK = 1024 Pixel = 2 × 2 Kacheln
        out = np.full((BLOCK, BLOCK, 3), 255, np.uint8)
        for dy in range(2):
            for dx in range(2):
                f = self.dir / str(bx * 2 + dx) / f"{by * 2 + dy}.webp"
                if f.exists():
                    im = Image.open(f).convert("RGBA")
                    a = np.asarray(im)
                    rgb = a[..., :3].copy()
                    rgb[a[..., 3] < 128] = 255
                    out[dy * 512 : dy * 512 + 512, dx * 512 : dx * 512 + 512] = rgb
        return out

    def score(self, rgb):
        """Blau über Rot und Grün: 1, sonst 0, NaN außerhalb der Karte."""
        a = rgb.astype(np.float32)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        s = (b - (r + g) / 2 > 6).astype(np.float32)
        s[(rgb > 240).all(-1)] = np.nan
        return s


SOURCES = {
    "ura": lambda: Ura(),
    "kdr1904": lambda: Altkarte("1904-kdr-luebbecke", 13, 1904),
}
META = {
    "ura": {
        "year": 1840,
        "label": "Preußische Uraufnahme (1836–1850)",
    },
    "kdr1904": {
        "year": 1904,
        "label": "Karte des Deutschen Reiches, Blatt Lübbecke (1904)",
    },
}


class Raster:
    """Wasserwert einer Quelle, blockweise berechnet und zwischengespeichert."""

    def __init__(self, src):
        self.src = src
        self.cache = {}

    def blk(self, bx, by):
        key = (bx, by)
        if key not in self.cache:
            if len(self.cache) > 120:
                self.cache.pop(next(iter(self.cache)))
            rgb = self.src.block(bx, by)
            # Rand von 16 Pixeln aus den Nachbarn wäre genauer, die Filter
            # sind klein genug, dass die Blockkanten kaum stören
            self.cache[key] = self.src.score(rgb)
        return self.cache[key]

    def window(self, x0, y0, x1, y1):
        """Wasserwert im Fenster [x0, x1) × [y0, y1) in Weltpixeln."""
        out = np.full((y1 - y0, x1 - x0), np.nan, np.float32)
        for by in range(y0 // BLOCK, (y1 - 1) // BLOCK + 1):
            for bx in range(x0 // BLOCK, (x1 - 1) // BLOCK + 1):
                b = self.blk(bx, by)
                sx0 = max(x0, bx * BLOCK)
                sy0 = max(y0, by * BLOCK)
                sx1 = min(x1, (bx + 1) * BLOCK)
                sy1 = min(y1, (by + 1) * BLOCK)
                out[sy0 - y0 : sy1 - y0, sx0 - x0 : sx1 - x0] = b[
                    sy0 - by * BLOCK : sy1 - by * BLOCK,
                    sx0 - bx * BLOCK : sx1 - bx * BLOCK,
                ]
        return out

    def prefetch(self, blocks):
        if not hasattr(self.src, "dir") or not isinstance(self.src, Ura):
            return
        todo = [b for b in blocks if not (self.src.dir / f"{b[0]}_{b[1]}.jpg").exists()]
        if not todo:
            return
        print(f"  {len(todo)} Blöcke der Uraufnahme laden", file=sys.stderr)
        with ThreadPoolExecutor(6) as ex:
            list(ex.map(lambda b: self.src.block(*b), todo))


# --- Leitlinien ---------------------------------------------------------------

# Namen, die auf einen angelegten Graben deuten (wie src/lib/water.js)
DITCH_NAME = re.compile(
    r"graben|kanal|vorfluter|abzug|leitung|flut|zuleiter|ableiter|sammler"
    r"|entwässer|entlast|gräfte|wätering|wetter",
    re.I,
)


def natural(props):
    """
    Flüsse und Bäche. In OSM sind viele benannte Bäche des Kreises als
    Graben (ditch, drain) eingetragen, etwa Wickriede, Kleine Wickriede oder
    Uchter Mühlenbach. Sie zählen mit, außer ihr Name sagt Graben oder Kanal.
    """
    cls = props.get("class")
    if cls in ("river", "stream"):
        return True
    name = props.get("name") or ""
    return cls in ("ditch", "drain") and bool(name) and not DITCH_NAME.search(name)



def guide_lines(bbox):
    """Heutige Flüsse und Bäche je Name als verbundene Linien (lon, lat)."""
    z = 13
    w, s, e, n = bbox
    x0, y0 = lonlat_to_px(w, n, z)
    x1, y1 = lonlat_to_px(e, s, z)
    cache = CACHE / "vector13"
    cache.mkdir(parents=True, exist_ok=True)

    def tile(tx, ty):
        f = cache / f"{tx}_{ty}.pbf"
        if not f.exists():
            url = VECTOR.format(z=z, x=tx, y=ty)
            with urllib.request.urlopen(url, timeout=60) as res:
                data = res.read()
            f.write_bytes(data)
        data = f.read_bytes()
        if not data:
            return []
        if data[:2] == b"\x1f\x8b":
            data = gzip.decompress(data)
        d = mapbox_vector_tile.decode(data, default_options={"y_coord_down": True})
        layer = d.get("waterway")
        if not layer:
            return []
        k = 256 / layer["extent"]
        out = []
        for f in layer["features"]:
            p = f["properties"]
            if not natural(p):
                continue
            g = f["geometry"]
            parts = (
                [g["coordinates"]]
                if g["type"] == "LineString"
                else g["coordinates"]
            )
            # Benannte Bäche, die OSM als Graben führt, zählen als Bach
            cls = "river" if p["class"] == "river" else "stream"
            for part in parts:
                pts = [
                    px_to_lonlat(tx * 256 + u * k, ty * 256 + v * k, z)
                    for u, v in part
                ]
                out.append((p.get("name") or "", cls, pts))
        return out

    jobs = [
        (tx, ty)
        for ty in range(int(y0 // 256), int(y1 // 256) + 1)
        for tx in range(int(x0 // 256), int(x1 // 256) + 1)
    ]
    with ThreadPoolExecutor(8) as ex:
        parts = [p for t in ex.map(lambda j: tile(*j), jobs) for p in t]
    by = {}
    for name, cls, pts in parts:
        # Auf etwa 1 m runden, damit sich die Stücke an den Kachelkanten treffen
        pts = [(round(lo, 5), round(la, 5)) for lo, la in pts]
        if len(pts) > 1:
            key = name or f"_{cls}"
            by.setdefault(key, {"cls": set(), "lines": []})
            by[key]["cls"].add(cls)
            by[key]["lines"].append(LineString(pts))
    out = []
    for name, v in by.items():
        # Auf etwa 4 m einrasten: die Stücke überlappen an den Kachelkanten
        merged = set_precision(unary_union(v["lines"]), 5e-5)
        if not isinstance(merged, LineString):
            merged = linemerge(merged)
        geoms = merged.geoms if isinstance(merged, MultiLineString) else [merged]
        kind = "river" if "river" in v["cls"] else "stream"
        for g in geoms:
            # unbenannte Stücke unter 1 km sind meist Gräben mit falscher Klasse
            if not name.startswith("_") or g.length > 0.012:
                out.append(
                    {
                        "name": "" if name.startswith("_") else name,
                        "kind": kind,
                        "coords": list(g.coords),
                    }
                )
    return out


# --- Suche --------------------------------------------------------------------


def densify(px, step):
    out = [px[0]]
    for a, b in zip(px, px[1:]):
        d = math.dist(a, b)
        k = max(1, int(d / step))
        for i in range(1, k + 1):
            out.append((a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k))
    return out


def trace(raster, line, mpp, corridor_m):
    """
    Günstigster Weg entlang einer Leitlinie (Weltpixel). Liefert die
    Pixel des Wegs und je Pixel den Wasserwert sowie den Grundwert der
    Umgebung.
    """
    corridor = corridor_m / mpp
    pts = densify(line, 2)
    piece = max(50, int(PIECE_M / mpp / 2))
    path_all = []
    start = None
    for i0 in range(0, len(pts) - 1, piece):
        seg = pts[i0 : min(len(pts), i0 + piece + 1)]
        if len(seg) < 2:
            break
        xs = [p[0] for p in seg]
        ys = [p[1] for p in seg]
        pad = corridor + 6
        x0 = int(min(xs) - pad)
        y0 = int(min(ys) - pad)
        x1 = int(max(xs) + pad) + 1
        y1 = int(max(ys) + pad) + 1
        score = raster.window(x0, y0, x1, y1)
        H, W = score.shape
        mask = np.zeros((H, W), bool)
        for x, y in seg[::2]:
            mask[int(y - y0), int(x - x0)] = True
        dist = nd.distance_transform_edt(~mask)
        inside = dist <= corridor
        s = np.nan_to_num(score, nan=0.0)
        cost = 1 + 60 * (1 - s) ** 2
        # leicht zur Leitlinie ziehen, damit der Weg in leeren Stücken nicht irrt
        cost += 4 * (dist / corridor) ** 2
        cost[~inside] = np.inf
        if start is None:
            sx, sy = seg[0]
            start = (int(sy - y0), int(sx - x0))
        else:
            start = (start[0] - y0, start[1] - x0)
        ex, ey = seg[-1]
        # Ziel: bester Wasserwert auf dem Querschnitt am Ende der Leitlinie
        end_mask = np.zeros((H, W), bool)
        end_mask[int(ey - y0), int(ex - x0)] = True
        near_end = nd.distance_transform_edt(~end_mask) <= corridor
        cand = np.where(near_end & inside, s, -1)
        # nur Pixel, die näher am Ende als am Anfang des Stücks liegen
        ey_i, ex_i = np.unravel_index(np.argmax(cand), cand.shape)
        if cand[ey_i, ex_i] < 0.3:
            ey_i, ex_i = int(ey - y0), int(ex - x0)
        if not (0 <= start[0] < H and 0 <= start[1] < W) or not np.isfinite(
            cost[start]
        ):
            sx, sy = seg[0]
            start = (int(sy - y0), int(sx - x0))
            cost[start] = 60
        mcp = MCP_Geometric(cost)
        mcp.find_costs([start], [(ey_i, ex_i)])
        try:
            path = mcp.traceback((ey_i, ex_i))
        except ValueError:
            path = [start, (ey_i, ex_i)]
        bg = nd.uniform_filter(np.where(inside, s, 0), 61) / np.maximum(
            nd.uniform_filter(inside.astype(np.float32), 61), 1e-3
        )
        for k, (py, px) in enumerate(path):
            if path_all and k == 0:
                continue
            v = score[py, px]
            path_all.append((px + x0, py + y0, float(v), float(bg[py, px])))
        last = path[-1]
        start = (last[0] + y0, last[1] + x0)
    return path_all


def judge(path, mpp):
    """
    Abschnitte, auf denen der Weg Wasser trifft. Je Stück von JUDGE_M Metern:
    mittlerer Wasserwert deutlich über dem Grund und genügend Treffer.
    """
    n = len(path)
    if n < 2:
        return []
    step = max(5, int(JUDGE_M / mpp))
    ok = np.zeros(n, bool)
    known = np.zeros(n, bool)
    for i in range(0, n, step):
        chunk = path[i : i + step]
        vals = np.array([c[2] for c in chunk])
        bgs = np.array([c[3] for c in chunk])
        valid = ~np.isnan(vals)
        if valid.sum() < len(chunk) / 2:
            continue
        known[i : i + step] = True
        v = vals[valid]
        hit = (v > 0.35).mean()
        ok[i : i + step] = hit > 0.45 and v.mean() > bgs[valid].mean() * 1.8 + 0.08
    # Lücken von einem Stück zwischen zwei belegten schließen (Schrift, Brücken)
    runs = []
    i = 0
    while i < n:
        if not ok[i]:
            i += 1
            continue
        j = i
        while j < n and (ok[j] or (j + step < n and ok[min(n - 1, j + step)] and not ok[j] and known[j])):
            j += 1
        runs.append((i, j))
        i = j
    # Kurze Stücke zwischen zwei Mündungen dürfen ganz belegt sein
    min_px = min(MIN_RUN_M / mpp, n * 0.8)
    return [(a, b) for a, b in runs if b - a >= min_px]


def simplify_px(coords, tol):
    if len(coords) < 3:
        return coords
    return list(LineString(coords).simplify(tol).coords)


def smooth(coords, r=3):
    out = []
    n = len(coords)
    for i in range(n):
        a = max(0, i - r)
        b = min(n, i + r + 1)
        xs = [c[0] for c in coords[a:b]]
        ys = [c[1] for c in coords[a:b]]
        out.append((sum(xs) / len(xs), sum(ys) / len(ys)))
    return out


def line_elements(half):
    """Strichförmige Strukturelemente der Länge 2·half+1 in zwölf Richtungen."""
    from skimage.draw import line

    out = []
    for k in range(12):
        t = math.pi * k / 12
        se = np.zeros((2 * half + 1, 2 * half + 1), bool)
        rr, cc = line(
            round(half - half * math.sin(t)),
            round(half - half * math.cos(t)),
            round(half + half * math.sin(t)),
            round(half + half * math.cos(t)),
        )
        se[rr, cc] = True
        out.append(se)
    return out


def extract_free(src, guides, bbox, args):
    """
    Alle blauen Linien einer Karte, ohne Leitlinie: Maske, kleine Lücken
    schließen, auf Mittellinien ausdünnen, als Linien ablesen. Linien in
    der Nähe eines heutigen Gewässers bekommen dessen Namen, die übrigen
    gelten als Graben.
    """
    from skan import Skeleton
    from skimage.morphology import remove_small_objects, skeletonize

    raster = Raster(src)
    z = src.z
    mpp = 156543.03392 * math.cos(math.radians(52.3)) / 2**z
    w, s, e, n = bbox
    if getattr(src, "bounds", None):
        bw, bs, be, bn = src.bounds
        w, s, e, n = max(w, bw), max(s, bs), min(e, be), min(n, bn)
    x0, y0 = map(int, lonlat_to_px(w, n, z))
    x1, y1 = map(int, lonlat_to_px(e, s, z))
    score = np.nan_to_num(raster.window(x0, y0, x1, y1))
    # Die Linien sind gedruckt oft unterbrochen. Lücken werden nur in
    # Richtung der Linie geschlossen: Je Richtung bleiben die Striche, die in
    # diese Richtung laufen (Öffnen mit kurzem Strich), und werden mit einem
    # langen Strich derselben Richtung verbunden. So wachsen parallele Gräben
    # der Moorkolonien (50 m Abstand, 8 Pixel) nicht zusammen. Längere
    # Striche machen aus der Punktsignatur der Moore Linien.
    mask = score > 0.5
    joined = mask.copy()
    for short, long in zip(line_elements(2), line_elements(8)):
        joined |= nd.binary_closing(nd.binary_opening(mask, short), long)
    # Übrig gebliebene Flecken (Moorsignatur, Schrift)
    mask = remove_small_objects(joined, max_size=20)
    skel = remove_small_objects(skeletonize(mask), max_size=12, connectivity=2)
    lines = []
    if skel.any():
        sk = Skeleton(skel)
        for i in range(sk.n_paths):
            c = sk.path_coordinates(i)
            if len(c) < 2:
                continue
            lines.append(LineString([(x + x0, y + y0) for y, x in c]))
    merged = linemerge(unary_union(lines)) if lines else None
    geoms = (
        []
        if merged is None
        else merged.geoms
        if isinstance(merged, MultiLineString)
        else [merged]
    )
    # Zusammenhängende Netze unter MIN_RUN_M fallen weg (Schrift, Teiche)
    comps = unary_union(list(geoms)).buffer(1)
    comps = comps.geoms if hasattr(comps, "geoms") else [comps]
    keep = [c for c in comps if c.length / 2 > MIN_RUN_M / mpp]
    keep_u = unary_union(keep) if keep else None
    guide_px = [
        (g, LineString([lonlat_to_px(lo, la, z) for lo, la in g["coords"]]))
        for g in guides
    ]
    out = []
    for ln in geoms:
        if keep_u is None or not ln.intersects(keep_u):
            continue
        if ln.length * mpp < 40:
            continue
        # Pixeltreppe der Mittellinie glätten, Gräben sind meist gerade
        ln = LineString(smooth(list(ln.coords), 3)).simplify(7 / mpp)
        name, kind = "", "graben"
        mid = ln.interpolate(0.5, normalized=True)
        best = None
        for g, gl in guide_px:
            d = gl.distance(mid)
            if d * mpp < 120 and (best is None or d < best[0]):
                best = (d, g)
        if best:
            name, kind = best[1]["name"], best[1]["kind"]
        coords = [px_to_lonlat(x, y, z) for x, y in ln.coords]
        out.append(
            {
                "name": name,
                "kind": kind,
                "coords": [[round(lo, 5), round(la, 5)] for lo, la in coords],
            }
        )
    if args.debug:
        debug_image(raster, guides, out, z, args.bbox, src.id)
    return out


def run(source_id, guides, args):
    src = SOURCES[source_id]()
    if getattr(src, "free", False):
        return extract_free(src, guides, args.bbox, args)
    raster = Raster(src)
    z = src.z
    lat = 52.3
    mpp = 156543.03392 * math.cos(math.radians(lat)) / 2**z
    # Blöcke vorab laden, die eine Leitlinie berühren
    blocks = set()
    for g in guides:
        for lo, la in g["coords"]:
            x, y = lonlat_to_px(lo, la, z)
            r = (CORRIDOR_RIVER if g["kind"] == "river" else CORRIDOR_STREAM) / mpp
            for dx in (-r, 0, r):
                for dy in (-r, 0, r):
                    blocks.add((int((x + dx) // BLOCK), int((y + dy) // BLOCK)))
    raster.prefetch(sorted(blocks))
    lines = []
    for k, g in enumerate(guides):
        px = [lonlat_to_px(lo, la, z) for lo, la in g["coords"]]
        corridor = CORRIDOR_RIVER if g["kind"] == "river" else CORRIDOR_STREAM
        path = trace(raster, px, mpp, corridor)
        for a, b in judge(path, mpp):
            pts = smooth([(p[0], p[1]) for p in path[a:b]])
            pts = simplify_px(pts, 3 / mpp)
            ll = [px_to_lonlat(x, y, z) for x, y in pts]
            lines.append(
                {
                    "name": g["name"],
                    "kind": g["kind"],
                    "coords": [[round(lo, 5), round(la, 5)] for lo, la in ll],
                }
            )
        if args.debug:
            found = sum(b - a for a, b in judge(path, mpp))
            print(
                f"  {g['name'] or '(ohne Namen)'}: {len(path) * mpp / 1000:.1f} km Weg, "
                f"{found * mpp / 1000:.1f} km belegt",
                file=sys.stderr,
            )
        elif k % 20 == 0:
            print(f"  {source_id} {k + 1}/{len(guides)}", file=sys.stderr)
    if args.debug:
        debug_image(raster, guides, lines, z, args.bbox, source_id)
    return lines


def debug_image(raster, guides, lines, z, bbox, source_id):
    from PIL import ImageDraw

    w, s, e, n = bbox
    x0, y0 = map(int, lonlat_to_px(w, n, z))
    x1, y1 = map(int, lonlat_to_px(e, s, z))
    if (x1 - x0) * (y1 - y0) > 6000 * 6000:
        return
    sc = raster.window(x0, y0, x1, y1)
    img = Image.fromarray((np.nan_to_num(sc) * 160).astype(np.uint8)).convert("RGB")
    d = ImageDraw.Draw(img)
    for g in guides:
        pts = [tuple(np.subtract(lonlat_to_px(*c, z), (x0, y0))) for c in g["coords"]]
        d.line(pts, fill=(80, 80, 255), width=1)
    for ln in lines:
        pts = [tuple(np.subtract(lonlat_to_px(*c, z), (x0, y0))) for c in ln["coords"]]
        d.line(pts, fill=(255, 60, 60), width=3)
    f = CACHE / f"gewaesser-{source_id}.png"
    img.save(f)
    print(f"  Prüfbild {f}", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", nargs=4, type=float)
    ap.add_argument("--quelle", default=",".join(SOURCES))
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    kreis = shape(json.loads(KREIS.read_text())["features"][0]["geometry"])
    if not args.bbox:
        args.bbox = [round(v, 3) for v in kreis.buffer(0.01).bounds]
    print("Leitlinien laden", file=sys.stderr)
    guides = guide_lines(args.bbox)
    area = kreis.buffer(0.01)
    guides = [g for g in guides if LineString(g["coords"]).intersects(area)]
    print(f"  {len(guides)} Linien", file=sys.stderr)
    # Andere Zeitschnitte aus dem vorigen Lauf bleiben erhalten
    prev = json.loads(OUT.read_text()) if OUT.exists() else {"slices": [], "features": []}
    slices = {s["id"]: s for s in prev["slices"]}
    features = {}
    for f in prev["features"]:
        features.setdefault(f["properties"]["slice"], []).append(f)
    for sid in args.quelle.split(","):
        t = time.time()
        lines = run(sid, guides, args)
        km = sum(LineString(ln["coords"]).length * 111 * 0.62 for ln in lines)
        print(f"{sid}: {len(lines)} Linien, etwa {km:.0f} km, {time.time() - t:.0f} s", file=sys.stderr)
        slices[sid] = {"id": sid, **META[sid], "km": round(km)}
        features[sid] = [to_feature(sid, ln) for ln in lines]
    out = {
        "type": "FeatureCollection",
        "slices": sorted(slices.values(), key=lambda s: s["year"]),
        "features": [f for sid in sorted(features) for f in features[sid]],
    }
    if not args.dry:
        OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")


def to_feature(sid, ln):
    props = {"slice": sid, "kind": ln["kind"]}
    if ln["name"]:
        props["name"] = ln["name"]
    return {
        "type": "Feature",
        "properties": props,
        "geometry": {"type": "LineString", "coordinates": ln["coords"]},
    }


if __name__ == "__main__":
    main()

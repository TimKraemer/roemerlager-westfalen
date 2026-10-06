#!/usr/bin/env python3
"""
Moore und nasse Flächen je Stand des Zeitstrahls, für den Kreis
Minden-Lübbecke und seine Ränder. Ergebnis: public/precomputed/moor-zeit.geojson
für die Ebene „Moore und nasse Flächen“.

Nur amtliche Daten, keine Erkennung in den Altkarten (die Moorsignatur der
Karte des Deutschen Reiches ist ein blasser Blauschleier, die Uraufnahme ist
je Blatt anders koloriert, beides ließ sich nicht verlässlich trennen):

- Stand "boden": Moorböden nach der Bodenkarte. NRW: BK50, Ebene Bodentyp,
  Hochmoor und Niedermoor (eigene Gelbgrüntöne, wie src/lib/moor.js).
  Niedersachsen: GUM50, ursprüngliche Moorverbreitung vor der Kultivierung.
  Torfkörper im Boden zeigen, wo Moor war, auch wenn es heute entwässert
  und kultiviert ist. Abgetorfte Flächen fehlen darin teils.
- Stand "ura": Überschwemmungsgebiete nach der preußischen Aufnahme
  (Land NRW, Dienst uesg, Ebene 4). Der Dienst zeichnet sie schraffiert mit
  Umriss, gefüllt wird über die geschlossenen Umrisse.

Heutige Feuchtgebiete kommen in der App direkt aus den OSM-Vektorkacheln.

  scripts/altkarten/moor.sh [--quelle boden,ura] [--debug]
"""

import argparse
import io
import json
import math
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
import rasterio.features
from affine import Affine
from PIL import Image
from scipy import ndimage as nd
from shapely.geometry import mapping, shape
from shapely.ops import transform, unary_union
from skimage.morphology import disk, remove_small_holes, remove_small_objects

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CACHE = HERE / ".cache" / "moor"
OUT = ROOT / "public" / "precomputed" / "moor-zeit.geojson"
KREIS = ROOT / "src" / "data" / "kreis-minden-luebbecke.json"
HALF = 20037508.342789244

BK50 = (
    "https://www.wms.nrw.de/gd/bk050?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0"
    "&LAYERS=Bodentyp&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857"
)
GUM50 = (
    "https://nibis.lbeg.de/net3/public/ogc.ashx?PkgId=22&SERVICE=WMS&REQUEST=GetMap"
    "&VERSION=1.3.0&LAYERS=L112&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857"
)
UESG = (
    "https://www.wms.nrw.de/umwelt/wasser/uesg?SERVICE=WMS&VERSION=1.3.0"
    "&REQUEST=GetMap&LAYERS=4&STYLES=&CRS=EPSG:3857&FORMAT=image/png&TRANSPARENT=true"
)
# Rasterweite in Mercator-Metern (bei 52° rund 9 m am Boden). GUM50
# zeichnet erst unterhalb von 1:167 410, das liegt weit darunter.
RES = 15
CHUNK = 1500

SLICES = {
    "boden": {
        "year": 0,
        "label": "Moorböden (BK50 NRW, GUM50 Niedersachsen)",
    },
    "ura": {
        "year": 1840,
        "label": "Überschwemmungsgebiete nach der preußischen Aufnahme",
    },
}


def merc(lon, lat):
    x = math.radians(lon) * 6378137
    y = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * 6378137
    return x, y


def unmerc(x, y):
    lon = math.degrees(x / 6378137)
    lat = math.degrees(2 * math.atan(math.exp(y / 6378137)) - math.pi / 2)
    return lon, lat


def fetch(base, bbox, w, h, name):
    """WMS-Bild als RGBA-Array, auf der Platte zwischengespeichert."""
    f = CACHE / f"{name}.png"
    if not f.exists():
        url = f"{base}&BBOX={','.join(map(str, bbox))}&WIDTH={w}&HEIGHT={h}"
        for attempt in range(5):
            try:
                with urllib.request.urlopen(url, timeout=120) as res:
                    data = res.read()
                    if "image" not in res.headers.get("content-type", ""):
                        raise OSError(data[:200])
                f.write_bytes(data)
                break
            except OSError as e:
                if attempt == 4:
                    raise
                print(f"  {name}: {e}, neuer Versuch", file=sys.stderr)
                time.sleep(3 * (attempt + 1))
    return np.asarray(Image.open(f).convert("RGBA"))


def mosaic(base, key, extent):
    """Ganzer Ausschnitt in Teilbildern zu höchstens CHUNK Pixeln."""
    x0, y0, x1, y1 = extent
    W = int(math.ceil((x1 - x0) / RES))
    H = int(math.ceil((y1 - y0) / RES))
    out = np.zeros((H, W, 4), np.uint8)
    for r0 in range(0, H, CHUNK):
        for c0 in range(0, W, CHUNK):
            w = min(CHUNK, W - c0)
            h = min(CHUNK, H - r0)
            bbox = [
                x0 + c0 * RES,
                y1 - (r0 + h) * RES,
                x0 + (c0 + w) * RES,
                y1 - r0 * RES,
            ]
            out[r0 : r0 + h, c0 : c0 + w] = fetch(base, bbox, w, h, f"{key}_{r0}_{c0}")
    return out


def polygons(mask, extent, min_ha, tol_m):
    """Maske als Polygone in WGS84, vereinfacht, kleine Flächen weg."""
    x0, _, _, y1 = extent
    tr = Affine(RES, 0, x0, 0, -RES, y1)
    geoms = [
        shape(g)
        for g, v in rasterio.features.shapes(mask.astype(np.uint8), mask=mask, transform=tr)
        if v
    ]
    # Mercator-Fläche ist bei 52° etwa 2,66-mal zu groß
    k = math.cos(math.radians(52.3)) ** 2
    out = []
    for g in geoms:
        g = g.simplify(tol_m / math.cos(math.radians(52.3)))
        if g.is_empty or g.area * k < min_ha * 10000:
            continue
        out.append(transform(lambda x, y, z=None: unmerc_arr(x, y), g))
    return out


def unmerc_arr(x, y):
    x = np.asarray(x)
    y = np.asarray(y)
    lon = np.degrees(x / 6378137)
    lat = np.degrees(2 * np.arctan(np.exp(y / 6378137)) - math.pi / 2)
    return np.round(lon, 5), np.round(lat, 5)


def soils(extent, args):
    """Hoch- und Niedermoor nach BK50, außerhalb NRW nach GUM50."""
    nrw = mosaic(BK50, "bk50", extent).astype(int)
    r, g, b, a = nrw[..., 0], nrw[..., 1], nrw[..., 2], nrw[..., 3]
    # Farbtöne der BK50-Legende, mit etwas Spiel für die Kantenglättung.
    # Hochmoor samt Deck- und Fehnkultur und Tiefumbruch, Niedermoor samt
    # Erdniedermoor, Deckkultur und Übergangsmoor; schraffierte Klassen
    # schließt das Schließen unten.
    near = lambda c: (  # noqa: E731
        (a > 0) & (abs(r - c[0]) < 14) & (abs(g - c[1]) < 10) & (abs(b - c[2]) < 18)
    )
    hoch = near((217, 255, 128))
    nieder = near((178, 255, 115))
    # GUM50: Geest-, Kleinst- und Talhochmoor, Niedermoor (Legende L112);
    # „keine Moorbedeckung“ ist halbtransparentes Weiß und zählt nicht
    ni = mosaic(GUM50, "gum50", extent).astype(int)
    gum = lambda c: (  # noqa: E731
        (ni[..., 3] > 100)
        & (abs(ni[..., 0] - c[0]) < 8)
        & (abs(ni[..., 1] - c[1]) < 8)
        & (abs(ni[..., 2] - c[2]) < 8)
    )
    # außerhalb NRW: BK50 leer oder weiß („nicht kartiert“)
    outside = (a == 0) | ((r > 250) & (g > 250) & (b > 250))
    hoch |= outside & (
        gum((241, 203, 165)) | gum((216, 165, 165)) | gum((216, 254, 165))
    )
    nieder |= outside & gum((152, 254, 165))
    out = []
    for kind, m in (("hochmoor", hoch), ("niedermoor", nieder)):
        m = nd.binary_closing(m, disk(2))
        m = remove_small_holes(remove_small_objects(m, max_size=40), max_size=200)
        for p in polygons(m, extent, 1, 12):
            out.append((kind, p))
        if args.debug:
            Image.fromarray((m * 255).astype(np.uint8)).save(CACHE / f"dbg-{kind}.png")
    return out


def floodplains(extent, args):
    """Umrisse der Überschwemmungsgebiete füllen."""
    img = mosaic(UESG, "uesg4", extent)
    drawn = img[..., 3] > 0
    # Schraffur und Umriss verbinden, Innenflächen füllen
    closed = nd.binary_closing(drawn, disk(2))
    filled = nd.binary_fill_holes(closed)
    filled = nd.binary_opening(filled, disk(1))
    if args.debug:
        Image.fromarray((filled * 255).astype(np.uint8)).save(CACHE / "dbg-uesg.png")
    return [("nass", p) for p in polygons(filled, extent, 0.5, 8)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quelle", default=",".join(SLICES))
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    kreis = shape(json.loads(KREIS.read_text())["features"][0]["geometry"])
    w, s, e, n = kreis.buffer(0.03).bounds
    x0, y0 = merc(w, s)
    x1, y1 = merc(e, n)
    extent = (x0, y0, x1, y1)
    prev = json.loads(OUT.read_text()) if OUT.exists() else {"slices": [], "features": []}
    slices = {s["id"]: s for s in prev["slices"]}
    features = {}
    for f in prev["features"]:
        features.setdefault(f["properties"]["slice"], []).append(f)
    for sid in args.quelle.split(","):
        t = time.time()
        found = soils(extent, args) if sid == "boden" else floodplains(extent, args)
        features[sid] = [
            {
                "type": "Feature",
                "properties": {"slice": sid, "kind": kind},
                "geometry": mapping(p),
            }
            for kind, p in found
        ]
        k = math.cos(math.radians(52.3)) ** 2
        ha = sum(merc_area(p) for _, p in found) * k / 10000
        print(f"{sid}: {len(found)} Flächen, etwa {ha:.0f} ha, {time.time() - t:.0f} s", file=sys.stderr)
        slices[sid] = {"id": sid, **SLICES[sid]}
    out = {
        "type": "FeatureCollection",
        "slices": sorted(slices.values(), key=lambda s: s["year"]),
        "features": [f for sid in sorted(features) for f in features[sid]],
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")


def merc_area(p):
    return transform(lambda x, y, z=None: merc_arr(x, y), p).area


def merc_arr(x, y):
    x = np.asarray(x)
    y = np.asarray(y)
    return np.radians(x) * 6378137, np.log(np.tan(np.pi / 4 + np.radians(y) / 2)) * 6378137


if __name__ == "__main__":
    main()

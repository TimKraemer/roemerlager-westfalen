#!/usr/bin/env python3
"""
Hauptwege um 1840 für den Zeitstrahl, Kreis Minden-Lübbecke. Ergebnis:
public/precomputed/wege-zeit.geojson für die Ebene „Hauptwege“.

Wie bei den Bächen (gewaesser.py): Leitlinien sind die heutigen Bundes-,
Landes- und Kreisstraßen aus den OSM-Vektorkacheln (trunk, primary,
secondary, tertiary). Entlang jeder Leitlinie sucht das Skript in einem
Korridor den günstigsten Weg über die Wege der Uraufnahme und übernimmt nur
Abschnitte, auf denen die Karte deutlich einen Weg zeigt. Wege sind in der
Uraufnahme braun bis rot gezogen, Chausseen doppelt; gezählt wird, was
wärmer (Rot über Blau) und dunkler ist als die Umgebung, unabhängig davon,
wie das Blatt koloriert und vergilbt ist.

Ergebnis: welche heutigen Hauptstraßen es um 1840 schon als Weg gab, und
wo der alte Weg im Korridor anders verlief. Wege, die es heute nicht mehr
gibt, fehlen. Feldgrenzen und Gräben können entlang einer Straße als Weg
durchgehen.

  scripts/altkarten/wege.sh [--bbox w s e n] [--debug] [--dry]
"""

import argparse
import gzip
import json
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import mapbox_vector_tile
import numpy as np
from scipy import ndimage as nd
from shapely import set_precision
from shapely.geometry import LineString, MultiLineString, shape
from shapely.ops import linemerge, unary_union

import gewaesser as G

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "public" / "precomputed" / "wege-zeit.geojson"
CLASSES = ("trunk", "primary", "secondary", "tertiary")
CORRIDOR_M = 120


class UraWege(G.Ura):
    """Uraufnahme mit einem Wegwert statt des Wasserwerts."""

    id = "ura-wege"

    def score(self, rgb):
        a = nd.uniform_filter(rgb.astype(np.float32), (3, 3, 1))
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        warm = r - b
        lum = (r + g + b) / 3
        rel = warm - nd.uniform_filter(warm, 21)
        dark = nd.uniform_filter(lum, 21) - lum
        s = np.clip(rel / 30, 0, 1) * np.clip(dark / 15 + 0.3, 0, 1)
        s[(rgb > 240).all(-1)] = np.nan
        return s


def guide_roads(bbox):
    """Heutige Hauptstraßen als verbundene Linien (lon, lat)."""
    z = 13
    w, s, e, n = bbox
    x0, y0 = G.lonlat_to_px(w, n, z)
    x1, y1 = G.lonlat_to_px(e, s, z)
    cache = G.CACHE / "vector13"
    cache.mkdir(parents=True, exist_ok=True)

    def tile(tx, ty):
        f = cache / f"{tx}_{ty}.pbf"
        if not f.exists():
            with urllib.request.urlopen(G.VECTOR.format(z=z, x=tx, y=ty), timeout=60) as res:
                f.write_bytes(res.read())
        data = f.read_bytes()
        if not data:
            return []
        if data[:2] == b"\x1f\x8b":
            data = gzip.decompress(data)
        layer = mapbox_vector_tile.decode(
            data, default_options={"y_coord_down": True}
        ).get("transportation")
        if not layer:
            return []
        k = 256 / layer["extent"]
        out = []
        for f in layer["features"]:
            p = f["properties"]
            if p.get("class") not in CLASSES or p.get("brunnel") == "tunnel":
                continue
            geom = f["geometry"]
            parts = [geom["coordinates"]] if geom["type"] == "LineString" else geom["coordinates"]
            for part in parts:
                pts = [
                    (
                        round(lo, 5),
                        round(la, 5),
                    )
                    for lo, la in (
                        G.px_to_lonlat(tx * 256 + u * k, ty * 256 + v * k, z)
                        for u, v in part
                    )
                ]
                if len(pts) > 1:
                    out.append(LineString(pts))
        return out

    jobs = [
        (tx, ty)
        for ty in range(int(y0 // 256), int(y1 // 256) + 1)
        for tx in range(int(x0 // 256), int(x1 // 256) + 1)
    ]
    with ThreadPoolExecutor(8) as ex:
        lines = [ln for t in ex.map(lambda j: tile(*j), jobs) for ln in t]
    merged = set_precision(unary_union(lines), 5e-5)
    if not isinstance(merged, LineString):
        merged = linemerge(merged)
    geoms = merged.geoms if isinstance(merged, MultiLineString) else [merged]
    # Stummel unter 300 m sind Anschlüsse und Kreuzungsäste
    return [
        {"name": "", "kind": "road", "coords": list(g.coords)}
        for g in geoms
        if g.length > 0.004
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", nargs=4, type=float)
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    kreis = shape(json.loads(G.KREIS.read_text())["features"][0]["geometry"])
    if not args.bbox:
        args.bbox = [round(v, 3) for v in kreis.buffer(0.01).bounds]
    print("Leitlinien laden", file=sys.stderr)
    guides = guide_roads(args.bbox)
    area = kreis.buffer(0.01)
    guides = [g for g in guides if LineString(g["coords"]).intersects(area)]
    print(f"  {len(guides)} Linien", file=sys.stderr)
    # Die Suche aus gewaesser.py mit dem Wegwert und schmalerem Korridor
    G.SOURCES["ura-wege"] = UraWege
    G.CORRIDOR_STREAM = CORRIDOR_M
    G.META["ura-wege"] = G.META["ura"]
    t = time.time()
    lines = G.run("ura-wege", guides, args)
    km = sum(LineString(ln["coords"]).length * 111 * 0.62 for ln in lines)
    print(f"ura: {len(lines)} Linien, etwa {km:.0f} km, {time.time() - t:.0f} s", file=sys.stderr)
    out = {
        "type": "FeatureCollection",
        "slices": [
            {
                "id": "ura",
                "year": 1840,
                "label": "Hauptwege der Preußischen Uraufnahme entlang heutiger Straßen",
                "km": round(km),
            }
        ],
        "features": [
            {
                "type": "Feature",
                "properties": {"slice": "ura", "kind": "weg"},
                "geometry": {"type": "LineString", "coordinates": ln["coords"]},
            }
            for ln in lines
        ],
    }
    if not args.dry:
        OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()

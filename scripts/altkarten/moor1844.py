#!/usr/bin/env python3
"""
Moor- und Bruchflächen der Kreiskarte Lübbecke 1844 als GeoJSON.

Die Umrisse stehen in Bildpixeln in scripts/altkarten/moor/<karte>.json und
werden über die Passpunkte derselben Karte (gcp/<karte>.json, Warp aus
alt.py) auf Länge/Breite gezogen. Ergebnis: public/precomputed/moor-1844.geojson,
das Potenzialmodell zieht diese Flächen wie Moorböden der BK50 ab.

  uv run --with numpy --with scipy --with pillow --with pyproj \\
      python scripts/altkarten/moor1844.py
"""

import json
import math
from pathlib import Path

import numpy as np

import alt

HERE = Path(__file__).resolve().parent
SRC = HERE / "moor" / "1844-kreis-luebbecke.json"
OUT = alt.ROOT / "public" / "precomputed" / "moor-1844.geojson"
QUELLE = json.loads((alt.ROOT / "src" / "data" / "altkarten-quellen.json").read_text())[
    "1844-kreis-luebbecke"
][0]
# Kanten vor dem Verzerren unterteilen, die Spline ist nicht linear
STEP_PX = 25


def densify(ring):
    out = []
    for a, b in zip(ring, ring[1:] + ring[:1]):
        n = max(1, math.ceil(math.dist(a, b) / STEP_PX))
        for k in range(n):
            t = k / n
            out.append([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    return out


def main():
    src = json.loads(SRC.read_text())
    spec = alt.load_spec(src["map"])
    warp = alt.Warp(spec)
    features = []
    for p in src["polys"]:
        mm = warp.to_merc(np.array(densify(p["px"]), float))
        lon, lat = alt.unmerc(mm[:, 0], mm[:, 1])
        ring = [[round(float(x), 5), round(float(y), 5)] for x, y in zip(lon, lat)]
        ring.append(ring[0])
        features.append(
            {
                "type": "Feature",
                "properties": {"name": p["name"], "kind": p["kind"], "slice": "1844"},
                "geometry": {"type": "Polygon", "coordinates": [ring]},
            }
        )
    out = {
        "type": "FeatureCollection",
        "source": spec["title"],
        "accuracy": spec.get("accuracy"),
        "archive": QUELLE["label"],
        "license": QUELLE["license"],
        "note": src["note"],
        "features": features,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"{OUT.relative_to(alt.ROOT)}: {len(features)} Flächen")


if __name__ == "__main__":
    main()

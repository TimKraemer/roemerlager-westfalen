#!/usr/bin/env python3
"""
Wald um 1840 für die Ebene „Wald“ des Zeitstrahls: Waldflächen in NRW
während der Preußischen Uraufnahme (Landesamt für Natur, Umwelt und Klima
NRW, Open Data), auf den Kreis Minden-Lübbecke mit Rand zugeschnitten.
Ergebnis: public/precomputed/wald-zeit.geojson. Heutiger Wald kommt in der
App direkt aus den OSM-Vektorkacheln.

  scripts/altkarten/wald.sh
"""

import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

import geopandas as gpd
from shapely.geometry import box, shape

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CACHE = HERE / ".cache" / "landschaft"
OUT = ROOT / "public" / "precomputed" / "wald-zeit.geojson"
KREIS = ROOT / "src" / "data" / "kreis-minden-luebbecke.json"
URL = (
    "https://www.opengeodata.nrw.de/produkte/umwelt_klima/wald_forst/wald-uraufnahme/"
    "Preuss-Uraufnahme-Wald-in-NRW_EPSG25832_GeoPackage.zip"
)


def load():
    gpkg = next(CACHE.glob("*.gpkg"), None)
    if not gpkg:
        CACHE.mkdir(parents=True, exist_ok=True)
        print("Waldflächen der Uraufnahme laden", file=sys.stderr)
        with urllib.request.urlopen(URL, timeout=300) as res:
            zipfile.ZipFile(io.BytesIO(res.read())).extractall(CACHE)
        gpkg = next(CACHE.glob("*.gpkg"))
    return gpd.read_file(gpkg)


def main():
    kreis = shape(json.loads(KREIS.read_text())["features"][0]["geometry"])
    area = box(*kreis.buffer(0.03).bounds)
    wald = load()
    clip = gpd.GeoSeries([area], crs="EPSG:4326").to_crs(wald.crs).iloc[0]
    wald = wald[wald.intersects(clip)].copy()
    wald["geometry"] = wald.geometry.intersection(clip).simplify(4)
    wald = wald[~wald.geometry.is_empty].to_crs("EPSG:4326")
    features = []
    for g in wald.geometry:
        geo = json.loads(gpd.GeoSeries([g]).to_json())["features"][0]["geometry"]
        features.append(
            {
                "type": "Feature",
                "properties": {"slice": "ura", "kind": "wald"},
                "geometry": round_coords(geo),
            }
        )
    out = {
        "type": "FeatureCollection",
        "slices": [
            {
                "id": "ura",
                "year": 1840,
                "label": "Waldflächen während der Preußischen Uraufnahme (LANUK NRW)",
            }
        ],
        "features": features,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
    ha = wald.to_crs(25832).area.sum() / 10000
    print(f"ura: {len(features)} Flächen, etwa {ha:.0f} ha", file=sys.stderr)


def round_coords(geo):
    def r(c):
        if isinstance(c[0], (int, float)):
            return [round(c[0], 5), round(c[1], 5)]
        return [r(x) for x in c]

    return {"type": geo["type"], "coordinates": r(geo["coordinates"])}


if __name__ == "__main__":
    main()

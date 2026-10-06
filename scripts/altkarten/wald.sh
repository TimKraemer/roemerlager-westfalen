#!/usr/bin/env bash
# Startet wald.py mit seinen Python-Abhängigkeiten (über uv)
exec uv run --quiet --with geopandas --with pyogrio --with shapely \
	python "$(dirname "$0")/wald.py" "$@"

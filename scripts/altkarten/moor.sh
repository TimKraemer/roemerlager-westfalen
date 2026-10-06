#!/usr/bin/env bash
# Startet moor.py mit seinen Python-Abhängigkeiten (über uv)
exec uv run --quiet --with numpy --with scipy --with pillow --with shapely \
	--with scikit-image --with rasterio \
	python "$(dirname "$0")/moor.py" "$@"

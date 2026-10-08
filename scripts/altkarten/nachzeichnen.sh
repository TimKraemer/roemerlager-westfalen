#!/usr/bin/env bash
# Startet nachzeichnen.py mit seinen Python-Abhängigkeiten (über uv)
exec uv run --quiet --with numpy --with scipy --with pillow --with pyproj \
	--with shapely --with scikit-image --with mapbox-vector-tile --with matplotlib \
	python "$(dirname "$0")/nachzeichnen.py" "$@"

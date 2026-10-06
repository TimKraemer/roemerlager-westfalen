#!/usr/bin/env bash
# Startet gewaesser.py mit seinen Python-Abhängigkeiten (über uv)
exec uv run --quiet --with numpy --with scipy --with pillow --with shapely \
	--with scikit-image --with skan --with mapbox-vector-tile \
	python "$(dirname "$0")/gewaesser.py" "$@"

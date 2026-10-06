#!/usr/bin/env bash
# Startet alt.py mit seinen Python-Abhängigkeiten (über uv)
exec uv run --quiet --with numpy --with scipy --with pillow --with pyproj \
	python "$(dirname "$0")/alt.py" "$@"

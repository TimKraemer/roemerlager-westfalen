#!/usr/bin/env bash
# Startet feinpass.py mit seinen Python-Abhängigkeiten (über uv)
exec uv run --quiet --with numpy --with scipy --with pillow --with pyproj \
	--with scikit-image --with matplotlib \
	python "$(dirname "$0")/feinpass.py" "$@"

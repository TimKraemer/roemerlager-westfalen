#!/usr/bin/env bash
# Baut den statischen Export und legt ihn nach
# experiments.erleben.app/roemer (scortex-vm:/var/www/www-experiments/roemer).
# Voraussetzung: deploy/setup-server.sh lief einmal.
set -euo pipefail
cd "$(dirname "$0")/.."
SERVER=${SERVER:-scortex-vm}
TARGET=/var/www/www-experiments/roemer

bun test
bun run build
# Erst neue Chunks hochladen, dann HTML ersetzen, zuletzt Altes löschen,
# damit offene Seiten während des Uploads keine 404 auf Chunks bekommen
rsync -az --exclude '*.html' --exclude '*.txt' out/ "$SERVER:$TARGET/"
rsync -az out/ "$SERVER:$TARGET/"
rsync -az --delete out/ "$SERVER:$TARGET/"
echo "fertig: https://experiments.erleben.app/roemer/"

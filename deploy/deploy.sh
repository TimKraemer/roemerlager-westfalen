#!/usr/bin/env bash
# Baut den statischen Export und kopiert ihn per rsync auf einen Server.
#
#   deploy/deploy.sh [env-datei]
#
# Die Einstellungen kommen aus der env-Datei (Standard: deploy/deploy.env,
# Vorlage: deploy/deploy.env.example, Beispiel für einen echten Server:
# deploy/erleben/deploy.env) oder direkt aus der Umgebung.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=${1:-deploy/deploy.env}
if [[ -f $ENV_FILE ]]; then
	set -a
	# shellcheck source=/dev/null
	source "$ENV_FILE"
	set +a
elif [[ -z ${DEPLOY_TARGET:-} ]]; then
	echo "Keine Einstellungen gefunden. Vorlage kopieren und anpassen:" >&2
	echo "  cp deploy/deploy.env.example deploy/deploy.env" >&2
	exit 1
fi
: "${DEPLOY_TARGET:?DEPLOY_TARGET fehlt, z. B. user@host:/var/www/roemer}"
export BASE_PATH=${BASE_PATH:-}

# Die Altkarten-Kacheln sind nicht eingecheckt (README, Abschnitt
# Altkarten). Fehlen sie lokal, würde rsync --delete sie auf dem Server
# löschen.
if [[ ! -d public/altkarten && -z ${ALLOW_MISSING_ALTKARTEN:-} ]]; then
	echo "public/altkarten fehlt, der Deploy würde die Altkarten auf dem Server löschen." >&2
	echo "Erst Kacheln rechnen (scripts/altkarten/alt.sh) oder ALLOW_MISSING_ALTKARTEN=1 setzen." >&2
	exit 1
fi

bun test
bun run build
# Erst neue Chunks hochladen, dann HTML ersetzen, zuletzt Altes löschen,
# damit offene Seiten während des Uploads keine 404 auf Chunks bekommen
rsync -az --exclude '*.html' --exclude '*.txt' out/ "$DEPLOY_TARGET/"
rsync -az out/ "$DEPLOY_TARGET/"
rsync -az --delete out/ "$DEPLOY_TARGET/"
echo "fertig: ${NEXT_PUBLIC_SITE_URL:-$DEPLOY_TARGET}"

#!/usr/bin/env bash
# Einmalig: Container "experiments" für experiments.erleben.app auf
# scortex-vm einrichten. Idempotent, darf erneut laufen (z. B. nach
# Änderungen an experiments-nginx.conf oder index.html).
set -euo pipefail
cd "$(dirname "$0")"
SERVER=${SERVER:-scortex-vm}

scp -q experiments.yaml experiments-nginx.conf index.html 404.html "$SERVER:/tmp/"
ssh "$SERVER" 'bash -s' <<'REMOTE'
set -euo pipefail
sudo install -d -o scortex -g root -m 755 /var/www/www-experiments
install -m 644 /tmp/index.html /tmp/404.html /var/www/www-experiments/
sudo install -m 644 -o scortex -g root /tmp/experiments.yaml /opt/services/experiments.yaml
sudo install -m 644 -o scortex -g root /tmp/experiments-nginx.conf /opt/services/experiments-nginx.conf
cd /opt/services
# --no-deps: nginx-proxy nie mit neu erzeugen (Ausfall aller Hosts)
dc up -d --no-deps experiments
# Single-File-Bind-Mount: install legt eine neue Inode an, ein reload sähe
# die alte Datei. Neustart betrifft nur diesen Container.
docker restart experiments >/dev/null
docker exec experiments nginx -t
# nginx-proxy rendert neue Container selbst, kurz warten und prüfen
sleep 5
docker exec nginx-proxy grep -q "server_name experiments.erleben.app" /etc/nginx/conf.d/default.conf \
	&& echo "nginx-proxy: experiments.erleben.app eingebunden"
REMOTE

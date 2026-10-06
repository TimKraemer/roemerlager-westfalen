# Beispiel: experiments.erleben.app/roemer

So läuft die Referenzinstanz https://experiments.erleben.app/roemer/. Die
Dateien hier sind auf diesen Server zugeschnitten und dienen als Vorlage
für eigene Installationen.

Auf dem Server (SSH-Alias `scortex-vm`) liefert ein eigener
nginx-Container `experiments` die Subdomain aus. Davor sitzt
[nginx-proxy](https://github.com/nginx-proxy/nginx-proxy), der den exakten
Hostnamen dem Wildcard `*.erleben.app` der Hauptanwendung vorzieht. Das
Wildcard-Zertifikat für erleben.app deckt die Subdomain ab. Unter
`experiments.erleben.app` können mehrere statische Projekte in eigenen
Unterordnern liegen, `index.html` listet sie auf.

| Datei | Ziel auf dem Server |
|-------|---------------------|
| `deploy.env` | bleibt lokal, Einstellungen für `deploy/deploy.sh` |
| `experiments.yaml` | `/opt/services/experiments.yaml` (Compose-Dienst, wird vom `dc`-Wrapper mitgeladen) |
| `experiments-nginx.conf` | `/opt/services/experiments-nginx.conf` |
| `index.html`, `404.html` | `/var/www/www-experiments/` (Übersicht aller Experimente) |
| `out/` (Build) | `/var/www/www-experiments/roemer/` |

Einmalig einrichten (idempotent, darf erneut laufen):

```bash
deploy/erleben/setup-server.sh
```

Neue Version veröffentlichen (Tests, Build mit `BASE_PATH=/roemer`, rsync):

```bash
deploy/deploy.sh deploy/erleben/deploy.env
```

Alle Antworten tragen `X-Robots-Tag: noindex, nofollow`, weil es sich um
Experimente handelt. Für eine eigene Instanz, die gefunden werden soll,
diese Zeilen in `experiments-nginx.conf` weglassen.

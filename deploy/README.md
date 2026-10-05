# Deploy nach experiments.erleben.app/roemer

Die App ist ein statischer Next-Export (`output: "export"`, `basePath:
"/roemer"`). Auf scortex-vm liefert ein eigener nginx-Container
`experiments` die Subdomain aus. Die erleben.app-Hauptanwendung bleibt
unberührt, nginx-proxy zieht den exakten Hostnamen dem Wildcard
`*.erleben.app` vor. Das Wildcard-Zertifikat für erleben.app deckt die
Subdomain ab.

| Datei | Ziel auf scortex-vm |
|-------|---------------------|
| `experiments.yaml` | `/opt/services/experiments.yaml` (wird vom `dc`-Wrapper mitgeladen) |
| `experiments-nginx.conf` | `/opt/services/experiments-nginx.conf` |
| `index.html`, `404.html` | `/var/www/www-experiments/` (Übersicht aller Experimente) |
| `out/` (Build) | `/var/www/www-experiments/roemer/` |

Einmalig einrichten:

```bash
deploy/setup-server.sh
```

Neue Version veröffentlichen (Tests, Build, rsync):

```bash
deploy/deploy.sh
```

Ein weiteres Experiment bekommt einen eigenen Unterordner unter
`/var/www/www-experiments/` und einen Eintrag in `index.html`.
Alle Antworten tragen `X-Robots-Tag: noindex, nofollow`.

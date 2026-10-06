# Statischer Export mit nginx. Bauen und starten:
#
#   docker build -t roemerlager .
#   docker run --rm -p 8080:80 roemerlager
#
# Danach http://localhost:8080/ öffnen. Unterpfad und Kacheldienste lassen
# sich als Build-Argumente setzen, z. B. --build-arg BASE_PATH=/roemer.

FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY scripts/copy-maplibre-worker.mjs scripts/
COPY src/lib/maplibre-version.json src/lib/
RUN bun install --frozen-lockfile
COPY . .
ARG BASE_PATH=""
ARG NEXT_PUBLIC_SITE_URL=""
ARG NEXT_PUBLIC_DEM_TILES=""
ARG NEXT_PUBLIC_VECTOR_TILES=""
ARG NEXT_PUBLIC_GLYPHS=""
RUN bun test && bun run build

FROM nginx:alpine
ARG BASE_PATH=""
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html${BASE_PATH}

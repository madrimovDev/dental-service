#!/usr/bin/env bash
# Umumiy VPS'ga deploy (host Caddy, loopback portlar) — infra/vps/README.md.
#   ./infra/vps/deploy.sh [supervisor|lab-hub|cloud|landing|all]   (repo ildizidan)
# Image'lar BITTADAN quriladi (serverda boshqa prod servislar bor). Global
# `docker system prune` va boshqa stack'larga tegadigan buyruqlar YO'Q.
set -euo pipefail
S="${SECRETS_DIR:-/srv/dental/secrets}"
WHAT="${1:-all}"
cd "$(dirname "$0")/../.."

docker network inspect dental_shared >/dev/null 2>&1 || docker network create dental_shared >/dev/null

sv()    { docker compose -p dental-supervisor -f infra/supervisor/docker-compose.prod.yml -f infra/vps/supervisor.override.yml --env-file "$S/supervisor.env" "$@"; }
hub()   { docker compose -p dental-lab-hub -f infra/lab-hub/docker-compose.prod.yml -f infra/vps/lab-hub.override.yml --env-file "$S/lab-hub.env" "$@"; }
cloud() { docker compose -p dental-cloud -f infra/docker-compose.prod.yml -f infra/vps/cloud.override.yml --env-file "$S/cloud.env" "$@"; }

if [[ "$WHAT" == all || "$WHAT" == supervisor ]]; then
  sv build api; sv build admin
  sv up -d postgres; sv run --rm migrate
  sv up -d api admin
fi
if [[ "$WHAT" == all || "$WHAT" == lab-hub ]]; then
  hub build lab-hub-api; hub build lab-hub-web
  hub up -d postgres; hub run --rm migrate
  hub up -d lab-hub-api lab-hub-web
fi
if [[ "$WHAT" == all || "$WHAT" == cloud ]]; then
  cloud build api; cloud build web
  cloud up -d postgres redis; cloud run --rm migrate
  cloud up -d api worker web
fi
if [[ "$WHAT" == all || "$WHAT" == landing ]]; then
  # Statik landing (apps/landing): sof yig'ish, tarmoqsiz; host Caddy /srv/dental/landing'dan beradi.
  (cd apps/landing && bun run build)
  mkdir -p /srv/dental/landing
  rsync -a --delete apps/landing/dist/ /srv/dental/landing/
  echo "landing: $(find /srv/dental/landing -type f | wc -l) fayl"
fi
docker ps --filter name=dental- --format '{{.Names}}\t{{.Status}}'

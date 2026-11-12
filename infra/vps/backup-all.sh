#!/usr/bin/env bash
# Uchala stack zaxirasi (cron: kuniga bir marta) — infra/vps/README.md «Zaxira».
#   /srv/dental/src/infra/vps/backup-all.sh
# Sirlar argumentda/ekranda ko'rinmaydi (env-file orqali).
set -euo pipefail
S="${SECRETS_DIR:-/srv/dental/secrets}"
B="${BACKUP_ROOT:-/srv/dental/backups}"
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$B"; chmod 700 "$B"

# Supervisor + Lab Hub — o'z skriptlari (docker compose exec postgres pg_dump).
COMPOSE_PROJECT_NAME=dental-supervisor COMPOSE_FILE="$SRC/infra/supervisor/docker-compose.prod.yml" \
  ENV_FILE="$S/supervisor.env" BACKUP_DIR="$B/supervisor" "$SRC/infra/supervisor/backup.sh"
COMPOSE_PROJECT_NAME=dental-lab-hub COMPOSE_FILE="$SRC/infra/lab-hub/docker-compose.prod.yml" \
  ENV_FILE="$S/lab-hub.env" BACKUP_DIR="$B/lab-hub" "$SRC/infra/lab-hub/backup.sh"

# Bulut — infra/backup.sh bir martalik postgres konteynerida (hostda pg_dump yo'q):
# ichki tarmoq + uploads volume (faqat o'qish) + zaxira papkasi.
mkdir -p "$B/cloud"; chmod 700 "$B/cloud"
docker run --rm --network dental-cloud_internal \
  --env-file <(grep '^DATABASE_ADMIN_URL=' "$S/cloud.env") \
  -e BACKUP_DIR=/backups -e UPLOADS_DIR=/data/uploads \
  -v dental-cloud_uploads_data:/data/uploads:ro \
  -v "$B/cloud":/backups \
  -v "$SRC/infra/backup.sh":/backup.sh:ro \
  postgres:16-alpine sh /backup.sh

#!/usr/bin/env sh
# ============================================================================
# Lab Hub — zaxira skripti (infra/supervisor/backup.sh naqshi)
# ============================================================================
# 1) `pg_dump -Fc lab_hub` — bemor ismi/izoh/xabarlar bazada allaqachon
#    shifrlangan (lab DEK, KEK bilan o'ralgan);
# 2) `uploads.tar.gz` — diskdagi fayllar allaqachon shifrlangan bloblar.
# KEK (LAB_HUB_KEK) bu zaxiraga QO'SHILMAYDI — u .env.production'da yashaydi va
# alohida (offline) saqlanadi: README «KEK». Zaxira + KEK birga o'g'irlanmasin.
#
# Env (ixtiyoriy):
#   COMPOSE_FILE          default: docker-compose.prod.yml (skript papkasiga nisbatan)
#   ENV_FILE              default: ${SCRIPT_DIR}/.env.production (cron'da majburiy)
#   BACKUP_DIR            default: /var/backups/lab-hub
#   RETENTION_DAYS        default: 30 (eng yangi zaxira hech qachon o'chirilmaydi)
#   POSTGRES_USER         default: lab_hub_owner
#   BACKUP_RSYNC_TARGET   berilsa, BACKUP_DIR shu manzilga rsync qilinadi
#   PG_DUMP_CMD / UPLOADS_TAR_CMD  TEST UCHUN: compose o'rniga stdout'ga yozuvchi buyruq
set -eu
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${SCRIPT_DIR}/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/.env.production}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/lab-hub}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
POSTGRES_USER="${POSTGRES_USER:-lab_hub_owner}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_DIR}/${TS}"

log() { echo "[lab-hub-backup ${TS}] $*"; }
dc() { docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" "$@"; }

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"
mkdir -p "${DEST}"

ok=0
cleanup() {
  if [ "${ok}" -ne 1 ]; then
    log "FAILED — removing partial ${DEST}"
    rm -rf "${DEST}"
  fi
}
trap cleanup EXIT

if [ -z "${PG_DUMP_CMD:-}" ] || [ -z "${UPLOADS_TAR_CMD:-}" ]; then
  [ -f "${COMPOSE_FILE}" ] || { echo "COMPOSE_FILE topilmadi: ${COMPOSE_FILE}" >&2; exit 1; }
fi

log "pg_dump -> lab_hub.dump"
if [ -n "${PG_DUMP_CMD:-}" ]; then
  sh -c "${PG_DUMP_CMD}" > "${DEST}/lab_hub.dump.partial"
else
  dc exec -T postgres pg_dump -U "${POSTGRES_USER}" -Fc lab_hub > "${DEST}/lab_hub.dump.partial"
fi
[ -s "${DEST}/lab_hub.dump.partial" ] || { echo "dump bo'sh" >&2; exit 1; }
mv "${DEST}/lab_hub.dump.partial" "${DEST}/lab_hub.dump"

log "uploads (shifrlangan bloblar) -> uploads.tar.gz"
if [ -n "${UPLOADS_TAR_CMD:-}" ]; then
  sh -c "${UPLOADS_TAR_CMD}" > "${DEST}/uploads.tar.gz.partial"
else
  dc exec -T lab-hub-api tar -C /data -czf - uploads > "${DEST}/uploads.tar.gz.partial"
fi
[ -s "${DEST}/uploads.tar.gz.partial" ] || { echo "uploads arxivi bo'sh" >&2; exit 1; }
mv "${DEST}/uploads.tar.gz.partial" "${DEST}/uploads.tar.gz"

{
  echo "timestamp_utc=${TS}"
  echo "db_dump=lab_hub.dump"
  echo "uploads=uploads.tar.gz"
  echo "kek=NOT_INCLUDED (LAB_HUB_KEK alohida saqlanadi)"
  echo "restore_db=pg_restore --clean --if-exists -d lab_hub lab_hub.dump"
  echo "restore_uploads=tar -C /data -xzf uploads.tar.gz"
} > "${DEST}/MANIFEST"
log "wrote ${DEST}"
ok=1

newest="$(find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*T*Z' | sed 's|.*/||' | sort | tail -n 1)"
find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*T*Z' -mtime +"${RETENTION_DAYS}" \
  | while IFS= read -r old; do
      name="$(basename "${old}")"
      [ "${name}" = "${newest}" ] && continue
      log "prune ${name}"
      rm -rf "${old}"
    done

if [ -n "${BACKUP_RSYNC_TARGET:-}" ]; then
  log "rsync -> ${BACKUP_RSYNC_TARGET}"
  rsync -a "${BACKUP_DIR}/" "${BACKUP_RSYNC_TARGET}"
fi
log "done"

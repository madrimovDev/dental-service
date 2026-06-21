#!/usr/bin/env sh
# ============================================================================
# dental-service — backup script (CLI-236 / D5)
# ============================================================================
# Dumps Postgres (pg_dump custom format) + mirrors the MinIO bucket, then prunes
# backups older than RETENTION_DAYS. Designed to run from cron on the host (or as
# a sidecar). Medical data -> backups are SENSITIVE: store encrypted + off-host.
#
# Env (required):
#   DATABASE_ADMIN_URL   postgres://... (superuser; reads everything past RLS)
#   MINIO_ENDPOINT       e.g. http://minio:9000  (or http://localhost:9000)
#   MINIO_ROOT_USER / MINIO_ROOT_PASSWORD
#   MINIO_BUCKET         e.g. dental-uploads
# Env (optional):
#   BACKUP_DIR           default /backups
#   RETENTION_DAYS       default 14
#   BACKUP_S3_TARGET     if set (e.g. s3remote/dental-backups), `mc mirror` the
#                        whole backup dir off-host after each run
#
# Requires: pg_dump (postgresql-client) + mc (MinIO client) on PATH.
# Exit non-zero on any failure so cron/alerting catches it.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_DIR}/${TS}"
mkdir -p "${DEST}"

log() { echo "[backup ${TS}] $*"; }

# --- 1. Postgres: custom-format dump (compressed, supports parallel restore) --
: "${DATABASE_ADMIN_URL:?DATABASE_ADMIN_URL required}"
log "pg_dump -> db.dump"
pg_dump --format=custom --no-owner --no-privileges \
  --file="${DEST}/db.dump" "${DATABASE_ADMIN_URL}"

# --- 2. MinIO: mirror the uploads bucket --------------------------------------
: "${MINIO_ENDPOINT:?MINIO_ENDPOINT required}"
: "${MINIO_BUCKET:?MINIO_BUCKET required}"
log "mc mirror bucket ${MINIO_BUCKET} -> objects/"
mc alias set bkp "${MINIO_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null
mc mirror --overwrite --remove "bkp/${MINIO_BUCKET}" "${DEST}/objects"

# --- 3. Manifest --------------------------------------------------------------
{
  echo "timestamp_utc=${TS}"
  echo "db_dump=db.dump"
  echo "minio_bucket=${MINIO_BUCKET}"
  echo "objects_dir=objects/"
} > "${DEST}/MANIFEST"
log "wrote ${DEST}"

# --- 4. Off-host copy (optional but STRONGLY recommended for DR) --------------
if [ -n "${BACKUP_S3_TARGET:-}" ]; then
  log "mirroring backups off-host -> ${BACKUP_S3_TARGET}"
  mc mirror --overwrite "${BACKUP_DIR}" "${BACKUP_S3_TARGET}"
fi

# --- 5. Prune local backups older than RETENTION_DAYS -------------------------
log "pruning local backups older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" \
  -exec rm -rf {} +

log "done"

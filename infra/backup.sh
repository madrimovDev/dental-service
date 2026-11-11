#!/usr/bin/env sh
# ============================================================================
# dental-service — backup script (CLI-236 / D5)
# ============================================================================
# Dumps Postgres (pg_dump custom format) + archives the local uploads directory
# (UPLOADS_DIR — the API's `uploads_data` volume), then prunes backups older than
# RETENTION_DAYS (the newest backup is never pruned). Designed to run from cron on
# the host (or as a sidecar with `uploads_data` mounted read-only). Medical data ->
# backups are SENSITIVE: files are chmod 600 / dirs 700; store encrypted + off-host.
#
# Env (required):
#   DATABASE_ADMIN_URL   postgres://... (superuser; reads everything past RLS)
# Env (optional):
#   UPLOADS_DIR          default /data/uploads (path where the uploads volume is mounted)
#   BACKUP_DIR           default /backups
#   RETENTION_DAYS       default 14
#   BACKUP_RSYNC_TARGET  if set (e.g. user@host:/srv/dental-backups/), rsync the
#                        whole backup dir off-host after each run (`--delete`)
#
# Requires: pg_dump (postgresql-client), tar; rsync only if BACKUP_RSYNC_TARGET set.
# Exit non-zero on any failure so cron/alerting catches it.
set -eu
umask 077

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_DIR}/${TS}"
mkdir -p "${BACKUP_DIR}" && chmod 700 "${BACKUP_DIR}"
mkdir -p "${DEST}"

log() { echo "[backup ${TS}] $*"; }

# --- 1. Postgres: custom-format dump (compressed, supports parallel restore) --
: "${DATABASE_ADMIN_URL:?DATABASE_ADMIN_URL required}"
log "pg_dump -> db.dump"
pg_dump --format=custom --no-owner --no-privileges \
  --file="${DEST}/db.dump" "${DATABASE_ADMIN_URL}"

# --- 2. Uploads: archive the local uploads directory --------------------------
UPLOADS_DIR="${UPLOADS_DIR:-/data/uploads}"
[ -d "${UPLOADS_DIR}" ] || { echo "UPLOADS_DIR ${UPLOADS_DIR} is not a directory" >&2; exit 1; }
log "tar ${UPLOADS_DIR} -> uploads.tar.gz"
tar -C "${UPLOADS_DIR}" -czf "${DEST}/uploads.tar.gz" .

# --- 3. Manifest --------------------------------------------------------------
{
  echo "timestamp_utc=${TS}"
  echo "db_dump=db.dump"
  echo "uploads=uploads.tar.gz"
} > "${DEST}/MANIFEST"
chmod 600 "${DEST}"/*
log "wrote ${DEST}"

# --- 4. Off-host copy (optional but STRONGLY recommended for DR) --------------
if [ -n "${BACKUP_RSYNC_TARGET:-}" ]; then
  log "rsync backups off-host -> ${BACKUP_RSYNC_TARGET}"
  rsync -a --delete "${BACKUP_DIR}/" "${BACKUP_RSYNC_TARGET}"
fi

# --- 5. Prune local backups older than RETENTION_DAYS -------------------------
log "pruning local backups older than ${RETENTION_DAYS} days (newest is always kept)"
NEWEST="$(find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"
find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" \
  ! -path "${NEWEST}" -exec rm -rf {} +

log "done"

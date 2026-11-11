#!/usr/bin/env sh
# ============================================================================
# Supervisor — zaxira skripti (P16)
# ============================================================================
# Supervisor bazasini (pg_dump custom format) zaxiralaydi va eski zaxiralarni
# o'chiradi. Cron'dan VM hostida ishlaydi. Zaxira SENSITIVE: litsenziya,
# klinika va admin ma'lumotlari bor — papka 700, fayl 600.
#
# RSA private key (RSA_PRIVATE_KEY) BU SKRIPTDA NUSXALANMAYDI — u
# .env.production'da yashaydi. Offline tartib: infra/supervisor/README.md
# «Zaxira va RSA kalit».
#
# Parol host'da hech qayerda yo'q: pg_dump konteyner ichida ishlaydi
# (`docker compose exec`), URL argumentda ko'rinmaydi, `set -x` YO'Q.
#
# Env (ixtiyoriy):
#   COMPOSE_FILE          default: docker-compose.ip.yml (skript papkasiga nisbatan)
#   BACKUP_DIR            default: /var/backups/supervisor
#   RETENTION_DAYS        default: 30 (eng yangi zaxira hech qachon o'chirilmaydi)
#   POSTGRES_USER         default: supervisor (konteyner ichidagi pg rol nomi)
#   BACKUP_RSYNC_TARGET   agar berilsa, BACKUP_DIR shu manzilga rsync qilinadi
#                         (masalan user@host:/srv/supervisor-backups/)
#   PG_DUMP_CMD           TEST UCHUN: compose o'rniga shu buyruq (sh -c) stdout'iga
#                         dump yozadi (masalan lokal smoke uchun docker exec ...)
#
# Exit non-zero on any failure so cron/alerting catches it.
set -eu

umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${SCRIPT_DIR}/docker-compose.ip.yml}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/supervisor}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
POSTGRES_USER="${POSTGRES_USER:-supervisor}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_DIR}/${TS}"

log() { echo "[supervisor-backup ${TS}] $*"; }

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"
mkdir -p "${DEST}"

# Xato bo'lsa yarim yozilgan zaxira papkasi qoldirilmaydi (u "eng yangi"
# bo'lib qolib, retention'ni buzmasligi uchun).
ok=0
cleanup() {
  if [ "${ok}" -ne 1 ]; then
    log "FAILED — removing partial ${DEST}"
    rm -rf "${DEST}"
  fi
}
trap cleanup EXIT

# --- 1. Postgres: custom-format dump -----------------------------------------
# Yozish avval .partial fayliga, muvaffaqiyatdan keyin nomi o'zgaradi.
log "pg_dump -> supervisor.dump"
if [ -n "${PG_DUMP_CMD:-}" ]; then
  sh -c "${PG_DUMP_CMD}" > "${DEST}/supervisor.dump.partial"
else
  [ -f "${COMPOSE_FILE}" ] || { echo "COMPOSE_FILE topilmadi: ${COMPOSE_FILE}" >&2; exit 1; }
  docker compose -f "${COMPOSE_FILE}" exec -T postgres \
    pg_dump -U "${POSTGRES_USER}" -Fc supervisor > "${DEST}/supervisor.dump.partial"
fi
[ -s "${DEST}/supervisor.dump.partial" ] || { echo "dump bo'sh" >&2; exit 1; }
mv "${DEST}/supervisor.dump.partial" "${DEST}/supervisor.dump"

# --- 2. Manifest --------------------------------------------------------------
{
  echo "timestamp_utc=${TS}"
  echo "db_dump=supervisor.dump"
  echo "restore=pg_restore --clean --if-exists -d supervisor supervisor.dump"
} > "${DEST}/MANIFEST"
log "wrote ${DEST}"

# --- 3. Retention: RETENTION_DAYS dan eski papkalar, eng yangisi saqlanadi ----
newest="$(find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*T*Z' \
  | sed 's|.*/||' | sort | tail -n 1)"
find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*T*Z' \
  -mtime +"${RETENTION_DAYS}" | while IFS= read -r old; do
  name="$(basename "${old}")"
  if [ "${name}" = "${newest}" ]; then
    continue
  fi
  log "prune ${name}"
  rm -rf "${old}"
done

# --- 4. Off-host nusxa (ixtiyoriy, DR uchun tavsiya etiladi) ------------------
if [ -n "${BACKUP_RSYNC_TARGET:-}" ]; then
  log "rsync -> ${BACKUP_RSYNC_TARGET}"
  rsync -a "${BACKUP_DIR}/" "${BACKUP_RSYNC_TARGET}"
fi

ok=1
log "done"

#!/usr/bin/env bash
# scripts/download-portable-bins.sh
# Build vaqtida portable binaries yuklab oladi
# Qaror (brainstorm 2026-06-29): o'z serverdan (POSTGRES_WIN_URL + VALKEY_WIN_URL env var)
# Rasmiy URL'lar vaqt o'tishi bilan o'zgaradi — o'z serverda barqaror

set -e

# `bun run` ishga tushirilganda cwd — chaqiruvchi package.json'ning papkasi
# (masalan apps/desktop/package.json'dagi prebuild "apps/desktop"'dan ishga
# tushadi, repo root'dan emas). Shu sabab yo'l script'ning o'z joylashuviga
# nisbatan hisoblanadi — qaysi cwd'dan chaqirilishidan qat'i nazar to'g'ri.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RESOURCES_DIR="$ROOT_DIR/apps/desktop/resources"
mkdir -p "$RESOURCES_DIR/postgres" "$RESOURCES_DIR/valkey"

if [ -z "$POSTGRES_WIN_URL" ]; then
  echo "ERROR: POSTGRES_WIN_URL env var belgilanmagan" >&2
  exit 1
fi
if [ -z "$VALKEY_WIN_URL" ]; then
  echo "ERROR: VALKEY_WIN_URL env var belgilanmagan" >&2
  exit 1
fi

# PostgreSQL 16 portable for Windows (o'z serverdan)
echo "Downloading PostgreSQL..."
curl -L -o /tmp/postgres-win.zip "$POSTGRES_WIN_URL"
unzip -q /tmp/postgres-win.zip -d /tmp/pg-extract
cp -r /tmp/pg-extract/pgsql/bin "$RESOURCES_DIR/postgres/"
cp -r /tmp/pg-extract/pgsql/lib "$RESOURCES_DIR/postgres/"
# share/ — initdb bootstrap (postgres.bki, tizim kataloglari, timezone) uchun
# MAJBURIY; busiz `initdb` "postgres.bki does not exist" bilan qulaydi (CLI-361
# real Windows build'da topildi).
cp -r /tmp/pg-extract/pgsql/share "$RESOURCES_DIR/postgres/"

# Valkey Windows binary (o'z serverdan)
echo "Downloading Valkey..."
curl -L -o /tmp/valkey-win.zip "$VALKEY_WIN_URL"
unzip -q /tmp/valkey-win.zip -d /tmp/valkey-extract
cp /tmp/valkey-extract/valkey-server.exe "$RESOURCES_DIR/valkey/"

echo "Done. Binaries ready in $RESOURCES_DIR/"

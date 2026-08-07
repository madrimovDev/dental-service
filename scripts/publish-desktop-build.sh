#!/usr/bin/env bash
# Windows installerni Supervisor VM'ga chiqaradi va /start sahifasidagi
# versiya ma'lumotini yangilaydi.
#
# Ishlatish (repo root'dan):
#   bash scripts/publish-desktop-build.sh
#   bash scripts/publish-desktop-build.sh "/boshqa/yo'l/Setup.exe"
#
# Env:
#   TARGET_HOST  (default ubuntu@192.168.3.242)
#   BASE_URL     (default http://192.168.3.242)

set -euo pipefail

TARGET_HOST="${TARGET_HOST:-ubuntu@192.168.3.242}"
BASE_URL="${BASE_URL:-http://192.168.3.242}"
TARGET_DIR="dental-service/infra/supervisor/releases"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(grep -m1 '"version"' "$ROOT_DIR/apps/desktop/package.json" | sed -E 's/.*"version"[^"]*"([^"]+)".*/\1/')"

if [ -z "$VERSION" ]; then
  echo "XATO: apps/desktop/package.json dan versiya o'qib bo'lmadi" >&2
  exit 1
fi

EXE="${1:-$ROOT_DIR/apps/desktop/release/Dental Service Setup $VERSION.exe}"

if [ ! -f "$EXE" ]; then
  echo "XATO: installer topilmadi: $EXE" >&2
  echo "Avval build qiling (docs/DESKTOP-WINDOWS-BUILD-TEST.md §0b)." >&2
  exit 1
fi

# ⚠️ Bu tekshiruv `--target=bun-windows-x64` tushib qolgan holatni ushlaydi:
# usiz Linux'da ELF binariy yasalib `.exe` deb ataladi, installer muammosiz
# yig'iladi va faqat mijoz mashinasida ishlamaydi (2026-08-07 da topilgan).
if ! file -b "$EXE" | grep -q '^PE32'; then
  echo "XATO: bu Windows binariysi EMAS:" >&2
  echo "  $(file -b "$EXE")" >&2
  exit 1
fi

SIZE="$(stat -c%s "$EXE")"
SHA="$(sha256sum "$EXE" | cut -d' ' -f1)"
PUBLISHED="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp "$EXE" "$STAGE/dental-service-setup.exe"
cat > "$STAGE/release.json" <<JSON
{
  "version": "$VERSION",
  "size": $SIZE,
  "sha256": "$SHA",
  "publishedAt": "$PUBLISHED"
}
JSON

echo "=== Yuklanmoqda: v$VERSION, $((SIZE / 1048576)) MB ==="
ssh "$TARGET_HOST" "mkdir -p ~/$TARGET_DIR"
rsync -az --progress "$STAGE/dental-service-setup.exe" "$STAGE/release.json" \
  "$TARGET_HOST:$TARGET_DIR/"

echo "=== Tekshirilmoqda ==="
fail=0

start_code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/start")"
[ "$start_code" = "200" ] || { echo "  /start -> $start_code (200 kutilgan)" >&2; fail=1; }

exe_code="$(curl -s -o /dev/null -r 0-1024 -w '%{http_code}' "$BASE_URL/download/dental-service-setup.exe")"
[ "$exe_code" = "206" ] || { echo "  installer -> $exe_code (206 kutilgan)" >&2; fail=1; }

remote_json="$(curl -s "$BASE_URL/download/release.json")"
remote_size="$(printf '%s' "$remote_json" | grep -oE '"size"[[:space:]]*:[[:space:]]*[0-9]+' | grep -oE '[0-9]+$')"
if [ "$remote_size" != "$SIZE" ]; then
  echo "  release.json hajmi mos emas: $remote_size != $SIZE" >&2
  fail=1
fi

# Serverdagi FAYLNING haqiqiy hajmi (JSON da nima yozilganidan mustaqil) —
# HEAD so'rovi, 135 MB yuklab olinmaydi.
served_size="$(curl -sI "$BASE_URL/download/dental-service-setup.exe" \
  | grep -i '^content-length:' | tr -d '\r' | awk '{print $2}')"
if [ -n "$served_size" ] && [ "$served_size" != "$SIZE" ]; then
  echo "  serverdagi fayl hajmi mos emas: $served_size != $SIZE" >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "=== YIQILDI ===" >&2
  exit 1
fi

echo "=== TAYYOR ==="
echo "  $BASE_URL/start"
echo "  v$VERSION · $((SIZE / 1048576)) MB · sha256 ${SHA:0:16}..."

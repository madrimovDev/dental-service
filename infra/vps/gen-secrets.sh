#!/usr/bin/env bash
# VPS'da BIR MARTA: uchala stack uchun env fayllari + Supervisor RSA juftligi.
# Mavjud faylni HECH QACHON qayta yozmaydi (sir almashsa — eski ma'lumot o'qilmay qoladi).
# Hech bir sir ekranga chiqarilmaydi. Ishlatish: SECRETS_DIR=/srv/dental/secrets ./gen-secrets.sh
set -euo pipefail
umask 077
D="${SECRETS_DIR:-/srv/dental/secrets}"
CLOUD_HOST="${CLOUD_HOST:-dental.madrimov.uz}"
SV_HOST="${SV_HOST:-sv.dental.madrimov.uz}"
LAB_HOST="${LAB_HOST:-lab.dental.madrimov.uz}"
mkdir -p "$D"; chmod 700 "$D"

r() { openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48; }

# --- Supervisor RSA (FU-54: yangi juftlik; eski kalit oshkor bo'lgan) ----------
if [[ ! -f "$D/supervisor-private.pem" ]]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$D/supervisor-private.pem" 2>/dev/null
  openssl pkey -in "$D/supervisor-private.pem" -pubout -out "$D/supervisor-public.pem"
  chmod 600 "$D/supervisor-private.pem"; chmod 644 "$D/supervisor-public.pem"
fi

HUB_TOKEN_FILE="$D/.shared-hub-token"; SAAS_SV_FILE="$D/.shared-saas-sv-token"; SAAS_HUB_FILE="$D/.shared-saas-hub-token"
for f in "$HUB_TOKEN_FILE" "$SAAS_SV_FILE" "$SAAS_HUB_FILE"; do [[ -f "$f" ]] || r > "$f"; done
HUB_TOKEN=$(cat "$HUB_TOKEN_FILE"); SAAS_SV=$(cat "$SAAS_SV_FILE"); SAAS_HUB=$(cat "$SAAS_HUB_FILE")

# --- Supervisor ------------------------------------------------------------------
if [[ ! -f "$D/supervisor.env" ]]; then
  PG=$(r); ADMIN_PW=$(r | cut -c1-20)
  PEM_ONE_LINE=$(awk 'BEGIN{ORS="\\n"} {print}' "$D/supervisor-private.pem")
  cat > "$D/supervisor.env" <<ENV
POSTGRES_USER=supervisor
POSTGRES_PASSWORD=$PG
DATABASE_URL=postgres://supervisor:$PG@postgres:5432/supervisor
RSA_PRIVATE_KEY="$PEM_ONE_LINE"
JWT_SECRET=$(r)
ADMIN_SEED_EMAIL=admin@$SV_HOST
ADMIN_SEED_PASSWORD=$ADMIN_PW
DOMAIN=$SV_HOST
ACME_EMAIL=unused@$SV_HOST
LAB_HUB_URL=http://lab-hub-api:8171
SUPERVISOR_HUB_TOKEN=$HUB_TOKEN
SUPERVISOR_SAAS_TOKEN=$SAAS_SV
ENV
  printf 'login: admin@%s\nparol: %s\n' "$SV_HOST" "$ADMIN_PW" > "$D/supervisor-admin.txt"
fi

# --- Lab Hub -----------------------------------------------------------------------
if [[ ! -f "$D/lab-hub.env" ]]; then
  cat > "$D/lab-hub.env" <<ENV
DOMAIN=$LAB_HOST
ACME_EMAIL=unused@$LAB_HOST
POSTGRES_USER=lab_hub_owner
POSTGRES_PASSWORD=$(r)
LAB_HUB_APP_DB_PASSWORD=$(r)
JWT_SECRET=$(r)
LAB_HUB_KEK=$(head -c32 /dev/urandom | base64)
SUPERVISOR_HUB_TOKEN=$HUB_TOKEN
SUPERVISOR_URL=http://supervisor-api:3101
SUPERVISOR_NETWORK=dental_shared
SAAS_HUB_TOKEN=$SAAS_HUB
ENV
fi

# --- Bulut (SaaS) --------------------------------------------------------------------
if [[ ! -f "$D/cloud.env" ]]; then
  PGA=$(r); PGAPP=$(r); RP=$(r)
  cat > "$D/cloud.env" <<ENV
NODE_ENV=production
POSTGRES_USER=dental
POSTGRES_PASSWORD=$PGA
POSTGRES_DB=dental
DENTAL_APP_DB_PASSWORD=$PGAPP
DATABASE_URL=postgres://dental_app:$PGAPP@postgres:5432/dental
DATABASE_ADMIN_URL=postgres://dental:$PGA@postgres:5432/dental
REDIS_PASSWORD=$RP
REDIS_URL=redis://:$RP@redis:6379
JWT_SECRET=$(r)
MESSAGING_SECRET=$(r)
WEB_ORIGIN=https://$CLOUD_HOST
LOG_LEVEL=info
DOMAIN=$CLOUD_HOST
ACME_EMAIL=unused@$CLOUD_HOST
VITE_API_BASE_URL=
SUPERVISOR_URL=http://supervisor-api:3101
SUPERVISOR_SAAS_TOKEN=$SAAS_SV
LAB_HUB_URL=http://lab-hub-api:8171
LAB_HUB_SERVICE_TOKEN=$SAAS_HUB
ENV
fi
chmod 600 "$D"/*.env
echo "tayyor: $D (sirlar chiqarilmadi)"

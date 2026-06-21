# Backup & disaster-recovery runbook — dental-service

> **Medical data.** Patient records (Postgres) and clinical images (MinIO) are
> sensitive PII under retention obligations. Backups MUST be encrypted, stored
> off-host, access-controlled, and periodically test-restored. Losing this data
> is unrecoverable for the clinic.

## What is backed up

| Store    | Contents                                   | Method                          |
|----------|--------------------------------------------|---------------------------------|
| Postgres | all tenant + platform data (past RLS)      | `pg_dump --format=custom`       |
| MinIO    | patient images / uploads (PII)             | `mc mirror` of the bucket       |

Redis is a cache/queue — NOT backed up (rebuildable). Reminder jobs re-enqueue
on appointment changes; a Redis loss does not lose source-of-truth data.

## Backup schedule

Run `infra/backup.sh` from cron on the host (or a dedicated backup container
with `postgresql-client` + `mc`). Recommended:

```cron
# Daily full backup at 02:30 Asia/Tashkent. Logs to syslog; alert on non-zero.
30 2 * * *  DATABASE_ADMIN_URL=... MINIO_ENDPOINT=... MINIO_ROOT_USER=... \
            MINIO_ROOT_PASSWORD=... MINIO_BUCKET=dental-uploads \
            BACKUP_DIR=/var/backups/dental RETENTION_DAYS=14 \
            BACKUP_S3_TARGET=offsite/dental-backups \
            /opt/dental/infra/backup.sh >> /var/log/dental-backup.log 2>&1
```

- **RETENTION_DAYS** (default 14) prunes local copies. Keep a longer-retained,
  immutable copy off-host (`BACKUP_S3_TARGET` -> versioned/object-locked bucket).
- **Off-host is mandatory for DR** — a backup on the same host does not survive
  host loss. Set `BACKUP_S3_TARGET` to a different provider/region with
  encryption at rest + object lock.
- **Targets:** RPO ~24h with daily dumps. For tighter RPO, enable Postgres WAL
  archiving / PITR (e.g. managed Postgres PITR or `wal-g`) in addition.

### Each backup produces
```
<BACKUP_DIR>/<UTC-timestamp>/
  db.dump        # pg_dump custom format
  objects/       # mirror of the MinIO bucket
  MANIFEST       # timestamp + contents
```

## Restore (full recovery)

> Do a DRY RUN on a staging host first. Restoring overwrites data.

### 0. Pick a backup
```sh
B=/var/backups/dental/20260621T023000Z   # the timestamp dir to restore
cat "$B/MANIFEST"
```

### 1. Restore Postgres
Restore into a FRESH database (the migrate role / superuser). `--clean` drops
existing objects first; omit it when restoring into an empty DB.

```sh
# Empty target DB (recommended):
createdb -h <host> -U <admin> dental
pg_restore --no-owner --no-privileges --jobs=4 \
  --dbname="postgres://<admin>:<pw>@<host>:5432/dental" \
  "$B/db.dump"
```

The dump already contains the schema + RLS policies (they are real DB objects).
After restore, confirm the runtime non-superuser role exists (`dental_app`,
NOBYPASSRLS) — it is created by `infra/postgres-init.sql` on first init; if
restoring onto a brand-new cluster, run that init first.

### 2. Restore MinIO objects
```sh
mc alias set tgt "$MINIO_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mb --ignore-existing "tgt/$MINIO_BUCKET"
mc mirror --overwrite "$B/objects" "tgt/$MINIO_BUCKET"
```
Keep the bucket PRIVATE (no anonymous policy) — images are served via presigned
URLs only.

### 3. Bring the app up + verify
```sh
docker compose -f infra/docker-compose.prod.yml --env-file <envfile> up -d
curl -fsS https://<DOMAIN>/api/health     # expect {"data":{"ok":true,"db":...}}
```
Spot-check: log in, open a patient with images, confirm an image loads (presigned
URL works), confirm recent appointments/payments are present.

## Verification cadence

- **Monthly:** restore the latest backup to a staging host + run the §3 checks.
  An untested backup is not a backup.
- **Quarterly:** full DR drill — provision a clean host, restore Postgres +
  MinIO, measure RTO. Document the actual recovery time.

## RTO / RPO summary

| Metric | Target (daily dumps)          | Tighter option            |
|--------|-------------------------------|---------------------------|
| RPO    | <= 24h                        | minutes (WAL/PITR)        |
| RTO    | hours (size-dependent)        | reduce via warm standby   |

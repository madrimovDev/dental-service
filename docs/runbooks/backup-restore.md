# Backup & disaster-recovery runbook — dental-service

> **Medical data.** Patient records (Postgres) and clinical images (uploads volume) are
> sensitive PII under retention obligations. Backups MUST be encrypted, stored
> off-host, access-controlled, and periodically test-restored. Losing this data
> is unrecoverable for the clinic.

## What is backed up

| Store    | Contents                                   | Method                          |
|----------|--------------------------------------------|---------------------------------|
| Postgres | all tenant + platform data (past RLS)      | `pg_dump --format=custom`       |
| Uploads  | patient images / files (PII), `uploads_data` volume | `tar -czf` of `UPLOADS_DIR` |

Redis is a cache/queue — NOT backed up (rebuildable). Reminder jobs re-enqueue
on appointment changes; a Redis loss does not lose source-of-truth data.

## Backup schedule

Run `infra/backup.sh` from cron on the host (or a dedicated backup container
with `postgresql-client`; mount `uploads_data` read-only at `UPLOADS_DIR`). Recommended:

```cron
# Daily full backup at 02:30 Asia/Tashkent. Logs to syslog; alert on non-zero.
# UPLOADS_DIR = host path of the `uploads_data` volume
# (docker volume inspect <project>_uploads_data -f '{{.Mountpoint}}'), or /data/uploads
# when run inside a sidecar that mounts it.
30 2 * * *  DATABASE_ADMIN_URL=... UPLOADS_DIR=/data/uploads \
            BACKUP_DIR=/var/backups/dental RETENTION_DAYS=14 \
            BACKUP_RSYNC_TARGET=backup@offsite:/srv/dental-backups/ \
            /opt/dental/infra/backup.sh >> /var/log/dental-backup.log 2>&1
```

- **RETENTION_DAYS** (default 14) prunes local copies. Keep a longer-retained,
  immutable copy off-host (`BACKUP_RSYNC_TARGET` -> versioned/snapshotted storage).
- **Off-host is mandatory for DR** — a backup on the same host does not survive
  host loss. Set `BACKUP_RSYNC_TARGET` to a different host/provider with
  encryption at rest. Note `rsync --delete` mirrors local pruning; snapshot
  the target for an immutable history. The newest backup is never pruned.
- **Targets:** RPO ~24h with daily dumps. For tighter RPO, enable Postgres WAL
  archiving / PITR (e.g. managed Postgres PITR or `wal-g`) in addition.

### Each backup produces
```
<BACKUP_DIR>/<UTC-timestamp>/
  db.dump        # pg_dump custom format
  uploads.tar.gz # archive of UPLOADS_DIR (relative paths)
  MANIFEST       # timestamp + contents (db_dump=, uploads=)
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
NOBYPASSRLS) — it is created by `infra/postgres-init.sh` on first init; if
restoring onto a brand-new cluster, run that init first.

### 2. Restore uploads
Extract into the `uploads_data` volume (owned by the `bun` user, uid 1000 in
the image). With the stack stopped or the api idle:
```sh
docker run --rm -v <project>_uploads_data:/data/uploads -v "$B":/b:ro \
  alpine sh -c 'tar -C /data/uploads -xzf /b/uploads.tar.gz && chown -R 1000:1000 /data/uploads'
```
Uploads are served only through the authenticated `/uploads/*` API route —
there is no public bucket.

### 3. Bring the app up + verify
```sh
docker compose -f infra/docker-compose.prod.yml --env-file <envfile> up -d
curl -fsS https://<DOMAIN>/api/health     # expect {"data":{"ok":true,"db":...}}
```
Spot-check: log in, open a patient with images, confirm an image loads, confirm recent appointments/payments are present.

## Verification cadence

- **Monthly:** restore the latest backup to a staging host + run the §3 checks.
  An untested backup is not a backup.
- **Quarterly:** full DR drill — provision a clean host, restore Postgres +
  uploads, measure RTO. Document the actual recovery time.

## RTO / RPO summary

| Metric | Target (daily dumps)          | Tighter option            |
|--------|-------------------------------|---------------------------|
| RPO    | <= 24h                        | minutes (WAL/PITR)        |
| RTO    | hours (size-dependent)        | reduce via warm standby   |

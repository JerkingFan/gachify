#!/bin/sh
# Nightly backup: Postgres dump + MinIO bucket mirror.
# Usage:
#   ./deploy/backup.sh
# Cron example: deploy/cron/gachify-backup.cron
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a
  . ./.env
  set +a
fi

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${GACHIFY_BACKUP_DIR:-$ROOT/backups}/$STAMP"
RETAIN="${GACHIFY_BACKUP_RETAIN_DAYS:-14}"
PG_USER="${POSTGRES_USER:-gachify}"
PG_DB="${POSTGRES_DB:-gachify}"
BUCKET="${GACHIFY_S3_BUCKET_MASTERS:-gachify-masters}"
MINIO_USER="${MINIO_ROOT_USER:-gachify}"
MINIO_PASS="${MINIO_ROOT_PASSWORD:-gachifysecret}"

mkdir -p "$OUT"

echo "==> backup: postgres -> $OUT/gachify.sql"
$COMPOSE exec -T postgres pg_dump -U "$PG_USER" -Fc "$PG_DB" > "$OUT/gachify.dump"
$COMPOSE exec -T postgres pg_dump -U "$PG_USER" --clean --if-exists "$PG_DB" > "$OUT/gachify.sql"

echo "==> backup: minio mirror local/$BUCKET -> $OUT/minio-masters"
mkdir -p "$OUT/minio-masters"
$COMPOSE run --rm --no-deps \
  -v "$OUT/minio-masters:/backup:rw" \
  -e "MINIO_ROOT_USER=$MINIO_USER" \
  -e "MINIO_ROOT_PASSWORD=$MINIO_PASS" \
  -e "GACHIFY_S3_BUCKET_MASTERS=$BUCKET" \
  --entrypoint sh minio-init -c '
    mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
    mc mirror --overwrite "local/${GACHIFY_S3_BUCKET_MASTERS}" /backup
  '

cat > "$OUT/manifest.json" <<EOF
{"created_at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","postgres":{"user":"$PG_USER","db":"$PG_DB","files":["gachify.dump","gachify.sql"]},"minio":{"bucket":"$BUCKET","path":"minio-masters"}}
EOF

echo "==> backup: prune backups older than ${RETAIN} days"
find "${GACHIFY_BACKUP_DIR:-$ROOT/backups}" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETAIN" -exec rm -rf {} + 2>/dev/null || true

echo "==> backup: done -> $OUT"
ls -lah "$OUT"

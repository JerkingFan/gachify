#!/bin/sh
# Restore Postgres + MinIO from a backup directory created by deploy/backup.sh.
# Usage:
#   ./deploy/restore.sh backups/20260101-120000
#   ./deploy/restore.sh backups/20260101-120000 --yes   # skip confirmation
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BACKUP_DIR="${1:-}"
CONFIRM="${2:-}"

if [ -z "$BACKUP_DIR" ] || [ ! -d "$BACKUP_DIR" ]; then
  echo "usage: $0 <backup-dir> [--yes]" >&2
  exit 1
fi

if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a
  . ./.env
  set +a
fi

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
PG_USER="${POSTGRES_USER:-gachify}"
PG_DB="${POSTGRES_DB:-gachify}"
BUCKET="${GACHIFY_S3_BUCKET_MASTERS:-gachify-masters}"
MINIO_USER="${MINIO_ROOT_USER:-gachify}"
MINIO_PASS="${MINIO_ROOT_PASSWORD:-gachifysecret}"

if [ ! -f "$BACKUP_DIR/gachify.sql" ] && [ ! -f "$BACKUP_DIR/gachify.dump" ]; then
  echo "error: missing gachify.sql or gachify.dump in $BACKUP_DIR" >&2
  exit 1
fi
if [ ! -d "$BACKUP_DIR/minio-masters" ]; then
  echo "error: missing minio-masters/ in $BACKUP_DIR" >&2
  exit 1
fi

if [ "$CONFIRM" != "--yes" ]; then
  echo "WARNING: This will REPLACE database $PG_DB and bucket $BUCKET."
  echo "Backup: $BACKUP_DIR"
  printf "Type RESTORE to continue: "
  read -r ans
  if [ "$ans" != "RESTORE" ]; then
    echo "aborted"
    exit 1
  fi
fi

echo "==> stopping api, worker, web"
$COMPOSE stop api worker web 2>/dev/null || true

echo "==> restore postgres"
if [ -f "$BACKUP_DIR/gachify.dump" ]; then
  $COMPOSE exec -T postgres dropdb -U "$PG_USER" --if-exists "$PG_DB"
  $COMPOSE exec -T postgres createdb -U "$PG_USER" "$PG_DB"
  cat "$BACKUP_DIR/gachify.dump" | $COMPOSE exec -T postgres pg_restore -U "$PG_USER" -d "$PG_DB" --no-owner --no-acl
else
  cat "$BACKUP_DIR/gachify.sql" | $COMPOSE exec -T postgres psql -U "$PG_USER" -d postgres
fi

echo "==> restore minio mirror"
$COMPOSE run --rm --no-deps \
  -v "$(CDPATH= cd -- "$BACKUP_DIR/minio-masters" && pwd):/backup:ro" \
  -e "MINIO_ROOT_USER=$MINIO_USER" \
  -e "MINIO_ROOT_PASSWORD=$MINIO_PASS" \
  -e "GACHIFY_S3_BUCKET_MASTERS=$BUCKET" \
  --entrypoint sh minio-init -c '
    mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
    mc mb "local/${GACHIFY_S3_BUCKET_MASTERS}" --ignore-existing
    mc mirror --overwrite /backup "local/${GACHIFY_S3_BUCKET_MASTERS}"
  '

echo "==> starting api, worker, web"
$COMPOSE up -d api worker web

echo "==> restore complete — verify GET /health/ready and spot-check tracks"

#!/bin/sh
# Backup Postgres + MinIO bucket listing hint. Run via cron on prod host.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${GACHIFY_BACKUP_DIR:-$ROOT/backups}/$STAMP"
mkdir -p "$OUT"

echo "backup: postgres -> $OUT/gachify.sql"
docker compose -f "$ROOT/docker-compose.yml" -f "$ROOT/docker-compose.prod.yml" \
  exec -T postgres pg_dump -U "${POSTGRES_USER:-gachify}" "${POSTGRES_DB:-gachify}" > "$OUT/gachify.sql"

echo "backup: minio mirror (requires mc in path or minio container)"
docker compose -f "$ROOT/docker-compose.yml" -f "$ROOT/docker-compose.prod.yml" \
  exec -T minio mc mirror --overwrite local/gachify-masters "$OUT/minio-masters" 2>/dev/null \
  || echo "backup: minio mirror skipped (configure mc alias in container)"

echo "backup: done -> $OUT"

#!/bin/sh
# Non-destructive restore drill: validates backup artifacts and optionally restores
# Postgres into an isolated temporary database inside the running postgres container.
#
# Usage:
#   ./deploy/restore-drill.sh backups/20260101-120000
#   ./deploy/restore-drill.sh backups/20260101-120000 --full
#
# Schedule monthly via cron (see deploy/cron/gachify-backup.cron).
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BACKUP_DIR="${1:-}"
MODE="${2:-}"

if [ -z "$BACKUP_DIR" ] || [ ! -d "$BACKUP_DIR" ]; then
  echo "usage: $0 <backup-dir> [--full]" >&2
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
DRILL_DB="gachify_drill_$(date +%s)"
FAIL=0

check() {
  if "$@"; then
    echo "  OK: $*"
  else
    echo "  FAIL: $*" >&2
    FAIL=1
  fi
}

echo "==> restore drill: $BACKUP_DIR"

echo "-- artifact checks"
check test -s "$BACKUP_DIR/gachify.sql" -o -s "$BACKUP_DIR/gachify.dump"
check test -d "$BACKUP_DIR/minio-masters"
check test -f "$BACKUP_DIR/manifest.json"

MINIO_OBJECTS="$(find "$BACKUP_DIR/minio-masters" -type f 2>/dev/null | wc -l | tr -d ' ')"
echo "  minio object files: $MINIO_OBJECTS"
if [ "$MINIO_OBJECTS" -eq 0 ]; then
  echo "  WARN: minio mirror appears empty" >&2
  FAIL=1
fi

if [ -s "$BACKUP_DIR/gachify.sql" ]; then
  check grep -q "CREATE TABLE" "$BACKUP_DIR/gachify.sql"
fi

if [ "$MODE" = "--full" ]; then
  echo "-- full drill: restore SQL into temporary database $DRILL_DB"
  $COMPOSE exec -T postgres createdb -U "$PG_USER" "$DRILL_DB"
  cleanup() {
    $COMPOSE exec -T postgres dropdb -U "$PG_USER" --if-exists "$DRILL_DB" 2>/dev/null || true
  }
  trap cleanup EXIT

  if [ -f "$BACKUP_DIR/gachify.dump" ]; then
    cat "$BACKUP_DIR/gachify.dump" | $COMPOSE exec -T postgres pg_restore -U "$PG_USER" -d "$DRILL_DB" --no-owner --no-acl
  else
    cat "$BACKUP_DIR/gachify.sql" | $COMPOSE exec -T postgres psql -U "$PG_USER" -d "$DRILL_DB" -v ON_ERROR_STOP=1
  fi

  TRACKS="$($COMPOSE exec -T postgres psql -U "$PG_USER" -d "$DRILL_DB" -Atc "SELECT COUNT(*) FROM tracks;" 2>/dev/null || echo 0)"
  USERS="$($COMPOSE exec -T postgres psql -U "$PG_USER" -d "$DRILL_DB" -Atc "SELECT COUNT(*) FROM users;" 2>/dev/null || echo 0)"
  echo "  drill DB rows: users=$USERS tracks=$TRACKS"
  if [ "${TRACKS:-0}" -lt 1 ]; then
    echo "  FAIL: expected tracks in drill database" >&2
    FAIL=1
  fi
else
  echo "-- skip DB restore (pass --full for isolated pg_restore drill)"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "==> drill FAILED"
  exit 1
fi
echo "==> drill PASSED"

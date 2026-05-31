#!/bin/sh
# E2E smoke: infra up, migrate, API health, seed, list tracks.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API="${GACHIFY_SMOKE_API_URL:-http://localhost:8080}"
COMPOSE="docker compose -f docker-compose.yml"
export GACHIFY_JWT_SECRET="${GACHIFY_JWT_SECRET:-dev-only-change-in-production-min-32-chars!!}"

echo "smoke: starting infra"
$COMPOSE up -d --wait postgres redis minio minio-init

echo "smoke: applying migrations"
GACHIFY_DATABASE_URL=postgres://gachify:gachify@localhost:5432/gachify?sslmode=disable \
  go run ./cmd/migrate -cmd up

echo "smoke: starting API"
GACHIFY_ENV=development \
GACHIFY_DATABASE_URL=postgres://gachify:gachify@localhost:5432/gachify?sslmode=disable \
GACHIFY_REDIS_URL=redis://localhost:6379/0 \
GACHIFY_S3_ENDPOINT=http://localhost:9000 \
GACHIFY_S3_PUBLIC_ENDPOINT=http://localhost:9000 \
GACHIFY_MODERATION_ENABLED=false \
go run ./cmd/api &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true; $COMPOSE down -v 2>/dev/null || true' EXIT

for i in $(seq 1 90); do
  if curl -sf "$API/health/live" | grep -q '"status"'; then
    break
  fi
  sleep 1
done

echo "smoke: health/live"
curl -sf "$API/health/live" | grep -q '"status":"ok"'

echo "smoke: health/ready"
curl -sf "$API/health/ready" | grep -q '"database":"up"'

echo "smoke: seed"
GACHIFY_SEED_API_URL="$API" sh "$ROOT/deploy/seed.sh"

echo "smoke: list tracks"
curl -sf "$API/api/v1/tracks?limit=1" | grep -q '"items"'

echo "smoke: OK"

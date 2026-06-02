#!/usr/bin/env sh
# Production deploy: pull, rebuild, run migrations, restart app.
# Usage: ./deploy/up-prod.sh
set -e
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

if [ ! -f .env ]; then
  echo "Missing .env — copy .env.docker.example to .env and edit secrets."
  exit 1
fi

echo "==> git pull"
git pull

echo "==> build images"
$COMPOSE build migrate api worker web

echo "==> run migrations (always)"
docker rm -f gachify-migrate 2>/dev/null || true
$COMPOSE run --rm --no-deps migrate

echo "==> migration version"
docker exec gachify-postgres psql -U gachify -d gachify -c "SELECT version, dirty FROM schema_migrations;" 2>/dev/null || true

echo "==> restart app"
$COMPOSE up -d --force-recreate api worker web caddy

echo "==> status"
$COMPOSE ps

echo ""
echo "Done. Open your site and hard-refresh (Ctrl+Shift+R)."
echo "Expected schema version: 16 (run psql query above to confirm)."

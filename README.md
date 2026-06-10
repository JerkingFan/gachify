# Gachify

Streaming platform for transformative gachi remixes — modular monolith, Phase 1.

## Stack (current)

| Layer | Tech |
|-------|------|
| API | Go 1.22, chi, pgx |
| Web | React 18, Vite, Tailwind, Zustand |
| DB | PostgreSQL 16 |
| Cache (reserved) | Redis 7 |

## Project layout

```
apps/web/             Spotify-style web player (React)
cmd/api/              HTTP entrypoint
internal/
  app/                Wiring & server lifecycle
  config/             Environment config
  domain/             Shared entities
  modules/
    users/            Users bounded context
    catalog/          Tracks bounded context
    health/           Liveness & readiness
  platform/           DB, HTTP helpers
migrations/           SQL schema (golang-migrate, *.up.sql / *.down.sql)
cmd/migrate/          Apply migrations (`go run ./cmd/migrate`)
```

## Quick start (recommended)

**Requirements:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running), Go 1.22+, Node 18+.

```powershell
# No Docker (default): portable Redis + MinIO, Postgres installed once on Windows
npm run setup    # first time: download .tools/redis + minio
npm run dev

# With Docker instead:
npm run dev:docker
```

| Service | URL |
|---------|-----|
| Web player | http://localhost:5173 |
| API | http://localhost:8080 |
| Health | http://localhost:8080/health/ready |

### Dev scripts

| Script | Purpose |
|--------|---------|
| `.\scripts\check-prereqs.ps1` | Verify Go, Node, Docker |
| `.\scripts\dev.ps1` | Start full local stack |
| `.\scripts\dev.ps1 -InfraOnly` | Only Postgres + Redis |
| `.\scripts\dev.ps1 -ResetDb` | Wipe DB volume + restart + seed |
| `.\scripts\seed.ps1` | Demo users & tracks (idempotent) |
| `.\scripts\seed.ps1 -Force` | Seed even if tracks exist |
| `.\scripts\reset-db.ps1` | `docker compose down -v` + fresh migrations |
| `.\scripts\dev-stop.ps1` | Stop API/Web started by `dev.ps1` |

### Manual start (two terminals)

```powershell
docker compose up -d --wait
copy .env.example .env   # first time only
go run ./cmd/api
# other terminal:
cd apps/web && npm install && npm run dev
.\scripts\seed.ps1
```

The web app proxies `/api` to the backend (see `apps/web/vite.config.ts`).

### Android APK

One command from repo root (needs [Android Studio](https://developer.android.com/studio) installed once for the SDK):

```powershell
# Point APK at your server (once):
copy apps\web\.env.mobile.production.example apps\web\.env.mobile.production
# edit VITE_API_ORIGIN=http://YOUR_SERVER

npm run apk          # -> gachify-debug.apk (connects to that server)
adb install gachify-debug.apk
```

Local dev / emulator instead of VPS:

```powershell
npm run apk:local    # API http://10.0.2.2:8080
```

`VITE_API_ORIGIN` = public site URL (same as in browser), **without** `/api/v1`.
On the server set `GACHIFY_PUBLIC_API_URL` and `GACHIFY_S3_PUBLIC_ENDPOINT` to the same origin, then redeploy API (CORS allows Capacitor).

| `VITE_API_ORIGIN` | When |
|---------------------|------|
| `http://10.0.2.2:8080` | Android emulator → localhost API |
| `http://192.168.x.x:8080` | Phone on same Wi‑Fi as dev machine |
| `https://api.yourdomain.com` | Production release build |

Email/password login works out of the box. Google OAuth needs `GACHIFY_FRONTEND_URL` aligned with a custom URL scheme (future).

### Troubleshooting

| Problem | Fix |
|---------|-----|
| PowerShell «выполнение сценариев отключено» | Use `npm run dev` from repo root (bypasses policy). Or: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `Postgres is not running on localhost:5432` | `winget install PostgreSQL.PostgreSQL.16`, create user/db `gachify` (see `npm run setup`) |
| `Docker daemon is not running` | Use `npm run dev` (no Docker). Or Docker Desktop + `npm run dev:docker` |
| `connectex ... 5432 refused` | Install/start Postgres, or `npm run dev:docker` |
| Empty home feed | `.\scripts\seed.ps1` |
| Schema out of date | `.\scripts\apply-migrations.ps1` or `.\scripts\reset-db.ps1` |
| DB already has tables but migrate fails | Baseline once: `go run ./cmd/migrate -cmd force -version 4` |
| Auth / 401 on library | Register at http://localhost:5173/login |
| Port in use | Stop old processes: `.\scripts\dev-stop.ps1` |

### Smoke test

```powershell
# Register a user (public API)
curl -X POST http://localhost:8080/api/v1/auth/register `
  -H "Content-Type: application/json" `
  -d '{"email":"demo@gachify.local","password":"password123","handle":"dungeon_master","display_name":"Dungeon Master"}'

# Upload a track (requires Bearer token — see Creator Hub section)
# POST /api/v1/creator/uploads/init

# List published tracks
curl http://localhost:8080/api/v1/tracks
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health/live` | Liveness |
| GET | `/health/ready` | Readiness (Postgres, Redis, MinIO/S3) — returns 503 if any dependency is down |
| GET | `/api/v1/` | API meta |
| GET | `/api/v1/users/{id}` | Get user |
| GET | `/api/v1/users/by-handle/{handle}` | Get by handle |
| GET | `/api/v1/tracks` | List/search tracks (`?q=` uses pg_trgm rank) — `creator`, `total`, `has_more` |
| GET | `/api/v1/tracks/{id}` | Get track |
| GET | `/api/v1/search/artists` | Search creators with published tracks (`?q=`, ranked) |
| POST | `/internal/seed/users` | Create user (dev or `X-Gachify-Seed-Key`) — for `seed.ps1` / Docker seed |
| POST | `/internal/seed/tracks` | Create track (dev or seed key) — demo catalog only |
| POST | `/api/v1/auth/register` | Register (email, password, handle) |
| POST | `/api/v1/auth/login` | Login → JWT |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Revoke refresh token |
| GET | `/api/v1/auth/me` | Current user (Bearer) |
| GET | `/api/v1/me/liked` | Liked track IDs |
| PUT | `/api/v1/me/liked/{track_id}` | Like track |
| DELETE | `/api/v1/me/liked/{track_id}` | Unlike track |
| GET | `/api/v1/me/playlists` | User playlists |
| POST | `/api/v1/me/library/import` | Import legacy localStorage library |

## Web player

Spotify-like layout: sidebar (Home, Search, Library), main feed, bottom player bar.

- Home — trending sections, recently played (localStorage)
- Search — browse categories + filter tracks
- Library — playlists + liked songs
- Player — shuffle, repeat, seek, volume (plays `gachi_metadata.preview_url`)

## Creator Hub (upload)

Requires: MinIO + Redis + **transcode worker**.

```powershell
docker compose up -d --wait
.\scripts\apply-migrations.ps1   # includes 003_creator_upload.sql
go run ./cmd/api                 # terminal 1
go run ./cmd/worker              # terminal 2
cd apps/web && npm run dev       # terminal 3
```

Open http://localhost:5173/upload (must be logged in).

| API | Description |
|-----|-------------|
| `POST /api/v1/creator/uploads/init` | Draft track + presigned PUT URL |
| `POST /api/v1/creator/uploads/{id}/complete` | Verify object → `processing` → enqueue |
| `POST /api/v1/creator/uploads/{id}/retry` | Re-queue transcode for failed upload (draft + `processing_error`) |
| `GET /api/v1/creator/uploads/{id}/status` | Poll status |
| `GET /api/v1/creator/tracks` | Your uploads (all statuses) |

Flow: `draft` → `processing` → `published` (worker runs **ffmpeg** → HLS in MinIO).

**Requires ffmpeg + ffprobe** on PATH for the worker.

## Streaming (HLS)

| API | Description |
|-----|-------------|
| `GET /api/v1/stream/tracks/{id}/playback` | Returns signed playlist URL for hls.js |
| `GET /api/v1/stream/playlist.m3u8?track_id=&pt=` | Master playlist with presigned segment URLs |

- Playback token (`pt`) — HMAC, short TTL (default 5m)
- Each `.ts` segment — presigned GET (default 2m)
- Web player uses **hls.js**; falls back to `preview_url` for legacy tracks

Re-upload or re-run worker on old seed tracks to generate HLS packages.

Failed transcodes retry automatically (exponential backoff, default 3 attempts) then land in Redis DLQ (`gachify:transcode:dlq`). Use **Retry transcode** in Creator Hub, **`/admin`** DLQ panel, or `POST /internal/admin/queue/dlq/retry`.

## Moderation & admin

When `GACHIFY_MODERATION_ENABLED=true`, finished transcodes enter `pending_review` until approved.

| Surface | Description |
|---------|-------------|
| Web UI | http://localhost:5173/admin — enter `GACHIFY_ADMIN_SECRET` |
| API | `GET /internal/admin/tracks?status=pending_review` (header `X-Gachify-Admin-Key`) |
| Approve / reject | `POST /internal/admin/tracks/{id}/approve` · `POST .../reject` |
| DLQ | `GET /internal/admin/queue/dlq` · `POST /internal/admin/queue/dlq/retry` |

## Observability & runbook

Start the optional monitoring stack:

```powershell
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f deploy/docker-compose.monitoring.yml up -d
```

| URL | Purpose |
|-----|---------|
| http://localhost:9090 | Prometheus (scrapes API `/metrics`) |
| http://localhost:3000 | Grafana — dashboard **Gachify Overview** (auto-provisioned) |

### Metrics (Prometheus)

| Metric | Meaning |
|--------|---------|
| `gachify_ready` | `1` when Postgres, Redis, and MinIO are up |
| `gachify_queue_depth{queue=...}` | Transcode pending / processing / retry / dlq |
| `gachify_http_request_duration_seconds` | API latency histogram |
| `gachify_transcode_duration_seconds` | Worker transcode job duration |
| `gachify_transcode_dlq_total` | Cumulative jobs dead-lettered |

### Alerts (`deploy/prometheus/alerts.yml`)

| Alert | Condition | Action |
|-------|-----------|--------|
| **GachifyNotReady** | `gachify_ready == 0` for 2m (same as `/health/ready` → 503) | See runbook below |
| **GachifyDLQNotEmpty** | DLQ depth > 0 for 5m | Open `/admin` → DLQ → Retry; inspect worker logs & ffmpeg |
| **GachifyQueueBacklog** | pending > 10 for 10m | Scale workers (`GACHIFY_WORKER_REPLICAS`) |
| **GachifyHighTranscodeDLQRate** | DLQ counter increased in 15m | Same as DLQ — fix storage/ffmpeg, retry jobs |

### Runbook

**1. `/health/ready` returns 503 (GachifyNotReady)**

1. `curl -s http://localhost:8080/health/ready | jq` — note which dependency is `down`.
2. `docker compose ps` — restart the failed service (`postgres`, `redis`, `minio`).
3. If storage is down: check MinIO disk/volume; verify `GACHIFY_S3_*` credentials.
4. Confirm recovery: `gachify_ready` → 1 in Grafana or `/metrics`.

**2. DLQ not empty**

1. Open http://localhost/admin (or Grafana **DLQ size** stat).
2. Read error message per job; common causes: ffmpeg missing, corrupt upload, S3 permission.
3. Fix root cause, click **Retry** or `POST /internal/admin/queue/dlq/retry`.
4. Re-transcode from Creator Hub if track is still `draft`.

**3. Queue backlog**

1. Check worker logs: `docker compose logs worker --tail=100`.
2. Increase replicas in prod compose or run additional `go run ./cmd/worker` locally.
3. Watch `gachify_queue_depth{queue="pending"}` decrease in Grafana.

## Backups & disaster recovery

Postgres and MinIO are the durable stores. Automated backup scripts live in `deploy/`.

| Script | Purpose |
|--------|---------|
| `deploy/backup.sh` | `pg_dump` (SQL + custom) + `mc mirror` of masters bucket |
| `deploy/restore.sh` | Restore from a timestamped backup directory |
| `deploy/restore-drill.sh` | Validate artifacts; `--full` restores into temp DB |
| `deploy/cron/gachify-backup.cron` | Example cron entries |

```bash
# Manual backup (prod stack must be running)
./deploy/backup.sh
# -> backups/YYYYMMDD-HHMMSS/{gachify.sql,gachify.dump,minio-masters/,manifest.json}

# Monthly drill (artifact check)
./deploy/restore-drill.sh backups/20260101-120000

# Full drill (isolated DB restore + row counts)
./deploy/restore-drill.sh backups/20260101-120000 --full

# Disaster restore (requires typing RESTORE)
./deploy/restore.sh backups/20260101-120000 --yes
```

Env: `GACHIFY_BACKUP_DIR` (default `./backups`), `GACHIFY_BACKUP_RETAIN_DAYS` (default `14`).

## OpenAPI contract

Machine-readable spec: [`api/openapi.yaml`](api/openapi.yaml) — also served at `GET /api/v1/openapi.yaml`.

Generate TypeScript types for the web app:

```powershell
cd apps/web
npm run gen:api-types   # -> src/api/generated/schema.ts
```

Use `paths`, `components['schemas']`, and operation types from the generated file in new client code. CI runs `gen:api-types` and fails if the spec and generated output drift.

### Production email

| Env | Behavior |
|-----|----------|
| `GACHIFY_ENV=development` | Emails logged to API stdout (`LogMailer`) |
| `GACHIFY_ENV=production` | Sent via SMTP (`GACHIFY_SMTP_*`) |

Verify / reset links use `GACHIFY_FRONTEND_URL` (e.g. `/verify-email?token=…`).

## Tests & CI

```powershell
go test ./...                              # unit tests
$env:INTEGRATION=1; go test ./internal/modules/catalog/...  # Postgres via testcontainers
cd apps/web && npm run lint && npm run build
go run ./cmd/migrate -cmd up               # apply pending DB migrations
bash scripts/smoke-e2e.sh                  # docker infra + API health + seed
```

**Migrations:** versioned SQL in `migrations/` (`000001_*.up.sql`). Tracked in `schema_migrations` by [golang-migrate](https://github.com/golang-migrate/migrate). Prod runs `migrate` container before API/worker on each deploy.

GitHub Actions (`.github/workflows/ci.yml`): `go vet`, `go test`, integration tests, web lint + build.

## Deploy with Docker (full stack)

Runs **Postgres, Redis, MinIO, API, worker, web, Caddy (HTTPS), and optional seed** in containers.

```powershell
copy .env.docker.example .env
# Edit: GACHIFY_JWT_SECRET, GACHIFY_DOMAIN, GACHIFY_PUBLIC_API_URL, GACHIFY_S3_PUBLIC_ENDPOINT

.\scripts\docker-prod.ps1 -Build
```

| Feature | Config |
|---------|--------|
| HTTPS | Set `GACHIFY_DOMAIN=your.domain` + `ACME_EMAIL` — Caddy obtains Let's Encrypt certs |
| Demo tracks | `seed` service runs once per `up` (skips if tracks exist) |
| Search | `GET /api/v1/tracks?q=dungeon&limit=20&offset=0` |
| Pagination | Response includes `total`, `has_more`; each item includes `creator` |

Open **http://localhost** (or your domain on port 80/443 via Caddy).

| Command | Purpose |
|---------|---------|
| `.\scripts\docker-prod.ps1 -Build` | Build images and start |
| `.\scripts\docker-prod.ps1 -Down` | Stop stack |
| `.\scripts\docker-prod.ps1 -Logs` | Follow api/worker/web logs |

Linux/macOS:

```bash
cp .env.docker.example .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Production on a VPS

**One-command deploy** (pull, migrate, restart — run on the server after `git push`):

```bash
chmod +x deploy/up-prod.sh
./deploy/up-prod.sh
```

Confirm DB schema: `SELECT version FROM schema_migrations;` must be **16**. If stuck at **7**, comments/profile/social APIs will not work.

1. Point DNS to the server.
2. In `.env` set, for example:
   - `GACHIFY_PUBLIC_API_URL=https://your-domain.com`
   - `GACHIFY_CORS_ORIGINS=https://your-domain.com`
   - `GACHIFY_S3_PUBLIC_ENDPOINT=https://your-domain.com:9000` (or a storage subdomain)
   - Strong `GACHIFY_JWT_SECRET`, `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`
3. Put **Caddy/nginx** in front for HTTPS, proxy to `localhost:80` (and optionally `:9000` for MinIO).
4. Do not expose Postgres/Redis ports publicly (firewall).

Local dev (infra only, API on host) is unchanged: `docker compose up -d` + `go run ./cmd/api`.

## Roadmap (next slices)

1. **Streaming** — multi-bitrate HLS, AES-128 obfuscation, CDN
3. **Auth** — OIDC / JWT middleware
4. **Web** — artist pages, queue panel, responsive mobile layout

## License

Proprietary — all rights reserved (project placeholder).

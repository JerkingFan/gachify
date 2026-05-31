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
migrations/           SQL schema (applied via Docker init)
```

## Quick start (recommended)

**Requirements:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running), Go 1.22+, Node 18+.

```powershell
# One command: Docker + API + Web + demo data
.\scripts\dev.ps1
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

### Troubleshooting

| Problem | Fix |
|---------|-----|
| `Docker daemon is not running` | Start Docker Desktop, wait until green, re-run `dev.ps1` |
| `connectex ... 5432 refused` | `docker compose up -d --wait` |
| Empty home feed | `.\scripts\seed.ps1` |
| Schema out of date | `.\scripts\apply-migrations.ps1` or `.\scripts\reset-db.ps1` |
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
| GET | `/api/v1/tracks` | List tracks (`?status=`, `?creator_id=`, `?q=`, `?limit=`, `?offset=`) — includes `creator`, `total`, `has_more` |
| GET | `/api/v1/tracks/{id}` | Get track |
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

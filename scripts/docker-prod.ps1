# Build and run full Gachify stack in Docker (API + worker + web + infra)
param(
    [switch]$Build,
    [switch]$Down,
    [switch]$Logs
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

$compose = @(
    "compose",
    "-f", "docker-compose.yml",
    "-f", "docker-compose.prod.yml"
)

if (-not (Test-Path ".env")) {
    if (Test-Path ".env.docker.example") {
        Copy-Item ".env.docker.example" ".env"
        Write-Host "Created .env from .env.docker.example — edit GACHIFY_JWT_SECRET and GACHIFY_PUBLIC_URL before production."
    } else {
        Write-Error "Missing .env — copy .env.docker.example to .env"
    }
}

if ($Down) {
    docker @compose down
    exit $LASTEXITCODE
}

if ($Logs) {
    docker @compose logs -f api worker web
    exit $LASTEXITCODE
}

$args = @compose + @("up", "-d")
if ($Build) { $args += "--build" }

docker @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Gachify is starting."
Write-Host "  Web:    http://localhost  (Caddy — ports GACHIFY_HTTP_PORT / GACHIFY_HTTPS_PORT)"
Write-Host "  Seed:   demo users/tracks if catalog is empty"
Write-Host "  API:    proxied at /api/v1 via web container"
Write-Host "  MinIO:  http://localhost:9000  (presigned HLS URLs — set GACHIFY_S3_PUBLIC_ENDPOINT)"
Write-Host "  Health: http://localhost/health/ready"
Write-Host ""
Write-Host "First run: wait ~30s for Postgres migrations, then open the site."
Write-Host "Optional seed (from host with Go): .\scripts\seed.ps1  (needs API on :8080 — use dev or exec)"

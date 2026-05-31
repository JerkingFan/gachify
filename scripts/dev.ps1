# One-command local development: Docker + API + Web + seed
# Usage:
#   .\scripts\dev.ps1              # full stack
#   .\scripts\dev.ps1 -InfraOnly   # only docker compose
#   .\scripts\dev.ps1 -NoSeed      # skip seed
#   .\scripts\dev.ps1 -NoStart     # infra + seed only (API already running elsewhere)

param(
    [switch]$InfraOnly,
    [switch]$NoSeed,
    [switch]$NoStart,
    [switch]$ResetDb
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib\dev-common.ps1"

Set-Location $script:RepoRoot

Write-Host @"

  Gachify — local development
  ===========================

"@ -ForegroundColor White

& "$PSScriptRoot\check-prereqs.ps1"
if ($LASTEXITCODE -ne 0) { exit 1 }

Ensure-EnvFile

if ($ResetDb) {
    & "$PSScriptRoot\reset-db.ps1" -Force
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

Write-DevStep "Starting Postgres + Redis (docker compose up --wait)"
Assert-DockerRunning
docker compose up -d --wait
if ($LASTEXITCODE -ne 0) {
    Write-DevErr "docker compose failed"
    exit 1
}
Write-DevOk "Infrastructure is healthy"

if (-not (Wait-TcpPort "127.0.0.1" 5432 30)) {
    Write-DevErr "Postgres port 5432 not reachable"
    exit 1
}

& "$PSScriptRoot\apply-migrations.ps1"
if ($LASTEXITCODE -ne 0) { exit 1 }

if ($InfraOnly) {
    Write-DevOk "Infra only mode — start API and Web manually:"
    Write-Host "  go run ./cmd/api"
    Write-Host "  cd apps/web && npm run dev"
    exit 0
}

Ensure-WebDeps

if ($NoStart) {
    if (-not $NoSeed) {
        & "$PSScriptRoot\seed.ps1"
    }
    exit 0
}

# Stop previous dev processes if any
if (Test-Path (Get-DevPidsPath)) {
    & "$PSScriptRoot\dev-stop.ps1"
}

Write-DevStep "Starting API (background)"
$apiJob = Start-Process -FilePath "go" `
    -ArgumentList "run", "./cmd/api" `
    -WorkingDirectory $script:RepoRoot `
    -PassThru `
    -WindowStyle Minimized

Start-Sleep -Seconds 1
if ($apiJob.HasExited) {
    Write-DevErr "API exited immediately — check database connection and logs"
    exit 1
}

Write-DevStep "Starting Web (background)"
$webJob = Start-Process -FilePath "npm" `
    -ArgumentList "run", "dev" `
    -WorkingDirectory (Join-Path $script:RepoRoot "apps\web") `
    -PassThru `
    -WindowStyle Minimized

Save-DevPids @{ api = $apiJob.Id; web = $webJob.Id }

if (-not (Wait-HttpOk "http://localhost:8080/health/ready" 60)) {
    Write-DevErr "API did not become ready in time"
    Write-Host "Try running in foreground: go run ./cmd/api"
    exit 1
}
Write-DevOk "API http://localhost:8080"

Start-Sleep -Seconds 2
if (-not (Wait-HttpOk "http://localhost:5173" 30)) {
    Write-DevWarn "Web dev server may still be starting — check http://localhost:5173"
} else {
    Write-DevOk "Web http://localhost:5173"
}

if (-not $NoSeed) {
    & "$PSScriptRoot\seed.ps1"
}

Write-Host @"

  Ready
  -----
  Web player:  http://localhost:5173
  API:         http://localhost:8080
  Health:      http://localhost:8080/health/ready

  Worker:      go run ./cmd/worker   (transcode queue — required for uploads)
  MinIO:       http://localhost:9001 (console) / :9000 (API)

  Stop:        .\scripts\dev-stop.ps1
  Reset DB:    .\scripts\reset-db.ps1
  Logs:        restore minimized PowerShell windows or run API/Web in separate terminals

"@ -ForegroundColor Green

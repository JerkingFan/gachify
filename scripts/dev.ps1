# One-command local development (no Docker by default)
# Usage:
#   .\scripts\dev.ps1              # local Redis/MinIO + API + Web
#   .\scripts\dev.ps1 -Docker      # use docker compose instead
#   .\scripts\dev.ps1 -InfraOnly   # only infra
#   .\scripts\dev.ps1 -NoSeed      # skip seed
#   .\scripts\dev.ps1 -NoStart     # infra + seed only

param(
    [switch]$Docker,
    [switch]$InfraOnly,
    [switch]$NoSeed,
    [switch]$NoStart,
    [switch]$ResetDb
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib\dev-common.ps1"

Set-Location $script:RepoRoot

Write-Host ""
Write-Host "  Gachify - local development" -ForegroundColor White
Write-Host "  ===========================" -ForegroundColor White
Write-Host ""

if ($Docker) {
    & "$PSScriptRoot\check-prereqs.ps1"
} else {
    & "$PSScriptRoot\check-prereqs.ps1" -NoDocker
}
if ($LASTEXITCODE -ne 0) { exit 1 }

Ensure-EnvFile

if ($ResetDb) {
    if ($Docker) {
        & "$PSScriptRoot\reset-db.ps1" -Force
        if ($LASTEXITCODE -ne 0) { exit 1 }
    } else {
        Write-DevWarn "Reset DB without Docker: drop/create database gachify manually, then re-run dev"
    }
}

if ($Docker) {
    Write-DevStep "Starting Postgres + Redis + MinIO (docker compose)"
    Assert-DockerRunning
    docker compose up -d --wait
    if ($LASTEXITCODE -ne 0) {
        Write-DevErr "docker compose failed"
        exit 1
    }
    Write-DevOk "Docker infrastructure is healthy"
    if (-not (Wait-TcpPort "127.0.0.1" 5432 30)) {
        Write-DevErr "Postgres port 5432 not reachable"
        exit 1
    }
} else {
    Write-DevStep "Starting local infrastructure (no Docker)"
    & "$PSScriptRoot\infra-local.ps1" -Start
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

& "$PSScriptRoot\apply-migrations.ps1"
if ($LASTEXITCODE -ne 0) { exit 1 }

if ($InfraOnly) {
    Write-DevOk "Infra only - start API and Web manually:"
    Write-Host "  go run ./cmd/api"
    Write-Host "  cd apps/web; npm run dev"
    exit 0
}

Ensure-WebDeps

if ($NoStart) {
    if (-not $NoSeed) {
        & "$PSScriptRoot\seed.ps1"
    }
    exit 0
}

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
    Write-DevErr "API exited immediately - check database connection and logs"
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
    Write-Host "Try: go run ./cmd/api"
    exit 1
}
Write-DevOk "API http://localhost:8080"

Start-Sleep -Seconds 2
if (-not (Wait-HttpOk "http://localhost:5173" 30)) {
    Write-DevWarn "Web may still be starting - http://localhost:5173"
} else {
    Write-DevOk "Web http://localhost:5173"
}

if (-not $NoSeed) {
    & "$PSScriptRoot\seed.ps1"
}

Write-Host ""
Write-Host "  Ready" -ForegroundColor Green
Write-Host "  -----" -ForegroundColor Green
Write-Host "  Web:    http://localhost:5173" -ForegroundColor Green
Write-Host "  API:    http://localhost:8080" -ForegroundColor Green
Write-Host "  MinIO:  http://localhost:9001" -ForegroundColor Green
Write-Host ""
Write-Host "  Stop:   .\scripts\dev-stop.ps1" -ForegroundColor Green
if (-not $Docker) {
    Write-Host "  Infra:  .\scripts\infra-local.ps1 -Stop" -ForegroundColor Green
}
Write-Host ""

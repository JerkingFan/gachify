# Wipes Postgres volume and reapplies migrations from ./migrations
param(
    [switch]$Force
)

. "$PSScriptRoot\lib\dev-common.ps1"

Set-Location $script:RepoRoot
Assert-DockerRunning

if (-not $Force) {
    Write-DevWarn "This deletes ALL local database data (docker volume gachify_pgdata)."
    $answer = Read-Host "Continue? [y/N]"
    if ($answer -notmatch "^[yY]") {
        Write-Host "Cancelled."
        exit 0
    }
}

Write-DevStep "Stopping stack and removing Postgres volume"
docker compose down -v
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-DevStep "Starting Postgres + Redis"
docker compose up -d --wait
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-DevStep "Applying migrations"
& "$PSScriptRoot\apply-migrations.ps1"
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-DevOk "Database reset complete. Run .\scripts\seed.ps1 after the API is up."

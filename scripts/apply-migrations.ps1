# Applies pending SQL migrations via golang-migrate (safe on existing databases).
. "$PSScriptRoot\lib\dev-common.ps1"

Set-Location $script:RepoRoot
Assert-DockerRunning

Write-DevStep "Applying pending migrations"
go run ./cmd/migrate -cmd up
if ($LASTEXITCODE -ne 0) {
    Write-DevErr "Migration failed"
    exit 1
}

Write-DevOk "Migrations applied"

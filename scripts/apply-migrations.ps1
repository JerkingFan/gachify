# Applies SQL migrations without wiping data (for existing dev databases).
. "$PSScriptRoot\lib\dev-common.ps1"

Set-Location $script:RepoRoot
Assert-DockerRunning

$migrations = Get-ChildItem "$script:RepoRoot\migrations\*.sql" | Sort-Object Name
if (-not $migrations) {
    Write-DevErr "No migrations found"
    exit 1
}

foreach ($file in $migrations) {
    Write-DevStep "Applying $($file.Name)"
    Get-Content $file.FullName -Raw | docker exec -i gachify-postgres psql -U gachify -d gachify -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) {
        Write-DevErr "Failed on $($file.Name)"
        exit 1
    }
}

Write-DevOk "Migrations applied"

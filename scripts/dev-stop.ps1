# Stops API/Web processes started by dev.ps1
. "$PSScriptRoot\lib\dev-common.ps1"

$pids = Get-DevPids
if (-not $pids) {
    Write-DevWarn "No .dev/pids.json — nothing to stop from dev.ps1"
} else {
    foreach ($name in @("api", "web")) {
        $pid = $pids.$name
        if ($pid) {
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc) {
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                Write-DevOk "Stopped $name (PID $pid)"
            }
        }
    }
    Remove-Item (Get-DevPidsPath) -Force -ErrorAction SilentlyContinue
}

Write-DevStep "Optional: stop Docker stack"
Write-Host "  docker compose down"

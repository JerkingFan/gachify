# Verifies tools required for local development.
param(
    [switch]$NoDocker
)

. "$PSScriptRoot\lib\dev-common.ps1"

$ok = $true

function Check([string]$Name, [scriptblock]$Test) {
    if (& $Test) {
        Write-DevOk $Name
    } else {
        Write-DevErr $Name
        $script:ok = $false
    }
}

Write-DevStep "Checking prerequisites"

Check "Go 1.22+" {
    if (-not (Test-CommandExists "go")) { return $false }
    $v = (go version) -replace "go version go", "" -replace " .*", ""
    return [version]$v -ge [version]"1.22"
}

Check "Node.js 18+" {
    if (-not (Test-CommandExists "node")) { return $false }
    $v = (node -v) -replace "^v", ""
    return [version]$v -ge [version]"18.0"
}

Check "npm" { Test-CommandExists "npm" }

if (-not $NoDocker) {
    Check "Docker CLI" { Test-CommandExists "docker" }

    Check "Docker daemon running" {
        if (Test-DockerDaemon) { return $true }
        Ensure-DockerRunning
    }

    Check "docker compose" {
        docker compose version 2>&1 | Out-Null
        return $LASTEXITCODE -eq 0
    }
} else {
    Write-DevWarn "Skipping Docker checks (-NoDocker)"
}

if (-not $ok) {
    Write-Host ""
    Write-DevErr "Fix the issues above, then run: .\scripts\dev.ps1"
    exit 1
}

Write-Host ""
Write-DevOk "All prerequisites satisfied"

# Shared helpers for local development scripts.

$script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Write-DevStep([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-DevOk([string]$Message) {
    Write-Host "OK  $Message" -ForegroundColor Green
}

function Write-DevWarn([string]$Message) {
    Write-Host "!!  $Message" -ForegroundColor Yellow
}

function Write-DevErr([string]$Message) {
    Write-Host "ERR $Message" -ForegroundColor Red
}

function Test-CommandExists([string]$Name) {
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-DockerDaemon([int]$TimeoutMs = 8000) {
    if (-not (Test-CommandExists "docker")) { return $false }
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "docker"
    $psi.Arguments = "info"
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    if (-not $p.WaitForExit($TimeoutMs)) {
        try { $p.Kill() } catch { }
        return $false
    }
    return $p.ExitCode -eq 0
}

function Assert-DockerRunning {
    if (-not (Test-CommandExists "docker")) {
        throw "Docker CLI not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
    }
    if (-not (Test-DockerDaemon)) {
        throw @"
Docker daemon is not running (or not responding within 8s).
  1. Start Docker Desktop and wait until it shows 'Running'
  2. Re-run: .\scripts\dev.ps1
"@
    }
}

function Wait-TcpPort([string]$HostName, [int]$Port, [int]$TimeoutSec = 90) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $client.Connect($HostName, $Port)
            $client.Close()
            return $true
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    return $false
}

function Wait-HttpOk([string]$Url, [int]$TimeoutSec = 90) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) {
                return $true
            }
        } catch {
            # retry
        }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Ensure-EnvFile {
    $example = Join-Path $script:RepoRoot ".env.example"
    $envFile = Join-Path $script:RepoRoot ".env"
    if (-not (Test-Path $envFile)) {
        Copy-Item $example $envFile
        Write-DevOk "Created .env from .env.example"
    }
}

function Ensure-WebDeps {
    $webDir = Join-Path $script:RepoRoot "apps\web"
    $modules = Join-Path $webDir "node_modules"
    if (-not (Test-Path $modules)) {
        Write-DevStep "Installing web dependencies (npm install)..."
        Push-Location $webDir
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        Pop-Location
        Write-DevOk "Web dependencies installed"
    }
}

function Get-DevPidsPath {
    return Join-Path $script:RepoRoot ".dev\pids.json"
}

function Save-DevPids([hashtable]$Pids) {
    $dir = Join-Path $script:RepoRoot ".dev"
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    $Pids | ConvertTo-Json | Set-Content (Get-DevPidsPath) -Encoding UTF8
}

function Get-DevPids() {
    $path = Get-DevPidsPath
    if (-not (Test-Path $path)) { return $null }
    return Get-Content $path -Raw | ConvertFrom-Json
}

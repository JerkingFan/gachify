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

function Start-DockerDesktopIfInstalled {
    $candidates = @(
        (Join-Path ${env:ProgramFiles} "Docker\Docker\Docker Desktop.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Docker\Docker\Docker Desktop.exe"),
        (Join-Path $env:LOCALAPPDATA "Docker\Docker Desktop.exe")
    )
    foreach ($exe in $candidates) {
        if (-not (Test-Path $exe)) { continue }
        $running = Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue
        if (-not $running) {
            Write-DevWarn "Docker Desktop is not running - starting it..."
            Start-Process -FilePath $exe | Out-Null
        }
        return $true
    }
    return $false
}

function Wait-DockerDaemon([int]$TimeoutSec = 120) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-DockerDaemon -TimeoutMs 15000) { return $true }
        Start-Sleep -Seconds 3
    }
    return $false
}

function Ensure-DockerRunning {
    if (Test-DockerDaemon) { return $true }

    if (Start-DockerDesktopIfInstalled) {
        Write-DevStep "Waiting for Docker Desktop (up to 2 min)..."
        if (Wait-DockerDaemon -TimeoutSec 120) { return $true }
    }

    return $false
}

function Assert-DockerRunning {
    if (-not (Test-CommandExists "docker")) {
        throw @"
Docker CLI not found. Install Docker Desktop:
  https://www.docker.com/products/docker-desktop/
"@
    }
    if (Ensure-DockerRunning) { return }

    throw @"
Docker daemon is not running.

  1. Open Docker Desktop from the Start menu (whale icon)
  2. Wait until it says Engine running / Running
  3. Run again: npm run dev

  Or skip Docker if Postgres+Redis are already up on localhost:
    npm run dev -- -NoDocker
"@
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

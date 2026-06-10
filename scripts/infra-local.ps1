# Local dev infra without Docker: portable Redis + MinIO in .tools/
# Usage:
#   .\scripts\infra-local.ps1 -Setup    # download binaries (one time)
#   .\scripts\infra-local.ps1 -Start    # start Redis + MinIO if ports are free
#   .\scripts\infra-local.ps1 -Stop     # stop processes we started

param(
    [switch]$Setup,
    [switch]$Start,
    [switch]$Stop
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib\dev-common.ps1"

$toolsRoot = Join-Path $script:RepoRoot ".tools"
$redisDir = Join-Path $toolsRoot "redis"
$minioDir = Join-Path $toolsRoot "minio"
$dataRoot = Join-Path $script:RepoRoot ".data"
$minioData = Join-Path $dataRoot "minio"

$RedisZipUrl = "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip"
$MinioUrl = "https://dl.min.io/server/minio/release/windows-amd64/minio.exe"
$McUrl = "https://dl.min.io/client/mc/release/windows-amd64/mc.exe"

function Get-InfraPidsPath {
    return Join-Path $script:RepoRoot ".dev\infra-pids.json"
}

function Save-InfraPids([hashtable]$Pids) {
    $dir = Join-Path $script:RepoRoot ".dev"
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    $Pids | ConvertTo-Json | Set-Content (Get-InfraPidsPath) -Encoding UTF8
}

function Get-InfraPids() {
    $path = Get-InfraPidsPath
    if (-not (Test-Path $path)) { return $null }
    return Get-Content $path -Raw | ConvertFrom-Json
}

function Download-File([string]$Url, [string]$Dest) {
    Write-DevStep "Downloading $Url"
    $parent = Split-Path $Dest -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing
}

function Ensure-LocalTools {
    $redisServer = Join-Path $redisDir "redis-server.exe"
    $minioExe = Join-Path $minioDir "minio.exe"
    $mcExe = Join-Path $minioDir "mc.exe"

    if (-not (Test-Path $redisServer)) {
        $zip = Join-Path $toolsRoot "redis.zip"
        Download-File $RedisZipUrl $zip
        $extractDir = Join-Path $toolsRoot "_redis_extract"
        if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
        if (Test-Path $redisDir) { Remove-Item $redisDir -Recurse -Force }
        Expand-Archive -Path $zip -DestinationPath $extractDir -Force
        $inner = Get-ChildItem $extractDir -Directory | Select-Object -First 1
        if ($inner -and (Test-Path (Join-Path $inner.FullName "redis-server.exe"))) {
            Move-Item $inner.FullName $redisDir
        } elseif (Test-Path (Join-Path $extractDir "redis-server.exe")) {
            New-Item -ItemType Directory -Path $redisDir -Force | Out-Null
            Move-Item (Join-Path $extractDir "*") $redisDir -Force
        } else {
            throw "Redis zip layout unexpected"
        }
        Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item $zip -Force
        Write-DevOk "Redis unpacked to .tools/redis"
    }

    if (-not (Test-Path $minioExe)) {
        Download-File $MinioUrl $minioExe
        Write-DevOk "MinIO binary ready"
    }

    if (-not (Test-Path $mcExe)) {
        Download-File $McUrl $mcExe
        Write-DevOk "MinIO client (mc) ready"
    }
}

function Ensure-MinioBuckets {
    $mcExe = Join-Path $minioDir "mc.exe"
    if (-not (Test-Path $mcExe)) { return }
    if (-not (Wait-TcpPort "127.0.0.1" 9000 30)) { return }

    $env:MC_HOST_local = "http://gachify:gachifysecret@127.0.0.1:9000"
    & $mcExe mb local/gachify-masters --ignore-existing 2>&1 | Out-Null
    & $mcExe mb local/gachify-public --ignore-existing 2>&1 | Out-Null
}

function Assert-Postgres {
    if (Wait-TcpPort "127.0.0.1" 5432 3) {
        Write-DevOk "Postgres port 5432 is open"
        return
    }

    Write-DevErr "Postgres is not running on localhost:5432"
    Write-Host ""
    Write-Host "Install once (pick one):" -ForegroundColor Yellow
    Write-Host "  winget install PostgreSQL.PostgreSQL.16"
    Write-Host "  Then create DB (psql as superuser):"
    Write-Host "    CREATE USER gachify WITH PASSWORD 'gachify';"
    Write-Host "    CREATE DATABASE gachify OWNER gachify;"
    Write-Host ""
    Write-Host "Connection string (.env): postgres://gachify:gachify@localhost:5432/gachify?sslmode=disable"
    Write-Host ""
    throw "Postgres required for Gachify API"
}

function Start-LocalInfra {
    Ensure-LocalTools

    $pids = @{}

    if (-not (Wait-TcpPort "127.0.0.1" 6379 2)) {
        $redisServer = Join-Path $redisDir "redis-server.exe"
        $redisConf = Join-Path $redisDir "gachify.conf"
        @"
bind 127.0.0.1
port 6379
dir "$redisDir"
appendonly no
"@ | Set-Content $redisConf -Encoding ASCII

        Write-DevStep "Starting local Redis :6379"
        $redisProc = Start-Process -FilePath $redisServer `
            -ArgumentList $redisConf `
            -WorkingDirectory $redisDir `
            -PassThru `
            -WindowStyle Hidden
        $pids.redis = $redisProc.Id
        if (-not (Wait-TcpPort "127.0.0.1" 6379 20)) {
            throw "Redis failed to start on port 6379"
        }
        Write-DevOk "Redis :6379"
    } else {
        Write-DevOk "Redis :6379 (already running)"
    }

    if (-not (Wait-TcpPort "127.0.0.1" 9000 2)) {
        if (-not (Test-Path $minioData)) { New-Item -ItemType Directory -Path $minioData -Force | Out-Null }
        $minioExe = Join-Path $minioDir "minio.exe"
        $env:MINIO_ROOT_USER = "gachify"
        $env:MINIO_ROOT_PASSWORD = "gachifysecret"

        Write-DevStep "Starting local MinIO :9000 (console :9001)"
        $minioProc = Start-Process -FilePath $minioExe `
            -ArgumentList "server", $minioData, "--console-address", ":9001" `
            -WorkingDirectory $minioDir `
            -PassThru `
            -WindowStyle Hidden
        $pids.minio = $minioProc.Id
        if (-not (Wait-TcpPort "127.0.0.1" 9000 30)) {
            throw "MinIO failed to start on port 9000"
        }
        Write-DevOk "MinIO :9000"
        Ensure-MinioBuckets
    } else {
        Write-DevOk "MinIO :9000 (already running)"
    }

    if ($pids.Count -gt 0) {
        Save-InfraPids $pids
    }

    Assert-Postgres
}

function Stop-LocalInfra {
    $pids = Get-InfraPids
    if (-not $pids) { return }
    foreach ($name in @("redis", "minio")) {
        $pid = $pids.$name
        if ($pid) {
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc) {
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                Write-DevOk "Stopped $name (PID $pid)"
            }
        }
    }
    Remove-Item (Get-InfraPidsPath) -Force -ErrorAction SilentlyContinue
}

if ($Setup) {
    Ensure-LocalTools
    Write-DevOk "Local tools ready in .tools/"
    Write-Host "Run: npm run dev"
    exit 0
}

if ($Stop) {
    Stop-LocalInfra
    exit 0
}

if ($Start -or (-not $Setup -and -not $Stop)) {
    Start-LocalInfra
    exit 0
}

Write-Host "Usage: infra-local.ps1 -Setup | -Start | -Stop"

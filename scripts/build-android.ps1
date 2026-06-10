# Build Gachify Android APK (debug). Requires JDK 17+, Android SDK, Node 18+.
param(
  [string]$ApiOrigin = "",
  [switch]$OpenStudio,
  [switch]$RunEmulator
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Web = Join-Path $Root "apps\web"

Push-Location $Web
try {
  if (-not (Test-Path ".env.mobile")) {
    if ($ApiOrigin) {
      @"
VITE_MOBILE=true
VITE_API_ORIGIN=$ApiOrigin
"@ | Set-Content -Encoding utf8 ".env.mobile"
      Write-Host "Created .env.mobile with VITE_API_ORIGIN=$ApiOrigin"
    } else {
      Copy-Item ".env.mobile.example" ".env.mobile"
      Write-Host "Created .env.mobile from example - edit VITE_API_ORIGIN if needed."
    }
  }

  npm run build:mobile
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  npx cap sync android
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  if ($OpenStudio) {
    npx cap open android
    exit 0
  }

  if ($RunEmulator) {
    npx cap run android
    exit $LASTEXITCODE
  }

  Push-Location android
  .\gradlew.bat assembleDebug
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $apk = Resolve-Path "app\build\outputs\apk\debug\app-debug.apk"
  Write-Host ""
  Write-Host "APK ready: $apk" -ForegroundColor Green
} finally {
  Pop-Location
}

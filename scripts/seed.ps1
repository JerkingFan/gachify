# Idempotent seed: demo users + tracks for local UI/API testing.
. "$PSScriptRoot\lib\dev-common.ps1"

param(
    [string]$ApiBase = $(if ($env:GACHIFY_API) { $env:GACHIFY_API } else { "http://localhost:8080" }),
    [switch]$Force
)

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        [object]$Body = $null
    )
    $uri = "$ApiBase/api/v1$Path"
    $params = @{
        Method      = $Method
        Uri         = $uri
        ContentType = "application/json"
    }
    if ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
    }
    return Invoke-RestMethod @params
}

Write-DevStep "Waiting for API at $ApiBase"
if (-not (Wait-HttpOk "$ApiBase/health/ready" 90)) {
    Write-DevErr "API not ready. Start it with: go run ./cmd/api"
    exit 1
}
Write-DevOk "API is ready"

if (-not $Force) {
    try {
        $existing = Invoke-Api GET "/tracks?limit=1"
        if ($existing.items -and $existing.items.Count -gt 0) {
            Write-DevWarn "Database already has tracks. Use -Force to seed anyway (may create duplicates)."
            Write-Host "Open http://localhost:5173"
            exit 0
        }
    } catch {
        Write-DevWarn "Could not check existing tracks, continuing seed..."
    }
}

function Get-OrCreateUser([string]$Handle, [string]$DisplayName, [hashtable]$Persona) {
    try {
        return Invoke-Api GET "/users/by-handle/$Handle"
    } catch {
        return Invoke-Api POST "/users" @{
            handle        = $Handle
            display_name  = $DisplayName
            gachi_persona = $Persona
        }
    }
}

$preview = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
$preview2 = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"

Write-DevStep "Creating demo users"
$user1 = Get-OrCreateUser "aniki_fan" "Aniki Fan" @{ flair = "♂️"; motto = "lets go" }
$user2 = Get-OrCreateUser "dungeon_master" "Dungeon Master" @{ flair = "🎹"; motto = "deep dark" }
Write-DevOk "Users: @$($user1.handle), @$($user2.handle)"

$tracks = @(
    @{
        creator_id     = $user1.id
        title          = "Deep Dark Fantasy (Dungeon Orchestral Mix)"
        duration_ms    = 247000
        status         = "published"
        gachi_metadata = @{
            gachi_power_level    = 87
            deepness_score       = 9.4
            dominant_male_sample = "boy_next_door"
            grunt_count          = 42
            bpm                  = 128.5
            mood_tags            = @("dungeon", "brotherhood")
            preview_url          = $preview
        }
    },
    @{
        creator_id     = $user1.id
        title          = "Slaves to the Rhythm (Bass Boosted ♂️ Mix)"
        duration_ms    = 198000
        status         = "published"
        gachi_metadata = @{
            gachi_power_level    = 72
            deepness_score       = 6.2
            dominant_male_sample = "van_darkholme"
            grunt_count          = 28
            bpm                  = 140
            mood_tags            = @("slap_bass", "club")
            preview_url          = $preview2
        }
    },
    @{
        creator_id     = $user2.id
        title          = "Boy Next Door — Orchestral Brotherhood"
        duration_ms    = 312000
        status         = "published"
        gachi_metadata = @{
            gachi_power_level    = 91
            deepness_score       = 8.8
            dominant_male_sample = "boy_next_door"
            grunt_count          = 55
            bpm                  = 96
            mood_tags            = @("orchestral", "dungeon", "deep")
            preview_url          = $preview
        }
    },
    @{
        creator_id     = $user2.id
        title          = "Fucking Slave (Continuous Mix Vol.1)"
        duration_ms    = 1800000
        status         = "published"
        gachi_metadata = @{
            gachi_power_level    = 95
            deepness_score       = 9.9
            is_continuous_mix    = $true
            wessratost_level     = 8
            mood_tags            = @("continuous", "dungeon")
            preview_url          = $preview2
        }
    }
)

Write-DevStep "Creating demo tracks"
$created = 0
foreach ($t in $tracks) {
    $out = Invoke-Api POST "/tracks" $t
    Write-Host "  + $($out.title)"
    $created++
}

Write-Host ""
Write-DevOk "Seeded $created tracks"
Write-Host "  API:  $ApiBase/api/v1/tracks"
Write-Host "  Web:  http://localhost:5173"

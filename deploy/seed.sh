#!/bin/sh
# Idempotent demo users + tracks (for Docker seed service).
set -eu

API="${GACHIFY_SEED_API_URL:-http://api:8080}"
MAX_WAIT="${GACHIFY_SEED_WAIT_SEC:-120}"

echo "seed: waiting for API at $API"
i=0
while [ "$i" -lt "$MAX_WAIT" ]; do
  if curl -sf "$API/health/ready" | grep -q '"status"'; then
    break
  fi
  i=$((i + 1))
  sleep 1
done
if [ "$i" -ge "$MAX_WAIT" ]; then
  echo "seed: API not ready after ${MAX_WAIT}s"
  exit 1
fi

if curl -sf "$API/api/v1/tracks?limit=1" | grep -q '"id"'; then
  echo "seed: tracks already exist, skipping"
  exit 0
fi

api() {
  method="$1"
  path="$2"
  body="${3:-}"
  if [ -n "$body" ]; then
    curl -sf -X "$method" -H "Content-Type: application/json" -d "$body" "$API/api/v1$path"
  else
    curl -sf -X "$method" "$API/api/v1$path"
  fi
}

get_or_create_user() {
  handle="$1"
  display="$2"
  persona="$3"
  existing=$(curl -sf "$API/api/v1/users/by-handle/$handle" 2>/dev/null || true)
  if [ -n "$existing" ]; then
    echo "$existing"
    return 0
  fi
  api POST "/users" "{\"handle\":\"$handle\",\"display_name\":\"$display\",\"gachi_persona\":$persona}"
}

echo "seed: creating users"
U1=$(get_or_create_user "aniki_fan" "Aniki Fan" '{"flair":"♂️","motto":"lets go"}')
U2=$(get_or_create_user "dungeon_master" "Dungeon Master" '{"flair":"🎹","motto":"deep dark"}')

id1=$(echo "$U1" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
id2=$(echo "$U2" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)

if [ -z "$id1" ] || [ -z "$id2" ]; then
  echo "seed: failed to parse user ids"
  exit 1
fi

PREVIEW="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
PREVIEW2="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"

echo "seed: creating tracks"
api POST "/tracks" "{\"creator_id\":\"$id1\",\"title\":\"Deep Dark Fantasy (Dungeon Orchestral Mix)\",\"duration_ms\":247000,\"status\":\"published\",\"gachi_metadata\":{\"gachi_power_level\":87,\"deepness_score\":9.4,\"dominant_male_sample\":\"boy_next_door\",\"grunt_count\":42,\"bpm\":128.5,\"mood_tags\":[\"dungeon\",\"brotherhood\"],\"preview_url\":\"$PREVIEW\"}}"
api POST "/tracks" "{\"creator_id\":\"$id1\",\"title\":\"Slaves to the Rhythm (Bass Boosted Mix)\",\"duration_ms\":198000,\"status\":\"published\",\"gachi_metadata\":{\"gachi_power_level\":72,\"deepness_score\":6.2,\"dominant_male_sample\":\"van_darkholme\",\"grunt_count\":28,\"bpm\":140,\"mood_tags\":[\"slap_bass\",\"club\"],\"preview_url\":\"$PREVIEW2\"}}"
api POST "/tracks" "{\"creator_id\":\"$id2\",\"title\":\"Boy Next Door — Orchestral Brotherhood\",\"duration_ms\":312000,\"status\":\"published\",\"gachi_metadata\":{\"gachi_power_level\":91,\"deepness_score\":8.8,\"dominant_male_sample\":\"boy_next_door\",\"grunt_count\":55,\"bpm\":96,\"mood_tags\":[\"orchestral\",\"dungeon\",\"deep\"],\"preview_url\":\"$PREVIEW\"}}"
api POST "/tracks" "{\"creator_id\":\"$id2\",\"title\":\"Fucking Slave (Continuous Mix Vol.1)\",\"duration_ms\":1800000,\"status\":\"published\",\"gachi_metadata\":{\"gachi_power_level\":95,\"deepness_score\":9.9,\"is_continuous_mix\":true,\"wessratost_level\":8,\"mood_tags\":[\"continuous\",\"dungeon\"],\"preview_url\":\"$PREVIEW2\"}}"

echo "seed: done"

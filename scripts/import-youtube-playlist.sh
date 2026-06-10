#!/usr/bin/env bash
# Import a YouTube playlist onto Gachify (VPS / Linux).
#
# Flow: yt-dlp (audio) → MP3 → Creator API → worker transcodes to HLS → tracks on site.
#
# Requirements on the server: bash, curl, jq, ffmpeg, ffprobe, yt-dlp
# Gachify stack: API + worker + MinIO must be running.
#
# Usage:
#   export GACHIFY_API_URL="https://your-domain.com"
#   export GACHIFY_EMAIL="creator@example.com"
#   export GACHIFY_PASSWORD="secret"
#   ./scripts/import-youtube-playlist.sh "https://www.youtube.com/playlist?list=PLxxxx"
#
# Optional:
#   GACHIFY_ACCESS_TOKEN=...     # skip login
#   MP3_BITRATE=192              # default 192 kbps
#   WORK_DIR=/tmp/gachify-import # temp download dir
#   DRY_RUN=1                    # only download, no upload
#   LIMIT=5                      # first N videos only

set -euo pipefail

PLAYLIST_URL="${1:-}"
API="${GACHIFY_API_URL:-http://localhost:8080}"
EMAIL="${GACHIFY_EMAIL:-}"
PASSWORD="${GACHIFY_PASSWORD:-}"
TOKEN="${GACHIFY_ACCESS_TOKEN:-}"
BITRATE="${MP3_BITRATE:-192}"
WORK_DIR="${WORK_DIR:-/tmp/gachify-import-$$}"
DRY_RUN="${DRY_RUN:-0}"
LIMIT="${LIMIT:-0}"

die() { echo "error: $*" >&2; exit 1; }

command -v curl >/dev/null || die "curl required"
command -v jq >/dev/null || die "jq required"
command -v yt-dlp >/dev/null || die "yt-dlp required (pip install yt-dlp or see https://github.com/yt-dlp/yt-dlp)"
command -v ffprobe >/dev/null || die "ffprobe required (ffmpeg package)"

[[ -n "$PLAYLIST_URL" ]] || die "usage: $0 <youtube-playlist-url>"

api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -X "$method" "${API}${path}" -H "Content-Type: application/json")
  [[ -n "$TOKEN" ]] && args+=(-H "Authorization: Bearer $TOKEN")
  [[ -n "$body" ]] && args+=(-d "$body")
  curl "${args[@]}"
}

login() {
  [[ -n "$TOKEN" ]] && return 0
  [[ -n "$EMAIL" && -n "$PASSWORD" ]] || die "set GACHIFY_ACCESS_TOKEN or GACHIFY_EMAIL + GACHIFY_PASSWORD"
  local resp
  resp=$(api POST "/api/v1/auth/login" "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
  TOKEN=$(echo "$resp" | jq -r '.access_token // empty')
  [[ -n "$TOKEN" ]] || die "login failed: $resp"
  echo "logged in"
}

duration_ms() {
  local f="$1"
  local sec
  sec=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$f")
  awk -v s="$sec" 'BEGIN { printf "%d", s * 1000 }'
}

upload_mp3() {
  local file="$1" title="$2"
  local size dur init track_id put_url

  size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file")
  dur=$(duration_ms "$file")

  # Escape JSON strings
  local jtitle jfile
  jtitle=$(jq -Rn --arg t "$title" '$t')
  jfile=$(jq -Rn --arg f "$(basename "$file")" '$f')

  init=$(api POST "/api/v1/creator/uploads/init" \
    "{\"title\":$jtitle,\"filename\":$jfile,\"content_type\":\"audio/mpeg\",\"duration_ms\":$dur,\"gachi_metadata\":{}}")

  track_id=$(echo "$init" | jq -r '.track_id // empty')
  put_url=$(echo "$init" | jq -r '.upload_url // empty')
  [[ -n "$track_id" && -n "$put_url" ]] || die "init failed for $title: $init"

  curl -sS -X PUT -H "Content-Type: audio/mpeg" --data-binary @"$file" "$put_url" >/dev/null

  api POST "/api/v1/creator/uploads/$track_id/complete" "{\"duration_ms\":$dur}" >/dev/null

  echo "  enqueued track_id=$track_id (processing → published)"
  echo "$track_id"
}

wait_published() {
  local track_id="$1" max="${2:-600}"
  local i=0 status
  while (( i < max )); do
    status=$(api GET "/api/v1/creator/uploads/$track_id/status" | jq -r '.status // empty')
    case "$status" in
      published) echo "  → published"; return 0 ;;
      draft)
        err=$(api GET "/api/v1/creator/uploads/$track_id/status" | jq -r '.processing_error // empty')
        if [[ -n "$err" ]]; then
          echo "  → failed: $err" >&2
          return 1
        fi
        ;;
      pending_review) echo "  → pending_review (moderation enabled)"; return 0 ;;
    esac
    sleep 5
    ((i += 5)) || true
  done
  echo "  → timeout waiting for published" >&2
  return 1
}

login

mkdir -p "$WORK_DIR"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "downloading playlist to $WORK_DIR (mp3 ${BITRATE}k)..."
yt_args=(
  -x --audio-format mp3
  --postprocessor-args "ffmpeg:-b:a ${BITRATE}k"
  -o "%(playlist_index)03d - %(title).200B.%(ext)s"
  --no-overwrites
  --restrict-filenames
)
(( LIMIT > 0 )) && yt_args+=(--playlist-end "$LIMIT")
yt-dlp "${yt_args[@]}" -P "$WORK_DIR" "$PLAYLIST_URL"

shopt -s nullglob
files=("$WORK_DIR"/*.mp3)
(( ${#files[@]} > 0 )) || die "no mp3 files downloaded"

echo "found ${#files[@]} file(s)"
if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN=1 — files in $WORK_DIR, upload skipped"
  trap - EXIT
  exit 0
fi

ok=0 fail=0
for f in "${files[@]}"; do
  base=$(basename "$f" .mp3)
  # strip leading "001 - " index if present
  title=$(echo "$base" | sed -E 's/^[0-9]+ - //')
  echo "upload: $title"
  if track_id=$(upload_mp3 "$f" "$title"); then
    wait_published "$track_id" || ((fail++)) || true
    ((ok++)) || true
  else
    ((fail++)) || true
  fi
done

echo "done: $ok uploaded, $fail failed"
echo "open ${API%/}/ or your web UI — tracks appear after worker transcode."

#!/usr/bin/env bash
# Import a YouTube playlist onto Gachify (VPS / Linux).
#
# Flow: yt-dlp (audio + thumbnail) → MP3 + cover → Creator API → worker transcodes → tracks on site.
#
# Requirements on the server: bash, curl, jq, ffmpeg, ffprobe, yt-dlp
# Gachify stack: API + worker + MinIO must be running.
#
# Ubuntu 24.04 (do NOT use pip install — PEP 668 blocks it):
#   sudo apt install -y ffmpeg jq curl yt-dlp
# Or standalone yt-dlp:
#   sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
#     -o /usr/local/bin/yt-dlp && sudo chmod +x /usr/local/bin/yt-dlp
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
#   LIMIT=5                      # first N successfully downloaded tracks
#   YTDLP_COOKIES=/path/cookies.txt  # Netscape cookies (export from browser) if YouTube blocks VPS
#   LOCAL_MP3_DIR=/path/to/mp3       # skip YouTube — upload existing .mp3 files (VPS blocked by YT)
#   SKIP_COVER=1                     # do not upload thumbnails / sidecar images as track covers
#   UPLOAD_DIR=/tmp/gachify-import-* # skip download — upload mp3+jpg already on disk
#   WAIT_EACH=1                      # wait for transcode after every track (slow for big playlists)
#   SKIP_WAIT=1                      # default for 10+ tracks — enqueue and exit

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
COOKIES="${YTDLP_COOKIES:-}"
LOCAL_MP3_DIR="${LOCAL_MP3_DIR:-}"
SKIP_COVER="${SKIP_COVER:-0}"
UPLOAD_DIR="${UPLOAD_DIR:-}"
WAIT_EACH="${WAIT_EACH:-0}"
SKIP_WAIT="${SKIP_WAIT:-}"

die() { echo "error: $*" >&2; exit 1; }

command -v curl >/dev/null || die "curl required"
command -v jq >/dev/null || die "jq required"
command -v ffprobe >/dev/null || die "ffprobe required (ffmpeg package)"

if [[ -n "$LOCAL_MP3_DIR" ]]; then
  [[ -d "$LOCAL_MP3_DIR" ]] || die "LOCAL_MP3_DIR not found: $LOCAL_MP3_DIR"
elif [[ -n "$PLAYLIST_URL" ]]; then
  command -v yt-dlp >/dev/null || die "yt-dlp required"
else
  die "usage: $0 <youtube-playlist-url>   OR   LOCAL_MP3_DIR=/path/to/mp3 $0"
fi

api() {
  local method="$1" path="$2" body="${3:-}"
  local args resp
  args=(-sS -X "$method" "${API}${path}" -H "Content-Type: application/json")
  [[ -n "$TOKEN" ]] && args+=(-H "Authorization: Bearer $TOKEN")
  [[ -n "$body" ]] && args+=(-d "$body")
  resp=$(curl "${args[@]}")
  if [[ "$resp" == *'"unauthorized"'* || "$resp" == *'"authentication required"'* ]]; then
    login_refresh
    args=(-sS -X "$method" "${API}${path}" -H "Content-Type: application/json")
    [[ -n "$TOKEN" ]] && args+=(-H "Authorization: Bearer $TOKEN")
    [[ -n "$body" ]] && args+=(-d "$body")
    resp=$(curl "${args[@]}")
  fi
  echo "$resp"
}

login_refresh() {
  if [[ -n "${GACHIFY_ACCESS_TOKEN:-}" ]]; then
    TOKEN="$GACHIFY_ACCESS_TOKEN"
    return 0
  fi
  [[ -n "$EMAIL" && -n "$PASSWORD" ]] || die "set GACHIFY_ACCESS_TOKEN or GACHIFY_EMAIL + GACHIFY_PASSWORD"
  local resp
  TOKEN=""
  resp=$(curl -sS -X POST "${API}/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
  TOKEN=$(echo "$resp" | jq -r '.access_token // empty')
  [[ -n "$TOKEN" ]] || die "login failed: $resp"
  echo "logged in (token refreshed)" >&2
}

login() {
  [[ -n "$TOKEN" ]] && return 0
  login_refresh
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
  if [[ -z "$track_id" || -z "$put_url" ]]; then
    echo "  init failed for $title: $init" >&2
    return 1
  fi

  if ! curl -sS -f -X PUT -H "Content-Type: audio/mpeg" --data-binary @"$file" "$put_url" >/dev/null; then
    echo "  PUT to storage failed for $title (check GACHIFY_S3_PUBLIC_ENDPOINT)" >&2
    return 1
  fi

  api POST "/api/v1/creator/uploads/$track_id/complete" "{\"duration_ms\":$dur}" >/dev/null

  echo "  enqueued track_id=$track_id (processing → published)" >&2
  echo "$track_id"
}

cover_content_type() {
  case "${1##*.}" in
    jpg|jpeg) echo "image/jpeg" ;;
    png)      echo "image/png" ;;
    webp)     echo "image/webp" ;;
    *)        echo "image/jpeg" ;;
  esac
}

# Sidecar image next to an mp3: same basename, .jpg/.png/.webp (YouTube thumb or manual).
find_cover_for_mp3() {
  local mp3="$1" base ext f
  base="${mp3%.mp3}"
  for ext in jpg jpeg png webp; do
    f="${base}.${ext}"
    if [[ -f "$f" ]]; then
      echo "$f"
      return 0
    fi
  done
  return 1
}

upload_cover() {
  local track_id="$1" cover_file="$2"
  local ct fname jfile init put_url

  [[ -f "$cover_file" ]] || return 1
  ct=$(cover_content_type "$cover_file")
  fname=$(basename "$cover_file")
  jfile=$(jq -Rn --arg f "$fname" '$f')

  init=$(api POST "/api/v1/creator/tracks/$track_id/cover/init" \
    "{\"filename\":$jfile,\"content_type\":\"$ct\"}")
  put_url=$(echo "$init" | jq -r '.upload_url // empty')
  if [[ -z "$put_url" ]]; then
    echo "  cover init failed: $init" >&2
    return 1
  fi

  if ! curl -sS -f -X PUT -H "Content-Type: $ct" --data-binary @"$cover_file" "$put_url" >/dev/null; then
    echo "  cover PUT failed (check GACHIFY_S3_PUBLIC_ENDPOINT)" >&2
    return 1
  fi

  api POST "/api/v1/creator/tracks/$track_id/cover/complete" "{}" >/dev/null
  echo "  cover uploaded: $fname" >&2
}

upload_track() {
  local file="$1" title="$2" cover_file="${3:-}"

  local track_id
  track_id=$(upload_mp3 "$file" "$title") || return 1

  if [[ "$SKIP_COVER" != "1" && -n "$cover_file" && -f "$cover_file" ]]; then
    upload_cover "$track_id" "$cover_file" || echo "  cover skipped (upload failed)" >&2
  fi

  echo "$track_id"
}

upload_files() {
  local files=("$@")
  local ok=0 fail=0 n=${#files[@]}

  if [[ -z "$SKIP_WAIT" && "$n" -ge 10 ]]; then
    SKIP_WAIT=1
  fi
  if [[ "$SKIP_WAIT" == "1" ]]; then
    echo "SKIP_WAIT=1 — uploads enqueued, worker transcodes in background ($n tracks)" >&2
  fi

  login_refresh

  for f in "${files[@]}"; do
    base=$(basename "$f" .mp3)
    title=$(echo "$base" | sed -E 's/^[0-9]+ - //')
    cover=""
    [[ "$SKIP_COVER" != "1" ]] && cover=$(find_cover_for_mp3 "$f" || true)
    echo "upload: $title${cover:+ (+ cover)}"
    if track_id=$(upload_track "$f" "$title" "$cover"); then
      if [[ "$WAIT_EACH" == "1" && "$SKIP_WAIT" != "1" ]]; then
        wait_published "$track_id" || ((fail++)) || true
      fi
      ((ok++)) || true
    else
      ((fail++)) || true
    fi
    # Proactive refresh every 50 tracks (~12 min with 15m JWT TTL)
    if (( ok > 0 && ok % 50 == 0 )); then
      login_refresh
    fi
  done
  echo "done: $ok uploaded, $fail failed"
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

shopt -s nullglob

if [[ -n "$UPLOAD_DIR" ]]; then
  [[ -d "$UPLOAD_DIR" ]] || die "UPLOAD_DIR not found: $UPLOAD_DIR"
  echo "upload-only from: $UPLOAD_DIR"
  files=("$UPLOAD_DIR"/*.mp3)
  (( ${#files[@]} > 0 )) || die "no .mp3 in UPLOAD_DIR"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "DRY_RUN=1 — would upload ${#files[@]} file(s)"
    exit 0
  fi
  upload_files "${files[@]}"
  echo "open ${API%/}/ or your web UI — tracks appear after worker transcode."
  exit 0
fi

if [[ -n "$LOCAL_MP3_DIR" ]]; then
  echo "upload-only mode: $LOCAL_MP3_DIR"
  files=("$LOCAL_MP3_DIR"/*.mp3)
  (( ${#files[@]} > 0 )) || die "no .mp3 in LOCAL_MP3_DIR"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "DRY_RUN=1 — would upload ${#files[@]} file(s):"
    printf '  %s\n' "${files[@]}"
    exit 0
  fi
  upload_files "${files[@]}"
  exit 0
fi

mkdir -p "$WORK_DIR"
if [[ "${KEEP_WORK_DIR:-0}" != "1" ]]; then
  trap 'rm -rf "$WORK_DIR"' EXIT
else
  echo "KEEP_WORK_DIR=1 — files kept in $WORK_DIR" >&2
fi

echo "downloading playlist to $WORK_DIR (audio → mp3 ${BITRATE}k + thumbnails, temp video removed)..."
yt_args=(
  --yes-playlist
  # Prefer muxed mp4; fallback audio-only; yt-dlp -x then ffmpeg → mp3 and drops source
  -f "bv*+ba/b/ba/best"
  -x --audio-format mp3
  --postprocessor-args "ffmpeg:-b:a ${BITRATE}k"
  -o "%(playlist_index)03d - %(title).200B.%(ext)s"
  --no-overwrites
  --restrict-filenames
  --ignore-errors
  --retries 5
  --fragment-retries 5
  --extractor-args "youtube:player_client=web"
  --remote-components ejs:github
)
if [[ "$SKIP_COVER" != "1" ]]; then
  yt_args+=(--write-thumbnail --convert-thumbnails jpg)
fi
if [[ -z "${YTDLP_JS_RUNTIME:-}" ]]; then
  if command -v node >/dev/null; then
    YTDLP_JS_RUNTIME="node:$(command -v node)"
  elif command -v deno >/dev/null; then
    YTDLP_JS_RUNTIME="deno:$(command -v deno)"
  fi
fi
[[ -n "${YTDLP_JS_RUNTIME:-}" ]] && yt_args+=(--js-runtimes "$YTDLP_JS_RUNTIME")
[[ -n "$COOKIES" && -f "$COOKIES" ]] && yt_args+=(--cookies "$COOKIES")
(( LIMIT > 0 )) && yt_args+=(--max-downloads "$LIMIT")
yt-dlp "${yt_args[@]}" -P "$WORK_DIR" "$PLAYLIST_URL" || true

# If -x did not run, convert leftover video/audio containers to mp3 and delete them
shopt -s nullglob
for src in "$WORK_DIR"/*.{mp4,mkv,webm,m4a,opus}; do
  [[ -f "$src" ]] || continue
  out="${src%.*}.mp3"
  [[ -f "$out" ]] && continue
  echo "converting $(basename "$src") → mp3..."
  ffmpeg -y -hide_banner -loglevel error -i "$src" -vn -codec:a libmp3lame -b:a "${BITRATE}k" "$out"
  rm -f "$src"
done

files=("$WORK_DIR"/*.mp3)
if (( ${#files[@]} == 0 )); then
  echo "hint: sudo yt-dlp -U" >&2
  echo "hint: YouTube often blocks VPS — export cookies.txt from browser:" >&2
  echo "      export YTDLP_COOKIES=~/cookies.txt" >&2
  echo "hint: test ONE video (no playlist in URL!):" >&2
  echo "      yt-dlp --no-playlist -f 'bv*+ba/b' -x --audio-format mp3 -o test.%(ext)s 'https://www.youtube.com/watch?v=AnbTd2WKYdY'" >&2
  die "no mp3 files downloaded (YouTube may block this server or all videos are unavailable)"
fi

covers=0
if [[ "$SKIP_COVER" != "1" ]]; then
  for f in "${files[@]}"; do
    find_cover_for_mp3 "$f" >/dev/null && ((covers++)) || true
  done
fi
echo "found ${#files[@]} mp3 file(s)${covers:+, $covers with cover image}"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN=1 — files in $WORK_DIR, upload skipped"
  if [[ "$SKIP_COVER" != "1" ]]; then
    for f in "${files[@]}"; do
      c=$(find_cover_for_mp3 "$f" || true)
      [[ -n "$c" ]] && echo "  cover: $(basename "$f") → $(basename "$c")"
    done
  fi
  trap - EXIT
  exit 0
fi

upload_files "${files[@]}"
echo "open ${API%/}/ or your web UI — tracks appear after worker transcode."
if [[ "${KEEP_WORK_DIR:-0}" != "1" ]]; then
  trap - EXIT
fi

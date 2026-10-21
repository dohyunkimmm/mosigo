#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

files=(
  'src/game2.mp4'
  'src/game3.mp4'
  'src/game4.mp4'
  'src/0810(4).mp4'
)
changed=0
for file in "${files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required media: $file" >&2
    exit 1
  fi
  temp="$(mktemp --suffix=.mp4)"
  trap 'rm -f "$temp"' EXIT
  echo "Compressing $file"
  ffmpeg -hide_banner -loglevel error -nostdin -y -i "$file" \
    -map 0:v:0 -an -vf "scale='min(iw,960)':-2" \
    -c:v libx264 -preset medium -crf 27 -pix_fmt yuv420p \
    -movflags +faststart "$temp"
  before="$(stat -c %s "$file")"
  after="$(stat -c %s "$temp")"
  original_duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$file")"
  optimized_duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$temp")"
  awk -v a="$original_duration" -v b="$optimized_duration" 'BEGIN { d=a-b; if (d < 0) d=-d; if (d > 0.3) exit 1; }' || {
    echo "Duration mismatch for $file" >&2
    exit 1
  }
  if (( after * 10 < before * 9 )); then
    mv "$temp" "$file"
    changed=$((changed+1))
    echo "Reduced $file: $before -> $after bytes"
  else
    echo "Kept original $file: candidate $after vs $before bytes"
    rm -f "$temp"
  fi
  trap - EXIT
done
echo "Optimized $changed of ${#files[@]} videos."

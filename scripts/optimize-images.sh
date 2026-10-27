#!/usr/bin/env bash
# Convert the two large, currently referenced PNGs to WebP without changing their dimensions.
# Usage: bash scripts/optimize-images.sh
set -euo pipefail
cd "$(dirname "$0")/.."

command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe is required" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 1; }

temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

python3 - <<'PY'
from pathlib import Path
html = Path("src/index.html").read_text()
for stem in ("gyeote_report_hero", "day"):
    png = Path("src") / (stem + ".png")
    webp = Path("src") / (stem + ".webp")
    if not png.is_file():
        if webp.is_file() and html.count(f'src="{stem}.webp"') == 1:
            continue  # Already converted; safe to rerun
        raise SystemExit(f"Missing input or existing converted reference: {png}")
    if webp.exists():
        raise SystemExit(f"Refusing to replace existing output: {webp}")
    if html.count(f'src="{stem}.png"') != 1:
        raise SystemExit(f"Expected exactly one HTML reference to {stem}.png")
PY

converted=0
for stem in gyeote_report_hero day; do
  source="src/${stem}.png"
  output="src/${stem}.webp"
  if [[ ! -e "$source" ]]; then
    echo "Already optimized: $output"
    continue
  fi

  candidate="$temp_dir/${stem}.webp"
  ffmpeg -hide_banner -loglevel error -nostdin -y -i "$source" \
    -frames:v 1 -c:v libwebp -quality 88 -compression_level 6 "$candidate"

  source_dimensions="$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height -of csv=s=x:p=0 "$source")"
  output_dimensions="$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height -of csv=s=x:p=0 "$candidate")"
  [[ "$source_dimensions" == "$output_dimensions" ]] || {
    echo "Image dimensions changed: $stem" >&2
    exit 1
  }

  before="$(stat -c %s "$source")"
  after="$(stat -c %s "$candidate")"
  if (( after * 100 > before * 85 )); then
    echo "Candidate is not at least 15% smaller: $stem ($before -> $after)" >&2
    exit 1
  fi

  # Check decoded image similarity, not just the compressed file size.
  ssim_log="$temp_dir/${stem}.ssim.log"
  ffmpeg -hide_banner -nostdin -i "$source" -i "$candidate" \
    -filter_complex "ssim" -f null - >"$ssim_log" 2>&1 || {
      cat "$ssim_log" >&2
      exit 1
    }
  ssim="$(sed -n 's/.*All:\([0-9.]*\).*/\1/p' "$ssim_log" | tail -1)"
  python3 - "$ssim" "$stem" <<'PY'
import sys
score = float(sys.argv[1]) if sys.argv[1] else 0
if score < 0.96:
    sys.exit(f"Image similarity below 0.96 for {sys.argv[2]}: {score:.4f}")
PY

  mv "$candidate" "$output"
  echo "Converted $source to $output ($before -> $after bytes; SSIM=$ssim)"
  converted=$((converted + 1))
done

python3 - <<'PY'
from pathlib import Path
path = Path("src/index.html")
html = path.read_text()
for stem in ("gyeote_report_hero", "day"):
    old = f'src="{stem}.png"'
    new = f'src="{stem}.webp"'
    if old in html:
        if not Path("src", stem + ".webp").is_file():
            raise SystemExit(f"Missing optimized output for {stem}")
        if html.count(old) != 1:
            raise SystemExit(f"Ambiguous HTML reference for {stem}")
        html = html.replace(old, new)
path.write_text(html)
PY

if (( converted == 0 )); then echo "Already optimized; no changes."; fi
echo "Re-run npm run quality and browser QA before merging."

#!/usr/bin/env bash
# CILLY 캠페인 영상 v2 재렌더링.
# 필요: ffmpeg, node + playwright(chromium), python3 + numpy
set -euo pipefail
cd "$(dirname "$0")"
ROOT=..
WORK=.work; rm -rf "$WORK"; mkdir -p "$WORK/orig" "$WORK/img"
# 원본(v1) 영상 컷은 git 히스토리에서 꺼내 씀
git -C "$ROOT" show d8b0a2e:assets/cilly-film.mp4 > "$WORK/v1.mp4"
ffmpeg -v error -y -i "$WORK/v1.mp4" -q:v 2 -start_number 0 "$WORK/orig/%04d.jpg"
cp "$ROOT"/assets/{bottle,pho,ritual,mr-extra,poster-spray-bite-repeat}.webp "$ROOT"/assets/leaf.svg "$WORK/img/"
cp index.html scene.js "$WORK/"
(cd "$WORK" && python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1) & SRV=$!
trap 'kill $SRV' EXIT; sleep 1
node render.js "$WORK/frames"
python3 audio.py "$WORK/v1.mp4" "$WORK/mix.wav"
ffmpeg -v error -y -framerate 30 -i "$WORK/frames/%04d.jpg" -i "$WORK/mix.wav" \
  -c:v libx264 -preset slow -crf 22 -maxrate 7M -bufsize 14M -pix_fmt yuv420p -profile:v high \
  -movflags +faststart -c:a aac -b:a 192k -shortest "$ROOT/assets/cilly-film.mp4"
ffmpeg -v error -y -ss 16.0 -i "$ROOT/assets/cilly-film.mp4" -frames:v 1 -q:v 3 "$ROOT/assets/cilly-film-poster.jpg"
echo done

#!/bin/sh
# Contact sheets from the capture videos: one frame every 2 s, 5 x 5 tiles at 512 x 288, read left to right, top to bottom
# (tile n = n x 2 s; the dense sheet: tile n = 2 s + n x 0.5 s). This ffmpeg has no drawtext, so no stamps.
# Usage: sh sheets.sh   (in this folder, after node capture.mjs)
cd "$(dirname "$0")"
for v in *.webm; do
  id="${v%.webm}"
  ffmpeg -loglevel error -y -i "$v" -vf "fps=1/2,scale=512:-1,tile=5x5:padding=4:color=white" -frames:v 1 -q:v 4 "$id-sheet.jpg"
  # A dense sheet of the first 24 s (one frame every 0.5 s), for reading single moves (dodges, hops, leaps).
  ffmpeg -loglevel error -y -i "$v" -vf "trim=start=2:end=26,setpts=PTS-STARTPTS,fps=2,scale=384:-1,tile=6x8:padding=3:color=white" -frames:v 1 -q:v 4 "$id-dense.jpg"
  # A small mp4 to keep in git (the full-size webm stays local).
  ffmpeg -loglevel error -y -i "$v" -vf "scale=960:-2" -c:v libx264 -crf 30 -preset veryfast -an "$id.mp4"
done

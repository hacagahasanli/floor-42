#!/bin/zsh
# (this ffmpeg has no drawtext: left = OLD ab70691, right = NEW fce5403, t = video time)
# First 60 s of each session as mp4, plus an OLD|NEW side-by-side with a timestamp burn-in.
# Usage: zsh videos.sh 1280   (or 907, or 2p-1280)
set -e
cd "${0:A:h}/../video"
S=$1
for b in old new; do
  ffmpeg -loglevel error -y -i $b-$S-session.webm -t 60 -an -c:v libx264 -pix_fmt yuv420p -crf 26 -preset veryfast $b-$S-first60.mp4
done
ffmpeg -loglevel error -y -i old-$S-first60.mp4 -i new-$S-first60.mp4 -filter_complex \
 "[0:v]scale=640:-2[a];[1:v]scale=640:-2[b];[a][b]hstack=inputs=2" \
 -c:v libx264 -pix_fmt yuv420p -crf 26 -preset veryfast side-by-side-$S-first60.mp4
ls -la *$S-first60.mp4

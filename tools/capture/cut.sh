#!/usr/bin/env bash
# Cuts picked shots out of take.mp4 files (see mktake.mjs) into a store video.
#   cut.sh <out.mp4> <W>x<H> "<takeDir>:<start>:<dur> ..."      hard cuts, short fade in and out
#   loop.sh style loops: cut.sh --loop <out.mp4> <W>x<H> <takeDir>:<start>:<dur> <crossfade>
# H.264 High, yuv420p, CRF 18, 60 fps, faststart, no audio.
set -euo pipefail
ENC=(-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -movflags +faststart -r 60 -an)
if [ "$1" = "--loop" ]; then
  out=$2; size=${3/x/:}; IFS=: read -r dir ss L <<<"$4"; f=$5
  # O = xfade(clip[f..L], clip[0..f]): the last frame equals the frame before the first one, so it loops seamlessly.
  ffmpeg -v error -y -ss "$ss" -t "$L" -i "$dir/take.mp4" -filter_complex \
    "[0:v]scale=$size:flags=lanczos:in_range=full:out_range=limited:out_color_matrix=bt709,format=yuv420p,fps=60,split[a][b];[a]trim=start=$f,setpts=PTS-STARTPTS[p];[b]trim=end=$f,setpts=PTS-STARTPTS[q];[p][q]xfade=transition=fade:duration=$f:offset=$(echo "$L - 2*$f" | bc -l)[v]" \
    -map "[v]" "${ENC[@]}" "$out"
  exit 0
fi
out=$1; size=${2/x/:}; shift 2
args=(); fc=""; n=0; total=0
for seg in $*; do
  IFS=: read -r dir ss d <<<"$seg"
  args+=(-ss "$ss" -t "$d" -i "$dir/take.mp4")
  fc+="[$n:v]scale=$size:flags=lanczos:in_range=full:out_range=limited:out_color_matrix=bt709,format=yuv420p,fps=60,setpts=PTS-STARTPTS[v$n];"
  n=$((n+1)); total=$(echo "$total + $d" | bc -l)
done
for i in $(seq 0 $((n-1))); do fc+="[v$i]"; done
fc+="concat=n=$n:v=1:a=0,fade=t=in:st=0:d=0.3,fade=t=out:st=$(echo "$total - 0.5" | bc -l):d=0.5[v]"
ffmpeg -v error -y "${args[@]}" -filter_complex "$fc" -map "[v]" "${ENC[@]}" "$out"

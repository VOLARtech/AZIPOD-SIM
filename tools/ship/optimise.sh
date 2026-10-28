#!/bin/bash
# Pack a prepared ship (prepare_ship.py → MODEL_DIR/ship.gltf) into a small .glb for the app:
# weld, simplify to about RATIO of the triangles (meshoptimizer, keeps texture seams), WebP textures
# no larger than SIZE px, meshopt-compressed geometry; ERR caps how far the simplified surface may move
# (fraction of the model's size).  usage: optimise.sh MODEL_DIR OUT.glb [RATIO] [SIZE] [ERR]
set -e
in=$1/ship.gltf; out=$2; ratio=${3:-0.5}; size=${4:-1024}; err=${5:-0.001}
GT="npx --yes @gltf-transform/cli@4.5.1"
$GT optimize "$in" "$out" --compress meshopt --texture-compress webp --texture-size "$size" \
  --simplify true --simplify-ratio "$ratio" --simplify-error "$err" --flatten true --join true --instance false --palette false
ls -la "$out" | awk '{printf "%s %.2f MB\n", $9, $5/1e6}'

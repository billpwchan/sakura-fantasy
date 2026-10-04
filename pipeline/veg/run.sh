#!/bin/zsh
# Bakes every plant atlas: renders each cell in Blender from the CC0 scans, then composes the cells into the
# public/assets/tex/*.webp atlases. Fetch the scans first (../README.md lists them; ../fetch_scan.sh <uid>) and the
# Poly Haven grass models into ../phm/ for the ground atlas.
#   BLENDER=/path/to/blender ./run.sh            all atlases
#   ./run.sh maple                               one of: blossom leaf maple broad conifer azalea bamboo tall ground turf
set -e
cd ${0:a:h}
B=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
only=${1:-}
want() { [ -z "$only" ] || [ "$only" = "$1" ]; }
bake() { $B -b --python "$@" 2>&1 | grep -E "^(CELL|BASE|LEAF|UNIT|SPAN)|Traceback|Error" || true; }
# the compose scripts run from ../node, where sharp is installed, and write straight into public/assets/tex
compose() { (cd ../node && NODE_PATH=$PWD/node_modules node ../veg/$1); }

# Yoshino cherry: four blossom cells, then the same twigs in leaf (zelkova leaves) for summer and autumn
S=../skfb/e3317fd3fd514017abd3819f4fdf4bbd/scene.gltf
L=../skfb/024e8b42dd2a4657aec9d4c872337ab1/scene.gltf
CELLS=("0 11 spray" "1 23 spray" "2 5 mass" "3 37 bud")
if want blossom; then
  mkdir -p atlas
  for a in $CELLS; do set -- ${=a}; bake blossom_atlas.py -- $S $PWD/atlas $1 $2 $3; done
  compose compose.cjs
fi
if want leaf; then
  mkdir -p sakleaf
  for a in $CELLS; do set -- ${=a}; bake blossom_atlas.py -- $S $PWD/sakleaf $1 $2 $3 $L; done
  compose compose_leaf.cjs
fi

cells() { local name=$1 script=$2; shift 2; mkdir -p $name; for c in "$@"; do bake $script -- $c $PWD/$name; done; }
if want maple; then cells maple build_maple.py 0 1 2 3; compose compose_maple.cjs; fi
if want broad; then cells broad build_broad.py 0 1; compose compose_broad.cjs; fi
if want conifer; then cells conifer build_conifer.py 0 1 2 3; compose compose_conifer.cjs; fi
if want azalea; then cells azalea build_azalea.py 0 1 2 3 4 5 6 7; compose compose_azalea.cjs; fi
if want bamboo; then cells bamboo build_bamboo.py 0 1 2 3; compose compose_bamboo.cjs; fi
if want tall; then cells tall build_tall.py 0 1 2 3 4 5 6 7; compose compose_tall.cjs; fi
if want ground; then cells ground build_ground.py {0..19}; compose compose_ground.cjs; fi
if want turf; then
  mkdir -p turf
  bake build_turf.py -- $PWD/turf
  (cd ../node && node -e "
    const sharp = require('sharp');
    sharp('../veg/turf/turf_c.png').webp({ quality: 90, effort: 6 }).toFile('../../public/assets/tex/turf_c.webp');
    sharp('../veg/turf/turf_n.png').webp({ quality: 92, effort: 6 }).toFile('../../public/assets/tex/turf_n.webp');")
fi

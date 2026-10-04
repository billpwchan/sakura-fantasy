#!/bin/zsh
# high tier: full geometry, KTX2 textures (UASTC normals and colour, ETC1S data maps), meshopt geometry
# usage: hi.sh <id> <source.gltf> <colour/normal size> <data size> <uastc|etc1s colour> [drop,nodes]
set -e
cd ${0:a:h}
export PATH="$PWD/../tools/ktxroot/bin:$PATH"
id=$1; src=$2; big=$3; small=$4; colour=$5; drop=$6
T=../hi_tmp; mkdir -p $T
node prep_hi.mjs "$src" $T/$id.a.glb "$drop"
npx gltf-transform uastc $T/$id.a.glb $T/$id.b.glb --slots normalTexture --resize $big --level 2 --rdo --rdo-lambda 2 --zstd 18 >/dev/null
if [ $colour = uastc ]; then
  npx gltf-transform uastc $T/$id.b.glb $T/$id.c.glb --slots baseColorTexture --resize $big --level 2 --rdo --rdo-lambda 2 --zstd 18 >/dev/null
else
  cp $T/$id.b.glb $T/$id.c.glb
fi
npx gltf-transform etc1s $T/$id.c.glb $T/$id.d.glb --resize $small --quality 255 >/dev/null
npx gltf-transform meshopt $T/$id.d.glb ../../public/assets/models/hi/$id.glb --level medium --quantize-position 16 --quantize-normal 12 --quantize-texcoord 14 >/dev/null
ls -la ../../public/assets/models/hi/$id.glb | awk '{printf "%s %.2f MB\n", $9, $5/1e6}'

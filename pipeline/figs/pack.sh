#!/bin/zsh
# figures for the boat: KTX2 textures (UASTC skin, which the seat camera sees on her hands, and the collar
# lettering), meshopt geometry
set -e
cd ${0:a:h}/../node
export PATH="$PWD/../tools/ktxroot/bin:$PATH"
T=../hi_tmp; F=../figs; O=../../public/assets/models/figures
U="--level 2 --rdo --rdo-lambda 2 --zstd 18"
Q="--level medium --quantize-position 16 --quantize-normal 12 --quantize-texcoord 14 --quantize-color 8"
pack() {
  npx gltf-transform dedup $F/$1.glb $T/f0.glb --materials false >/dev/null
  npx gltf-transform uastc $T/f0.glb $T/f1.glb --pattern "*diffuse*" --resize 1024 ${=U} >/dev/null
  npx gltf-transform uastc $T/f1.glb $T/f2.glb --pattern "eye*" --resize 256 ${=U} >/dev/null
  npx gltf-transform uastc $T/f2.glb $T/f2b.glb --pattern "eri*" --resize 512 ${=U} >/dev/null
  npx gltf-transform etc1s $T/f2b.glb $T/f3.glb --resize 512 --quality 255 >/dev/null
  npx gltf-transform meshopt $T/f3.glb $O/$2.glb ${=Q} >/dev/null
}
pack pas_full passenger
pack man_full boatman
npx gltf-transform meshopt $F/wagasa.glb $O/wagasa.glb ${=Q} >/dev/null
ls -la $O/*.glb | awk '{printf "%s %.2f MB\n", $9, $5/1e6}'

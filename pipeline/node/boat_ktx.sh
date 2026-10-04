#!/bin/zsh
# boat tiers: quick (1K ETC1S, 512 UASTC normals) for the first frame; full (2K UASTC on the wood and toma that fill
# the frame, 1K for the small materials) streamed in after it
set -e
cd ${0:a:h}
export PATH="$PWD/../tools/ktxroot/bin:$PATH"
T=../hi_tmp; S=../boat/boat.glb; O=../../public/assets/models
U="--level 2 --rdo --rdo-lambda 2 --zstd 18"
npx gltf-transform dedup $S $T/b0.glb >/dev/null
# full
npx gltf-transform uastc $T/b0.glb $T/b1.glb --pattern "rough_wood_diff*" --resize 2048 ${=U} >/dev/null
npx gltf-transform uastc $T/b1.glb $T/b2.glb --pattern "rough_wood_nor*" --resize 2048 ${=U} >/dev/null
npx gltf-transform uastc $T/b2.glb $T/b3.glb --pattern "toma_color*" --resize 2048 ${=U} >/dev/null
npx gltf-transform uastc $T/b3.glb $T/b4.glb --pattern "Wicker013*Normal*" --resize 2048 ${=U} >/dev/null
npx gltf-transform uastc $T/b4.glb $T/b5.glb --slots normalTexture --resize 1024 ${=U} >/dev/null
npx gltf-transform etc1s $T/b5.glb $T/b6.glb --pattern "*hull_ao*" --resize 2048 --quality 255 >/dev/null
npx gltf-transform etc1s $T/b6.glb $T/b7.glb --resize 1024 --quality 255 >/dev/null
npx gltf-transform meshopt $T/b7.glb $O/hi/boat.glb --level medium --quantize-position 16 --quantize-normal 12 --quantize-texcoord 14 >/dev/null
# quick
npx gltf-transform uastc $T/b0.glb $T/q1.glb --slots normalTexture --resize 512 ${=U} >/dev/null
npx gltf-transform etc1s $T/q1.glb $T/q2.glb --resize 1024 --quality 200 >/dev/null
npx gltf-transform meshopt $T/q2.glb $O/boat.glb --level medium --quantize-position 16 --quantize-normal 12 --quantize-texcoord 14 >/dev/null
ls -la $O/boat.glb $O/hi/boat.glb | awk '{printf "%s %.2f MB\n", $9, $5/1e6}'

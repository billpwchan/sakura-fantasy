import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, textureCompress, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const OUT = '../../public/assets/models';
mkdirSync(OUT, { recursive: true });
// [id, ratio, error, texture size]
const jobs = [
  ['rock_moss_set_01', 0.12, 0.02, 1024],
  ['rock_moss_set_02', 0.13, 0.02, 1024],
  ['boulder_01', 0.035, 0.05, 1024],
  ['fern_02', 0.45, 0.01, 1024],
  ['shrub_02', 0.35, 0.01, 1024],
  ['tree_stump_01', 0.05, 0.02, 1024],
  ['dead_tree_trunk', 0.025, 0.003, 1024],
];
for (const [id, ratio, error, size] of jobs) {
  const doc = await io.read(`${id}/${id}_1k.gltf`);
  const before = doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + p.getIndices().getCount() / 3, 0), 0);
  const steps = [dedup(), weld()];
  if (ratio < 1) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio, error }));
  steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }), prune());
  await doc.transform(...steps);
  const after = doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + p.getIndices().getCount() / 3, 0), 0);
  await io.write(`${OUT}/${id}.glb`, doc);
  console.log(id, before, '->', after, 'tris', (statSync(`${OUT}/${id}.glb`).size / 1e6).toFixed(2), 'MB');
}

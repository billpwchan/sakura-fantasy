// Sketchfab scans (CC BY 4.0) -> trimmed GLBs: keep the listed nodes, simplify, webp textures
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, textureCompress, prune, dedup, flatten } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'node:fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const OUT = '../../public/assets/models';
const SRC = '../skfb/';
const tris = (doc) => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + p.getIndices().getCount() / 3, 0), 0);
// [out id, source uid, node names to drop, simplify ratio, error, texture size]
const jobs = JSON.parse(process.argv[2]);
for (const [id, uid, drop, ratio, error, size] of jobs) {
  const doc = await io.read(`${SRC}${uid}/scene.gltf`);
  for (const n of doc.getRoot().listNodes()) if (drop.includes(n.getName())) n.dispose();
  const before = tris(doc);
  const steps = [prune(), flatten(), dedup(), weld()];
  if (ratio < 1) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio, error }));
  steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }), prune());
  await doc.transform(...steps);
  await io.write(`${OUT}/${id}.glb`, doc);
  console.log(id, before, '->', tris(doc), 'tris', (statSync(`${OUT}/${id}.glb`).size / 1e6).toFixed(2), 'MB');
}

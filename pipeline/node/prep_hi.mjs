// full-detail source -> cleaned glb (no decimation): drop unwanted nodes, prune, dedup, weld
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld } from '@gltf-transform/functions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [src, out, dropList = ''] = process.argv.slice(2);
const drop = dropList ? dropList.split(',') : [];
const doc = await io.read(src);
for (const n of doc.getRoot().listNodes()) if (drop.includes(n.getName())) n.dispose();
await doc.transform(prune(), dedup(), weld());
const tris = doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + p.getIndices().getCount() / 3, 0), 0);
const tex = doc.getRoot().listTextures().map((t) => `${t.getName() || t.getURI()}:${t.getSize()?.join('x')}`);
await io.write(out, doc);
console.log(out.split('/').pop(), tris, 'tris', tex.join(' '));

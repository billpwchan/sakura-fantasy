// World generation off the main thread: terrain chunks, tree and ground-cover placement for a z range.
import { buildTerrainChunk } from './terrain-gen.js';
import { placeTrees } from './place-trees.js';
import { genGrass } from './place-grass.js';

self.onmessage = (e) => {
  const { id, job, args } = e.data;
  let result, transfer = [];
  if (job === 'terrain') {
    result = args.chunks.map((ci) => buildTerrainChunk(ci));
    for (const c of result) transfer.push(c.pos.buffer, c.aux.buffer);
  } else if (job === 'trees') {
    result = placeTrees(args.zFrom, args.zTo, args.seed);
    transfer = Object.values(result).map((a) => a.buffer);
  } else if (job === 'grass') {
    result = genGrass(args.zFrom, args.zTo, args.seed);
    transfer = Object.values(result).map((a) => a.buffer);
  }
  self.postMessage({ id, result }, transfer);
};

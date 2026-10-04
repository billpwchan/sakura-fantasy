// Pure terrain sampling for the generation workers: chunk grids dense at the water, stretching to the ridges.
import { riverAt, terrainHeight, waterSd, forestAt } from './layout.js';
import './sites.js';

export const T_Z0 = 760, T_Z1 = -2960, CHUNK = 120;

function columnOffsets() {
  const off = [0];
  let x = 0, step = 1.3;
  while (x < 900) {
    if (x > 46) step *= 1.05;
    x += step;
    off.push(x);
  }
  const neg = off.slice(1).map((v) => -v).reverse();
  return neg.concat(off);
}

export const TERRAIN_CHUNKS = Math.ceil((T_Z0 - T_Z1) / CHUNK);

export function buildTerrainChunk(ci) {
  const cols = columnOffsets();
  const nc = cols.length;
  const z0 = T_Z0 - ci * CHUNK;
  const z1 = Math.max(T_Z1, z0 - CHUNK);
  const rows = Math.round((z0 - z1) / 2);
  const nr = rows + 1;
  const pos = new Float32Array(nc * nr * 3);
  const aux = new Float32Array(nc * nr * 2); // forest density, water distance
  let k = 0;
  for (let j = 0; j < nr; j++) {
    const z = z0 - (j / rows) * (z0 - z1);
    const cx = riverAt(z).x;
    for (let i = 0; i < nc; i++) {
      const x = cx + cols[i];
      const h = terrainHeight(x, z);
      const sd = waterSd(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      aux[k * 2] = forestAt(x, z, h, sd);
      aux[k * 2 + 1] = sd;
      k++;
    }
  }
  return { ci, pos, aux, nc, nr };
}


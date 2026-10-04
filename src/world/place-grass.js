// Pure ground-cover placement for the generation workers. Heights, water distance and slope come from a
// 1.5 m corridor grid sampled once per range (far cheaper than evaluating the terrain per clump).
// Output per kind: Float32Array of [x, y, z, rotY, scale, seed, 0, 0].
import { rng, smoothstep, vnoise } from '../lib/math.js';
import { riverAt, terrainHeight, waterSd, ISLAND } from './layout.js';
import { blocked } from './sites.js';

export const KINDS = ['meadow', 'reed', 'flower', 'susuki'];
const STEP = 1.5;

function corridorGrid(zFrom, zTo) {
  const rows = Math.ceil((zFrom - zTo) / STEP) + 3;
  const half = 270;
  const cols = Math.ceil((half * 2) / STEP) + 1;
  const cx = new Float32Array(rows), span = new Float32Array(rows);
  const H = new Float32Array(rows * cols), SD = new Float32Array(rows * cols);
  for (let j = 0; j < rows; j++) {
    const z = zFrom + STEP - j * STEP;
    const r = riverAt(z);
    const lake = z < -2050;
    cx[j] = lake ? 0 : r.x;
    span[j] = lake ? 262 : r.w + 72;
    for (let i = 0; i < cols; i++) {
      const dx = -half + i * STEP;
      if (Math.abs(dx) > span[j] + STEP * 2) { H[j * cols + i] = 999; SD[j * cols + i] = 999; continue; }
      const x = cx[j] + dx;
      SD[j * cols + i] = waterSd(x, z);
      H[j * cols + i] = SD[j * cols + i] > 80 ? 999 : terrainHeight(x, z);
    }
  }
  const z0 = zFrom + STEP;
  // bilinear sample in corridor coordinates (column offsets are relative to each row's centre)
  const sample = (x, z, out) => {
    const fj = (z0 - z) / STEP;
    const j = Math.max(0, Math.min(rows - 2, Math.floor(fj)));
    const tj = Math.min(1, Math.max(0, fj - j));
    const c = cx[j] + (cx[j + 1] - cx[j]) * tj;
    const fi = (x - c + half) / STEP;
    const i = Math.max(0, Math.min(cols - 2, Math.floor(fi)));
    const ti = Math.min(1, Math.max(0, fi - i));
    const a = j * cols + i, b = a + 1, d = a + cols, e = d + 1;
    const lerp2 = (A) => (A[a] * (1 - ti) + A[b] * ti) * (1 - tj) + (A[d] * (1 - ti) + A[e] * ti) * tj;
    out.h = lerp2(H);
    out.sd = lerp2(SD);
    // slope from the grid cell
    const gx = ((H[b] - H[a]) + (H[e] - H[d])) * 0.5 / STEP;
    const gz = ((H[d] - H[a]) + (H[e] - H[b])) * 0.5 / STEP;
    out.ny = 1 / Math.sqrt(1 + gx * gx + gz * gz);
    return out;
  };
  return { sample };
}

export function genGrass(zFrom, zTo, seed) {
  const R = rng(seed);
  const out = { meadow: [], reed: [], flower: [], susuki: [] };
  const grid = corridorGrid(zFrom, zTo);
  const g = { h: 0, sd: 0, ny: 1 };
  const push = (arr, x, y, z, s) => arr.push(x, y, z, R.next() * Math.PI * 2, s, R.next(), 0, 0);
  for (let z = zFrom; z > zTo; z -= 0.95) {
    const r = riverAt(z);
    const lakeZone = z < -2050;
    const cx = lakeZone ? 0 : r.x;
    const span = lakeZone ? 260 : r.w + 70;
    for (let x = cx - span; x < cx + span; x += 0.95) {
      const jx = x + R.range(-0.47, 0.47), jz = z + R.range(-0.47, 0.47);
      grid.sample(jx, jz, g);
      const sd = g.sd;
      if (sd > 70 || sd < -1.6 || g.h > 60) continue;
      const roll = R.next();
      const patchN = vnoise(jx * 0.07, jz * 0.07);
      if (sd < 0.5) {
        // reeds in the shallows, in stands
        if (patchN > 0.52 && roll < 0.3 + (patchN - 0.52) * 1.6 && !lakeZone && g.h > -0.9) {
          push(out.reed, jx, g.h, jz, R.range(0.8, 1.3));
          // inside a bed the stands crowd together
          if (patchN > 0.62 && R.next() < 0.6) push(out.reed, jx + R.range(-0.5, 0.5), g.h, jz + R.range(-0.5, 0.5), R.range(0.75, 1.15));
        }
        continue;
      }
      const dens = sd < 22 ? 0.95 : 0.95 - smoothstep(22, 70, sd) * 0.6;
      if (roll > dens * (0.55 + 0.45 * patchN)) continue;
      if (Math.hypot(jx - ISLAND.x, jz - ISLAND.z) < 6) continue;
      if (g.ny < 0.62) continue;
      if (blocked(jx, jz, -1.0)) continue;
      const k = R.next();
      const flowerN = vnoise(jx * 0.05 + 9.0, jz * 0.05);
      if ((flowerN > 0.5 && sd < 35 && k < 0.24) || k < 0.025) push(out.flower, jx, g.h, jz, R.range(0.85, 1.25));
      else if (vnoise(jx * 0.04 - 3.0, jz * 0.04 + 1.0) > 0.68 && sd > 4 && k < 0.3) push(out.susuki, jx, g.h, jz, R.range(0.85, 1.25));
      else {
        // a sward, not scattered tufts: near the water the cards overlap into one another
        push(out.meadow, jx, g.h, jz, R.range(0.9, 1.45) * (sd < 3 ? 0.85 : 1));
        if (sd < 40 && R.next() < 0.8) push(out.meadow, jx + R.range(-0.45, 0.45), g.h, jz + R.range(-0.45, 0.45), R.range(0.8, 1.3));
      }
    }
  }
  const pack = {};
  for (const k of KINDS) pack[k] = new Float32Array(out[k]);
  return pack;
}

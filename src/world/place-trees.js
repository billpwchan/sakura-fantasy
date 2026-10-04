// Pure tree placement for the generation workers. Output per species: Float32Array of
// [x, y, z, rotY, scale, tilt, variant] records.
import { rng, smoothstep, vnoise, fract } from '../lib/math.js';
import { riverAt, terrainHeight, waterSd, forestAt, terrainNormal, ISLAND } from './layout.js';
import { blocked } from './sites.js';

export const SPECIES = ['sakura', 'maple', 'broad', 'pine', 'cedar', 'bamboo', 'azalea', 'farCon', 'farBroad'];
export const TREE_STRIDE = 8;

const NV = { sakura: 3, maple: 3, broad: 2, pine: 2, cedar: 2, bamboo: 2, azalea: 3, farCon: 3, farBroad: 2 };

export function placeTrees(zFrom, zTo, seed) {
  const R = rng(seed);
  const out = {};
  for (const k of SPECIES) out[k] = [];
  const n = [0, 1, 0];
  // lean: tilt (radians) toward +x by tx, toward +z by tz
  const put = (name, x, z, s, tx = R.range(-0.04, 0.04), tz = R.range(-0.04, 0.04)) => {
    const y = terrainHeight(x, z);
    out[name].push(x, y - 0.15 * s, z, R.next() * Math.PI * 2, s, tx, tz, Math.floor(R.next() * NV[name]));
  };
  const clear = (x, z, m = 1.5) => !blocked(x, z, m);
  const inRange = (z) => z <= zFrom && z > zTo;

  // the cherry avenue: rows hugging both banks, leaning out over the water
  for (const side of [-1, 1]) {
    for (let z = -236; z > -632; z -= R.range(8.5, 12)) {
      if (!inRange(z)) continue;
      const r = riverAt(z);
      const x = r.x + side * (r.w + R.range(2.5, 5));
      if (waterSd(x, z) < 1.5 || !clear(x, z)) continue;
      put('sakura', x, z, R.range(1.25, 1.6), -side * R.range(0.08, 0.2), R.range(-0.05, 0.05));
      if (R.next() < 0.6) {
        const z2 = z + R.range(-4, 4);
        const x2 = r.x + side * (r.w + R.range(11, 18));
        if (clear(x2, z2)) put('sakura', x2, z2, R.range(1.1, 1.45));
      }
    }
  }

  // scattered by a jittered grid over the corridor
  const STEP = 5.5;
  const zStart = Math.floor(zFrom / STEP) * STEP;
  for (let z = zStart; z > zTo; z -= STEP) {
    const cx = riverAt(z).x;
    for (let dx = -470; dx <= 470; dx += STEP) {
      const x = cx + dx + R.range(-2.4, 2.4);
      const zz = z + R.range(-2.4, 2.4);
      const sd = waterSd(x, zz);
      if (sd < 2.2) continue;
      const near = sd < 85;
      if (Math.hypot(x - ISLAND.x, zz - ISLAND.z) < ISLAND.r + 6) continue;
      const h = terrainHeight(x, zz);
      const f = forestAt(x, zz, h, sd);
      const roll = R.next();
      if (near) {
        if (!clear(x, zz)) continue;
        terrainNormal(x, zz, 1.0, n);
        // the gorge fades in and out over a hundred metres, cell by cell (a hash, not R, so the rest of the world
        // keeps its draw), so its grove has no cut end facing the boat
        const gw = smoothstep(-1110, -1230, zz) * (1 - smoothstep(-1570, -1630, zz));
        const gorge = fract(Math.sin(x * 12.9898 + zz * 78.233) * 43758.5453) < gw;
        // the gorge walls are a bamboo forest: culms stand up out of the slope, leaning a little downhill
        if ((gorge || gw > 0.1) && n[1] < 0.7) {
          if (n[1] < 0.25) continue;
          // the odd sugi or maple stands up out of the grove, and the grove thins and thickens in patches, so the
          // wall is not one even pile of leaves
          if (sd > 15 && R.next() < 0.05) put(R.next() < 0.6 ? 'cedar' : 'maple', x, zz, R.range(0.9, 1.25));
          const k = Math.round(R.int(8, 15) * (0.45 + 0.55 * vnoise(x * 0.04 + 3.3, zz * 0.04)) * (1 - smoothstep(60, 84, sd) * 0.5) * Math.max(gw, 0.35));
          for (let i = 0; i < k; i++) {
            const bx = x + R.range(-2.9, 2.9), bz = zz + R.range(-2.9, 2.9);
            if (waterSd(bx, bz) > 2.0) put('bamboo', bx, bz, R.range(0.85, 1.25), n[0] * 0.18 + R.range(-0.04, 0.04), n[2] * 0.18 + R.range(-0.04, 0.04));
          }
          continue;
        }
        if (n[1] < 0.7) continue;
        const village = zz < -800 && zz > -1120;
        const nz = vnoise(x * 0.03, zz * 0.03);
        // the gorge's bamboo climbs past the steep walls and thins out among the sugi above, with no hem
        if ((gorge && sd > 4 && sd < 84 && roll < 0.42 * (1 - smoothstep(40, 84, sd) * 0.65)) || (village && nz > 0.72 && sd > 14 && roll < 0.5) || (nz > 0.86 && sd > 10 && roll < 0.3 && zz < -300)) {
          const k = R.int(3, 7);
          for (let i = 0; i < k; i++) {
            const bx = x + R.range(-1.6, 1.6), bz = zz + R.range(-1.6, 1.6);
            if (waterSd(bx, bz) > 2.5) put('bamboo', bx, bz, R.range(0.8, 1.15));
          }
          continue;
        }
        // tsutsuji in loose drifts along the banks and around the village, where the ground is level
        if (!gorge && sd > 3 && sd < 42 && n[1] > 0.88 && vnoise(x * 0.045 + 11.0, zz * 0.045) > 0.66 && roll < 0.38) {
          const k = R.int(1, 4);
          for (let i = 0; i < k; i++) {
            const bx = x + R.range(-2.4, 2.4), bz = zz + R.range(-2.4, 2.4);
            if (waterSd(bx, bz) > 2.5 && clear(bx, bz)) put('azalea', bx, bz, R.range(0.9, 1.45), R.range(-0.03, 0.03), R.range(-0.03, 0.03));
          }
          continue;
        }
        const pDense = 0.07 + f * 0.5;
        if (roll > pDense) continue;
        const pick = R.next();
        const autumnTown = gorge || village || (zz < -1600 && zz > -2100);
        // kuromatsu lean over the banks down to the village, and stand along the lake shore
        if (sd < 14 && pick < 0.3 && (zz > -1120 || zz < -2050) && !gorge) put('pine', x, zz, R.range(0.8, 1.15));
        else if (autumnTown && pick < 0.42) put('maple', x, zz, R.range(0.9, 1.3));
        else if (pick < 0.1 && zz > -2100) put('sakura', x, zz, R.range(1.0, 1.35));
        else if (pick < (sd > 25 ? 0.66 : 0.42)) put('cedar', x, zz, R.range(0.8, 1.25));
        else put('broad', x, zz, R.range(0.9, 1.3));
      } else {
        // far hills: closed stands of planted sugi, broadleaf only in the hollows; a second, younger tree
        // fills most gaps so the canopy reads as a forest of spires, not scattered cones
        const decid = vnoise(x * 0.012 + 4.0, zz * 0.012) > 0.74 && h < 120;
        // broadleaf stands close their canopy: crowns overlap, so the hollow reads as one rolling roof of leaves
        // rather than single puffs on bare ground
        if (roll > Math.min(1, f * 1.15 + (decid ? 0.35 : 0))) continue;
        if (!clear(x, zz, 0)) continue;
        const s = R.range(13, 21) * (1 - smoothstep(150, 260, h) * 0.3);
        if (decid && sd < 112) {
          // the first rank of broadleaf above the banks is near enough to read leaf by leaf: real crowns, drawn
          // without twigs and with half the leaf cards (they are never within 85 m of the boat)
          put('broad', x, zz, R.range(1.3, 1.7));
        } else if (decid) {
          put('farBroad', x, zz, s * R.range(0.7, 0.9));
          if (R.next() < 0.4) put('farBroad', x + R.range(-2.8, 2.8), zz + R.range(-2.8, 2.8), s * R.range(0.5, 0.66));
        } else {
          put('farCon', x, zz, s);
          if (R.next() < f * 0.8) put('farCon', x + R.range(-2.6, 2.6), zz + R.range(-2.6, 2.6), s * R.range(0.6, 0.85));
        }
      }
    }
  }
  const packed = {};
  for (const k of SPECIES) packed[k] = new Float32Array(out[k]);
  return packed;
}

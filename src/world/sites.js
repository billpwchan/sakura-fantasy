// Where everything built stands. Registering pads here flattens the terrain before it is generated,
// and the same list keeps trees and grass out of buildings.
import { riverAt, addPad, LAKE, ISLAND } from './layout.js';
import { rng } from '../lib/math.js';

const bank = (z, side, off) => {
  const r = riverAt(z);
  return { x: r.x + side * (r.w + off), z };
};

export const SITES = {
  bridge: { z: -700 },
  pagoda: null,
  hall: null,
  belfry: null,
  houses: [],
  shrine: null,
  embank: { z0: -830, z1: -1075, side: -1 },
  torii: { z0: -1690, z1: -1882, step: 4.8 },
  otorii: { x: 0, z: -2160 },
  tree: { x: ISLAND.x, z: ISLAND.z },
  hokora: null,
  lakeLanterns: [],
  bankLanterns: [],
  waterfall: { z: -1405, side: -1 },
  komainu: [],
  jizo: [],
};

// blockers: circles (x, z, r) no vegetation may enter
export const BLOCK = [];
const block = (x, z, r) => BLOCK.push({ x, z, r });

(function layout() {
  // drum bridge abutments
  const rb = riverAt(SITES.bridge.z);
  SITES.bridge.x = rb.x;
  SITES.bridge.half = rb.w + 3.5;
  for (const s of [-1, 1]) {
    const p = bank(SITES.bridge.z, s, 5);
    addPad(p.x, p.z, 4.5, 1.25, 6);
    block(p.x, p.z, 7);
  }

  // pagoda on a stone terrace above the right bank
  const pg = bank(-885, 1, 34);
  SITES.pagoda = { x: pg.x, z: pg.z, y: 3.2 };
  addPad(pg.x, pg.z, 9.5, 3.2, 10);
  block(pg.x, pg.z, 14);
  const hl = bank(-955, 1, 44);
  SITES.hall = { x: hl.x, z: hl.z, y: 3.4 };
  addPad(hl.x, hl.z, 14, 3.4, 12);
  block(hl.x, hl.z, 20);
  const bf = bank(-918, 1, 20);
  SITES.belfry = { x: bf.x, z: bf.z, y: 2.6 };
  addPad(bf.x, bf.z, 4.5, 2.6, 6);
  block(bf.x, bf.z, 7);
  // the path from the landing up to the hall
  for (let t = 0; t <= 1; t += 0.1) {
    const a = bank(-905, 1, 3 + t * 30);
    block(a.x, a.z + t * 8, 3);
  }

  // village: houses on the left bank behind the stone embankment, a few on the right
  const R = rng(91);
  for (let z = -840; z > -1070; z -= R.range(15, 22)) {
    const p = bank(z, -1, R.range(9, 13));
    const y = 1.85;
    SITES.houses.push({ x: p.x, z: p.z, y, rot: Math.PI / 2 + R.range(-0.06, 0.06), w: R.range(7, 9.5), d: R.range(5.5, 7), floors: R.next() < 0.3 ? 2 : 1, seed: R.int(1, 1e6) });
    addPad(p.x, p.z, 6, y, 5);
    block(p.x, p.z, 8);
    if (R.next() < 0.45) {
      const q = bank(z + R.range(-4, 4), -1, R.range(24, 32));
      SITES.houses.push({ x: q.x, z: q.z, y: 2.2, rot: Math.PI / 2 + R.range(-0.25, 0.25), w: R.range(6, 8), d: R.range(5, 6), floors: 1, seed: R.int(1, 1e6) });
      addPad(q.x, q.z, 5.5, 2.2, 5);
      block(q.x, q.z, 7.5);
    }
  }
  for (const z of [-835, -1000, -1040]) {
    const p = bank(z, 1, 9);
    SITES.houses.push({ x: p.x, z: p.z, y: 1.5, rot: -Math.PI / 2, w: 7.5, d: 6, floors: 1, seed: z * 7 });
    addPad(p.x, p.z, 5.5, 1.5, 5);
    block(p.x, p.z, 7.5);
  }
  // embankment top stays level
  for (let z = SITES.embank.z0; z > SITES.embank.z1; z -= 6) {
    const p = bank(z, -1, 3.2);
    addPad(p.x, p.z, 3.2, 1.85, 3);
    block(p.x, p.z, 4);
  }

  // a wayside shrine in the morning shallows
  const sh = bank(-130, -1, 9);
  SITES.shrine = { x: sh.x, z: sh.z, y: 1.0 };
  addPad(sh.x, sh.z, 4, 1.0, 5);
  block(sh.x, sh.z, 6);
  // roadside jizo in their red bibs, three on either side of it, facing the river
  for (const sz of [-1, 1]) for (let k = 0; k < 3; k++) SITES.jizo.push({ x: sh.x - 0.4 + k * 0.3, z: sh.z + sz * (2.9 + k * 0.75) });

  // a pair of komainu guard the first of the river gates, one on each bank, on a levelled footing
  for (const side of [-1, 1]) {
    const p = bank(SITES.torii.z0 + 7, side, 3.0);
    SITES.komainu.push({ x: p.x, z: p.z, side, y: 0.5 });
    addPad(p.x, p.z, 1.1, 0.5, 1.4);
    block(p.x, p.z, 2.2);
  }

  // lanterns along the village banks and around the lake
  for (let z = -830; z > -1080; z -= 24) {
    const p = bank(z, -1, 2.2);
    SITES.bankLanterns.push({ x: p.x, z: p.z, kind: 'stone' });
  }
  for (let z = -845; z > -1080; z -= 30) {
    const p = bank(z, 1, 3.5);
    SITES.bankLanterns.push({ x: p.x, z: p.z, kind: 'stone' });
  }
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.1;
    if (Math.abs(Math.atan2(-Math.cos(a), Math.sin(a))) < 0.3) continue; // leave the river mouth open
    const r = LAKE.r + 6;
    SITES.lakeLanterns.push({ x: LAKE.x + Math.cos(a) * r, z: LAKE.z + Math.sin(a) * r, kind: 'stone' });
  }

  // keep the gorge wall clear where the waterfall comes down, and let it fall into a pool worn into the wall's foot
  {
    const W = SITES.waterfall;
    for (const dz of [-4, 0, 4]) {
      const p = bank(W.z + dz, W.side, 2.2);
      addPad(p.x, W.z + dz, 2.6, -0.7, 2.6);
    }
    for (let d = 0; d <= 42; d += 3) {
      const p = bank(W.z, W.side, d);
      block(p.x, W.z, 7);
    }
  }

  // island: the shrine before the sacred tree
  SITES.hokora = { x: ISLAND.x - 2, z: ISLAND.z + 16, y: 1.6 };
  block(ISLAND.x, ISLAND.z, ISLAND.r + 2);
})();

export function blocked(x, z, margin = 0) {
  for (let i = 0; i < BLOCK.length; i++) {
    const b = BLOCK[i];
    const dx = x - b.x, dz = z - b.z, r = b.r + margin;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

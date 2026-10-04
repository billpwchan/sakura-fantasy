// Procedural trees: sakura, momiji, broadleaf, black pine, sugi cedar, bamboo, plus cheap far-hill forms.
// Each species: a few variants built once, instanced per 240 m chunk so frustum culling stays coarse but cheap.
import * as THREE from 'three';
import { patch, WIND_GLSL, NOISE, U } from '../core/shared.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Builder } from './geo.js';
import { rng, clamp, smoothstep } from '../lib/math.js';
import { LAYER_NOREFL } from '../core/pipeline.js';
import { waterSd } from './layout.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

function randUnit(R) {
  const u = R.range(-1, 1), a = R.next() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return V(Math.cos(a) * s, u, Math.sin(a) * s);
}

// a branch that wanders from p0 along dir, bending by 'pull' each step
function limb(R, p0, dir, len, steps, pull, wander) {
  const pts = [p0.clone()];
  const d = dir.clone();
  const p = p0.clone();
  for (let i = 0; i < steps; i++) {
    d.add(pull.clone().multiplyScalar(1 / steps)).add(randUnit(R).multiplyScalar(wander)).normalize();
    p.addScaledVector(d, len / steps);
    pts.push(p.clone());
  }
  return { pts, dir: d };
}

function emitCards(leaf, R, cards, centre, radius) {
  const T = V(), B = V();
  for (const c of cards) {
    const out = c.p.clone().sub(centre);
    const dist = out.length();
    out.normalize();
    // card plane faces roughly outward, randomly twisted
    const nrm = out.clone().multiplyScalar(0.6).add(randUnit(R).multiplyScalar(0.8)).normalize();
    T.crossVectors(nrm, Math.abs(nrm.y) > 0.9 ? V(1, 0, 0) : UP).normalize();
    B.crossVectors(nrm, T).normalize();
    const shade = out.clone().multiplyScalar(0.8).add(UP.clone().multiplyScalar(0.45)).normalize();
    const shell = clamp(dist / radius, 0, 1);
    leaf.card(c.p, T, B, c.h, shade, [shell, R.next()]);
  }
}

// tsutsuji: a clipped mound of two or three overlapping domes over a few stems, its face packed with photographed
// trusses (the mound cells) and sprays breaking the clipped line. Variant 63 is a pale Hirado; the others Oomurasaki.
const AZ_SPRAY = [0.0714, 0.3214];
function azalea(seed) {
  const R = rng(seed);
  const pale = seed === 63;
  const wood = new Builder(), leaf = new Builder(2);
  for (let i = 0; i < 5; i++) {
    const d = V(R.range(-0.7, 0.7), 1, R.range(-0.7, 0.7)).normalize();
    const b = limb(R, V(), d, R.range(0.35, 0.6), 3, V(), 0.15);
    wood.tube(b.pts, b.pts.map((_, k) => 0.028 * (1 - k * 0.22)), 4, 1);
  }
  const cards = [];
  const nL = R.int(2, 3);
  for (let l = 0; l < nL; l++) {
    const r = R.range(0.45, 0.7), a = R.next() * 6.283, off = l ? R.range(0.35, 0.55) : 0;
    const c = V(Math.cos(a) * off, 0, Math.sin(a) * off);
    const surf = (k) => {
      const d = randUnit(R);
      d.y = Math.abs(d.y) * 0.95 + 0.05;
      d.normalize();
      return { p: V(c.x + d.x * r * k, d.y * r * 0.9 * k + 0.04, c.z + d.z * r * k), d };
    };
    // the clipped face: two layers of trusses with leafy patches between
    for (let i = 0; i < 44; i++) {
      const { p, d } = surf(i < 22 ? R.range(0.72, 0.85) : R.range(0.88, 1.0));
      const m = massCard(R, p, R.range(0.2, 0.26), d, l);
      m.cell = R.next() < 0.28 ? (R.next() < 0.5 ? 3 : 7) : pale ? 6 : 2;
      cards.push(m);
    }
    // shoots that have outgrown the last clipping: they rise from inside the mound and run along its face, so their
    // trusses break the outline without standing off it
    for (let i = 0; i < 16; i++) {
      const { p, d } = surf(R.range(0.6, 0.72));
      const t = V().crossVectors(d, randUnit(R)).normalize();
      const dir = t.multiplyScalar(0.85).addScaledVector(d, 0.45).addScaledVector(UP, 0.15).normalize();
      cards.push(sprayCard(R, p, dir, R.range(0.22, 0.27), d, l, [[pale ? 1 : R.next() < 0.88 ? 0 : 1, ...AZ_SPRAY]]));
    }
  }
  emitBlossom(leaf, R, cards, 8);
  return { wood: wood.build(), leaf: leaf.build() };
}

function crownOf(cards) {
  const c = V();
  for (const k of cards) c.add(k.p);
  c.multiplyScalar(1 / Math.max(1, cards.length));
  let r = 0;
  for (const k of cards) r = Math.max(r, k.p.distanceTo(c));
  return { c, r };
}

// a bough whose heading turns smoothly (the drift is low-passed, so it meanders instead of zig-zagging) while its own
// weight bends it down harder toward the tip
function bough(R, p0, dir, len, steps, sag, wander) {
  const pts = [p0.clone()];
  const d = dir.clone().normalize();
  const p = p0.clone();
  const turn = V();
  for (let i = 0; i < steps; i++) {
    turn.multiplyScalar(0.55).addScaledVector(randUnit(R), wander);
    d.add(turn).addScaledVector(UP, (-sag * 2 * (i + 1)) / (steps * steps)).normalize();
    p.addScaledVector(d, len / steps);
    pts.push(p.clone());
  }
  return { pts, dir: d };
}

// the blossom atlas, rendered from a photoscanned Somei Yoshino cluster: three sprays whose twig enters the card at a
// known point on its left edge ([cell, u, v]), and one dense mass for the inside of a lobe. The cell rides in the
// quarter of aAux.y, so the per-card hash the shader takes from it stays random.
const SPRAYS = [[0, 0.0656, 0.4547], [1, 0.0847, 0.3456], [3, 0.0431, 0.2629]];
const MASS = 2;

// a spray whose painted twig carries on from the real one at p along d; it faces out of the crown as far as the twig's
// line allows, twisted at random, and mirrored half the time
function sprayCard(R, p, d, h, out, lobe, sprays = SPRAYS) {
  const [cell, ub, vb] = R.pick(sprays);
  const T = d.clone().normalize();
  const N = out.clone().addScaledVector(randUnit(R), 0.9);
  N.addScaledVector(T, -N.dot(T));
  if (N.lengthSq() < 1e-4) N.copy(randUnit(R)).addScaledVector(T, -T.dot(N));
  N.normalize();
  const B = V().crossVectors(N, T);
  if (R.next() < 0.5) B.negate();
  const c = p.clone().addScaledVector(T, -(2 * ub - 1) * h).addScaledVector(B, -(2 * vb - 1) * h);
  return { c, T, B, h, cell, lobe };
}

function massCard(R, p, h, out, lobe) {
  const N = out.clone().addScaledVector(randUnit(R), 0.6).normalize();
  const T = V().crossVectors(N, randUnit(R)).normalize();
  const B = V().crossVectors(N, T);
  return { c: p.clone(), T, B, h, cell: MASS, lobe };
}

// conifer atlas (2 x 2 cells of 2:1): kuromatsu branchlets in 0, 1, sugi fronds in 2, 3; [u, v] of the twig's base
const PINE_BASE = [0.0429, 0.2], SUGI_BASE = [0.0429, 0.7143];
// a conifer card: its painted twig carries on from p along T, the foliage kept upright (needles and fronds have an up),
// rolled about T by `roll` from vertical
function conCard(p, T, roll, h, cell, [ub, vb], lobe) {
  T = T.clone().normalize();
  const perp = V().crossVectors(T, UP);
  if (perp.lengthSq() < 1e-4) perp.set(1, 0, 0);
  perp.normalize();
  const N = perp.multiplyScalar(Math.cos(roll)).addScaledVector(UP, Math.sin(roll)).normalize();
  const B = V().crossVectors(N, T).normalize();
  if (B.y < 0) B.negate();
  B.multiplyScalar(0.5);
  const c = p.clone().addScaledVector(T, -(2 * ub - 1) * h).addScaledVector(B, -(2 * vb - 1) * h);
  return { c, T, B, h, cell, lobe };
}

// shading for blossom cards: each lobe of the crown is lit as its own cumulus, set into the crown's overall dome;
// aux.x is how far out a card sits (inner cards fall into shade), aux.y the cell plus a random hash
function emitBlossom(leaf, R, cards, cells = 4) {
  const C = V();
  for (const k of cards) C.add(k.c);
  C.multiplyScalar(1 / cards.length);
  let rxz = 0, ry = 0;
  for (const k of cards) { rxz = Math.max(rxz, Math.hypot(k.c.x - C.x, k.c.z - C.z)); ry = Math.max(ry, Math.abs(k.c.y - C.y)); }
  const lobes = new Map();
  for (const k of cards) {
    if (!lobes.has(k.lobe)) lobes.set(k.lobe, { c: V(), n: 0, r: 0 });
    const l = lobes.get(k.lobe);
    l.c.add(k.c); l.n++;
  }
  for (const l of lobes.values()) l.c.multiplyScalar(1 / l.n);
  for (const k of cards) { const l = lobes.get(k.lobe); l.r = Math.max(l.r, k.c.distanceTo(l.c)); }
  const e = V(), lo = V();
  for (const k of cards) {
    const l = lobes.get(k.lobe);
    e.set((k.c.x - C.x) / rxz, (k.c.y - C.y) / Math.max(ry, 0.5), (k.c.z - C.z) / rxz);
    const crownShell = clamp(e.length(), 0, 1);
    lo.subVectors(k.c, l.c);
    const lobeShell = clamp(lo.length() / Math.max(l.r, 0.3), 0, 1);
    const shade = e.normalize().multiplyScalar(0.6).addScaledVector(lo.normalize(), 0.5).addScaledVector(UP, 0.45).normalize();
    const shell = clamp(0.1 + 0.55 * crownShell + 0.45 * lobeShell, 0, 1);
    leaf.card(k.c, k.T, k.B, k.h, shade, [shell, (k.cell + R.next() * 0.999) / cells]);
  }
}

// sakura: an old Somei Yoshino. A short trunk flaring into its roots parts low into a few scaffold limbs that climb,
// spread and sag under their own weight; their twigs carry the blossom, so the crown is lobes of cumulus with sky
// between them, and in winter a fine net of twigs
function sakura(seed, lod = false) {
  const R = rng(seed);
  const wood = new Builder(), leaf = new Builder(2);
  leaf.withCtr = true;
  if (lod) { wood.minR = lod === 2 ? 0.07 : 0.03; wood.lodSides = true; }
  const lean = V(R.range(-0.15, 0.15), 1, R.range(-0.15, 0.15)).normalize();
  const r0 = R.range(0.2, 0.25);
  const tr = bough(R, V(0, -0.25, 0), lean, R.range(1.5, 2.0), 6, 0, 0.035);
  wood.tube(tr.pts, tr.pts.map((_, i) => r0 * (i === 0 ? 1.5 : i === 1 ? 1.12 : 1 - i * 0.035)), 12, 1.4, null, true);
  // buttress roots run out from the foot and dive into the ground
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + R.range(-0.3, 0.3);
    const b = bough(R, V(0, 0.3, 0), V(Math.cos(a), -0.6, Math.sin(a)), R.range(0.75, 1.05), 3, 0.25, 0.04);
    wood.tube(b.pts, b.pts.map((_, i) => r0 * 0.55 * (1 - i * 0.24)), 6, 1.2);
  }
  const cards = [];
  let lobeId = 0;
  const STEPS = [9, 6, 4, 2], SIDES = [8, 6, 4, 3], SAG = [0.55, 0.5, 0.3, 0.05], WANDER = [0.05, 0.07, 0.09, 0.12];
  const grow = (p, dir, len, r, depth, lobe) => {
    const b = bough(R, p, dir, len, STEPS[depth], SAG[depth], WANDER[depth]);
    const n = b.pts.length - 1;
    const rad = b.pts.map((_, i) => r * (1 - (i / n) * (depth === 3 ? 0.4 : 0.55)));
    wood.tube(b.pts, rad, SIDES[depth], 1.4, null, true);
    if (depth === 1) lobe = lobeId++;
    if (depth < 3) {
      const nc = depth === 0 ? R.int(4, 5) : R.int(3, 5);
      for (let k = 0; k < nc; k++) {
        // the first shoot carries the limb on from its end, as thick as the end, so no limb stops in a cut stub
        const cont = k === 0;
        const t = depth === 0 ? R.range(0.3, 1) : R.range(0.25, 1);
        const i = cont ? n : Math.min(n, Math.max(1, Math.round(t * n)));
        const pd = b.pts[Math.min(n, i + 1)].clone().sub(b.pts[i - 1]).normalize();
        const side = randUnit(R);
        side.addScaledVector(pd, -side.dot(pd)).normalize();
        // side shoots leave at 35-60 degrees and turn up toward the light
        const nd = pd.clone().addScaledVector(side, cont ? R.range(0.2, 0.4) : R.range(0.7, 1.4)).add(V(0, depth === 0 ? 0.15 : 0.35, 0)).normalize();
        const cl = depth === 2 ? R.range(0.32, 0.55) : len * (depth === 0 ? R.range(0.48, 0.62) : R.range(0.42, 0.58));
        grow(b.pts[i], nd, cl, cont ? rad[n] * 0.95 : Math.max(0.006, rad[i] * 0.62), depth + 1, lobe);
      }
    }
    if (depth >= 2) {
      const out = V(b.pts[n].x, 0, b.pts[n].z).normalize().add(V(0, 0.35, 0)).normalize();
      // sprays along the twig, each leaving on its own spur, and one carrying on from the tip
      const ns = depth === 3 ? 3 : 2;
      for (let k = 0; k < ns; k++) {
        const t = depth === 3 ? (k + R.range(0.1, 0.9)) / ns : R.range(0.45, 1);
        const i = Math.min(n - 1, Math.floor(t * n));
        const p = b.pts[i].clone().lerp(b.pts[i + 1], t * n - i);
        const td = b.pts[i + 1].clone().sub(b.pts[i]).normalize();
        const sd = td.clone().addScaledVector(randUnit(R), 0.75).normalize();
        cards.push(sprayCard(R, p, sd, R.range(0.27, 0.34), out, lobe));
      }
      if (depth === 3) cards.push(sprayCard(R, b.pts[n], b.dir.clone().addScaledVector(randUnit(R), 0.3), R.range(0.28, 0.34), out, lobe));
      else {
        // the dense middle of a lobe, so it reads as a mass and not a lace
        for (let k = 0; k < 4; k++) {
          const p = b.pts[R.int(1, n)].clone().addScaledVector(out, R.range(0.05, 0.3)).addScaledVector(randUnit(R), 0.18);
          cards.push(massCard(R, p, R.range(0.26, 0.32), out, lobe));
        }
      }
    }
  };
  const nS = R.int(4, 5);
  const top = tr.pts.length - 1;
  for (let k = 0; k < nS; k++) {
    const a = (k / nS) * Math.PI * 2 + R.range(-0.35, 0.35);
    const elev = R.range(0.6, 0.95);
    const at = tr.pts[top - (k % 2)];
    grow(at, V(Math.cos(a) * Math.cos(elev), Math.sin(elev), Math.sin(a) * Math.cos(elev)), R.range(3.3, 4.0), r0 * 0.66, 0, -1);
  }
  emitBlossom(leaf, R, cards);
  return { wood: wood.build(), leaf: leaf.build() };
}

// the sacred tree on the island: an ancient shidarezakura. A gnarled trunk on buttress roots, limbs that climb and
// arch over, and from every outer limb curtains of blossom falling nearly to the ground (drawn 2.4x, so its sprays
// are made at a third of the avenue's size)
function sacred(seed) {
  const R = rng(seed);
  const wood = new Builder(), leaf = new Builder(2);
  const tr = bough(R, V(0, -0.3, 0), V(0.08, 1, -0.05), 3.5, 8, 0, 0.04);
  const r0 = 0.62;
  wood.tube(tr.pts, tr.pts.map((_, i) => r0 * (i === 0 ? 1.6 : i === 1 ? 1.2 : 1 - i * 0.035)), 12, 1.4, null, true);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + R.range(-0.3, 0.3);
    const b = bough(R, V(0, 0.75, 0), V(Math.cos(a), -0.4, Math.sin(a)), R.range(1.6, 2.4), 4, 0.5, 0.05);
    wood.tube(b.pts, b.pts.map((_, i) => 0.34 * (1 - i * 0.2)), 6, 1.2);
  }
  const cards = [];
  let lobeId = 0;
  const DOWN = V(0, -1, 0);
  const strand = (q0, out, face, lobe) => {
    const q = q0.clone();
    const d = DOWN.clone().addScaledVector(out, R.range(0.08, 0.3)).addScaledVector(randUnit(R), 0.1).normalize();
    const hang = Math.max(0.5, (q.y - R.range(0.45, 1.3)) * R.range(0.5, 1.0));
    for (let y = 0; y < hang;) {
      const h = R.range(0.11, 0.14);
      cards.push(sprayCard(R, q, d.clone().addScaledVector(randUnit(R), 0.15), h, face, lobe));
      const step = 2 * h * R.range(0.5, 0.68);
      q.addScaledVector(d, step);
      y += step;
      d.addScaledVector(DOWN, 0.1).addScaledVector(randUnit(R), 0.05).normalize();
    }
  };
  const grow = (p, dir, len, r, depth, lobe) => {
    const b = bough(R, p, dir, len, [8, 6, 4][depth], [1.0, 1.2, 0.9][depth], [0.05, 0.07, 0.09][depth]);
    const n = b.pts.length - 1;
    const rad = b.pts.map((_, i) => r * (1 - (i / n) * 0.65));
    wood.tube(b.pts, rad, [9, 6, 4][depth], 1.4, null, true);
    if (depth === 1) lobe = lobeId++;
    if (depth < 2) {
      for (let k = 0; k < 3; k++) {
        const i = Math.min(n, Math.max(1, Math.round(R.range(0.35, 1) * n)));
        const pd = b.pts[Math.min(n, i + 1)].clone().sub(b.pts[i - 1]).normalize();
        const side = randUnit(R);
        side.addScaledVector(pd, -side.dot(pd)).normalize();
        const nd = pd.clone().addScaledVector(side, R.range(0.6, 1.1)).add(V(0, depth === 0 ? 0.25 : 0.1, 0)).normalize();
        grow(b.pts[i], nd, len * R.range(0.5, 0.65), Math.max(0.02, rad[i] * 0.6), depth + 1, lobe);
      }
    }
    // curtains from the outer part of every limb, and sprays crowding the limb itself so the dome is blossom, not wood
    for (let i = Math.ceil(n * (depth === 0 ? 0.5 : 0.25)); i <= n; i++) {
      const out = V(b.pts[i].x, 0, b.pts[i].z).normalize();
      const face = out.clone().add(V(0, 0.35, 0)).normalize();
      for (let k = 0; k < Math.max(1, depth); k++) strand(b.pts[i].clone().addScaledVector(randUnit(R), 0.15), out, face, depth === 0 ? -1 - lobeId : lobe);
      const td = b.pts[i].clone().sub(b.pts[i - 1]).normalize();
      for (let k = 0; k < 4; k++) cards.push(sprayCard(R, b.pts[i].clone().addScaledVector(randUnit(R), 0.18), td.clone().addScaledVector(randUnit(R), 0.9), R.range(0.12, 0.15), face, lobe));
    }
  };
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + R.range(-0.25, 0.25);
    const elev = R.range(0.45, 0.8);
    const at = tr.pts[R.int(5, tr.pts.length - 1)];
    grow(at, V(Math.cos(a) * Math.cos(elev), Math.sin(elev), Math.sin(a) * Math.cos(elev)), R.range(4.4, 5.6), r0 * 0.42, 0, -1);
  }
  emitBlossom(leaf, R, cards);
  console.log('[sf] sacred cards', cards.length);
  return { wood: wood.build(), leaf: leaf.build() };
}

// momiji: slender trunk, layered near-horizontal limbs, fine leaf clouds
// iromomiji: a short trunk parting into limbs that arch out and level off; the twigs carry their leaves in flat tiers,
// so the crown is a layered dome with light between the layers. Sprays from the momiji atlas, twig entering at
// MAPLE_SPRAY's base; cells 0, 1 green, turned to 2, 3 (red, orange) through autumn by the shader.
const MAPLE_SPRAY = [[0, 0.05, 0.5], [1, 0.05, 0.5]];
function maple(seed, lod = false) {
  const R = rng(seed);
  const wood = new Builder(), leaf = new Builder(2);
  leaf.withCtr = true;
  if (lod) { wood.minR = lod === 2 ? 0.07 : 0.03; wood.lodSides = true; }
  const lean = V(R.range(-0.25, 0.25), 1, R.range(-0.25, 0.25)).normalize();
  const r0 = R.range(0.13, 0.18);
  const tr = bough(R, V(0, -0.2, 0), lean, R.range(1.9, 2.6), 4, 0, 0.05);
  wood.tube(tr.pts, tr.pts.map((_, i) => r0 * (i === 0 ? 1.35 : 1 - i * 0.07)), 9, 1.2, null, true);
  const cards = [];
  let lobe = 0;
  const STEPS = [5, 4, 3], SAG = [0.3, 0.28, 0.12], WANDER = [0.06, 0.08, 0.1], SIDES = [7, 5, 3];
  const grow = (p, dir, len, r, depth, lb) => {
    const b = bough(R, p, dir, len, STEPS[depth], SAG[depth], WANDER[depth]);
    const m = b.pts.length - 1;
    const rAt = (i) => r * (1 - (i / m) * 0.7);
    wood.tube(b.pts, b.pts.map((_, i) => rAt(i)), SIDES[depth], 1.2, null, true);
    if (depth < 2) {
      const n = R.int(3, 4);
      for (let k = 0; k < n; k++) {
        // the first child carries the branch on from its end; the rest leave from its side
        const i = k === 0 ? m : R.int(1, m - 1);
        const nd = b.dir.clone().addScaledVector(randUnit(R), k === 0 ? 0.4 : 0.75);
        nd.y = k === 0 ? Math.min(nd.y, 0.2) : R.range(-0.05, 0.28);
        grow(b.pts[i], nd.normalize(), len * R.range(0.5, 0.66), k === 0 ? rAt(m) : rAt(i) * 0.72, depth + 1, depth === 0 ? lobe++ : lb);
      }
    }
    if (depth >= 1) {
      // tiers of sprays held level along the outer part of each branch, faced out and up: seen from the water a
      // card faced straight up is edge-on, and fades
      for (let i = 1; i < b.pts.length; i++) {
        for (let k = 0; k < (depth === 2 ? 3 : 2); k++) {
          const sd = b.dir.clone().addScaledVector(randUnit(R), 0.9);
          sd.y = R.range(-0.15, 0.08);
          sd.normalize();
          const out = V(sd.x * 0.8, 0.5, sd.z * 0.8).normalize();
          cards.push(sprayCard(R, b.pts[i], sd, R.range(0.45, 0.58), out, lb, MAPLE_SPRAY));
        }
      }
    }
  };
  const nS = R.int(4, 6);
  for (let k = 0; k < nS; k++) {
    const a = (k / nS) * Math.PI * 2 + R.range(-0.35, 0.35);
    const elev = R.range(0.5, 0.95);
    grow(tr.pts[R.int(2, tr.pts.length - 1)], V(Math.cos(a) * Math.cos(elev), Math.sin(elev), Math.sin(a) * Math.cos(elev)), R.range(2.2, 3.0), r0 * 0.62, 0, lobe++);
  }
  emitBlossom(leaf, R, cards);
  return { wood: wood.build(), leaf: leaf.build() };
}

// konara-like broadleaf: a tall vase of upright limbs and a rounded crown, its twigs in leafy sprays from the konara
// atlas (cells 0, 1 green, turned to 2, 3, tan and rust, through autumn by the shader); the twig enters at BROAD_SPRAY
const BROAD_SPRAY = [[0, 0.05, 0.5], [1, 0.05, 0.5]];
function broad(seed, lod = false) {
  const R = rng(seed);
  const wood = new Builder(), leaf = new Builder(2);
  leaf.withCtr = true;
  if (lod) { wood.minR = lod === 2 ? 0.07 : 0.03; wood.lodSides = true; }
  const tr = limb(R, V(), V(R.range(-0.1, 0.1), 1, R.range(-0.1, 0.1)).normalize(), R.range(3.0, 4.2), 5, V(), 0.05);
  const r0 = R.range(0.22, 0.3);
  wood.tube(tr.pts, tr.pts.map((_, i) => r0 * (i === 0 ? 1.3 : 1 - i * 0.05)), 10, 1.4, null, true);
  // the limbs leave from just under the trunk's capped top, so the fork closes over it
  const top = tr.pts[tr.pts.length - 2].clone().lerp(tr.pts[tr.pts.length - 1], 0.55);
  const tips = [];
  let lobe = 0;
  const grow = (p, dir, len, r, depth, lb) => {
    const b = limb(R, p, dir, len, 4, V(dir.x, 0, dir.z).normalize().multiplyScalar(0.25), 0.12);
    const n = b.pts.length - 1;
    const rAt = (i) => r * (1 - (i / n) * 0.7);
    wood.tube(b.pts, b.pts.map((_, i) => rAt(i)), [7, 7, 4, 3][depth], 1.4, null, true);
    if (depth < 3) {
      // the first child carries the branch on from its end, as thick as the end, so no limb stops in a cut stub;
      // the others leave from its side
      for (let k = 0; k < 3; k++) {
        const i = k === 0 ? n : R.int(2, n - 1);
        const nd = b.dir.clone().add(randUnit(R).multiplyScalar(k === 0 ? 0.35 : 0.7)).normalize();
        grow(b.pts[i], nd, len * (k === 0 ? 0.7 : 0.6), k === 0 ? rAt(n) : rAt(i) * 0.72, depth + 1, depth === 0 ? lobe++ : lb);
      }
    }
    if (depth >= 2) for (let i = 2; i < b.pts.length; i++) tips.push({ p: b.pts[i], d: b.pts[i].clone().sub(b.pts[i - 1]).normalize(), lobe: lb, depth });
  };
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + R.range(-0.3, 0.3);
    const elev = R.range(0.9, 1.25);
    grow(top, V(Math.cos(a) * Math.cos(elev), Math.sin(elev), Math.sin(a) * Math.cos(elev)), R.range(3.4, 4.6), r0 * 0.62, 0, lobe++);
  }
  const cr = crownOf(tips.map((t) => ({ p: t.p })));
  const cards = [];
  for (const t of tips) {
    // sprays leave the twig outward and a little down, faced to the sky and away from the crown's heart
    const out = t.p.clone().sub(cr.c).normalize().add(V(0, 0.4, 0)).normalize();
    for (let k = 0; k < 2; k++) {
      const d = t.d.clone().addScaledVector(randUnit(R), 0.8);
      d.y = Math.min(d.y, 0.25) - 0.1;
      cards.push(sprayCard(R, t.p, d.normalize(), R.range(0.6, 0.78), out, t.lobe, BROAD_SPRAY));
    }
  }
  emitBlossom(leaf, R, cards);
  return { wood: wood.build(), leaf: leaf.build() };
}

// kuromatsu: a leaning, twisting trunk with flat cloud pads of needles (the clipped garden pine)
function pine(seed, lod = false) {
  const R = rng(seed);
  const wood = new Builder(), leaf = new Builder(2);
  leaf.withCtr = true;
  if (lod) { wood.minR = lod === 2 ? 0.07 : 0.03; wood.lodSides = true; }
  const lean = V(R.range(-0.6, 0.6), 1, R.range(-0.6, 0.6)).normalize();
  const tr = limb(R, V(), lean, R.range(5, 7), 8, V(-lean.x * 0.6, 0.3, -lean.z * 0.6), 0.16);
  const r0 = R.range(0.2, 0.28);
  wood.tube(tr.pts, tr.pts.map((_, i) => r0 * (i === 0 ? 1.4 : 1 - i * 0.07)), 7, 1.0);
  const pads = [];
  for (let i = 3; i < tr.pts.length; i++) {
    const p = tr.pts[i];
    const a = R.next() * Math.PI * 2;
    const d = V(Math.cos(a), R.range(-0.05, 0.2), Math.sin(a)).normalize();
    const b = limb(R, p, d, R.range(1.4, 2.6) * (1 - i / 14), 3, V(0, 0.15, 0), 0.1);
    wood.tube(b.pts, b.pts.map((_, j) => r0 * 0.4 * (1 - j * 0.2)), 4, 1.0);
    pads.push({ c: b.pts[b.pts.length - 1], rad: R.range(0.9, 1.5) });
  }
  pads.push({ c: tr.pts[tr.pts.length - 1].clone().add(V(0, 0.3, 0)), rad: R.range(0.8, 1.1) });
  // a pad: branchlets fanning out level from the bough's end, needle tufts turned up along them, a second layer
  // lifted over the middle so the pad domes; each branchlet shows as a pair of cards crossed along its axis
  const cards = [];
  pads.forEach((pd, lobe) => {
    const n = Math.round(7 + pd.rad * 5);
    for (let k = 0; k < n; k++) {
      const top = k >= n * 0.65;
      const a = (k / n) * Math.PI * 2 * 1.618 + R.range(-0.4, 0.4);
      const T = V(Math.cos(a), top ? R.range(0.15, 0.4) : R.range(-0.08, 0.12), Math.sin(a)).normalize();
      const p = pd.c.clone().add(V(R.range(-0.12, 0.12), top ? R.range(0.1, 0.22) : R.range(-0.05, 0.05), R.range(-0.12, 0.12)));
      const h = pd.rad * R.range(0.42, 0.55) * (top ? 0.75 : 1);
      const cell = R.next() < 0.5 ? 0 : 1;
      cards.push(conCard(p, T, R.range(-0.15, 0.15), h, cell, PINE_BASE, lobe));
      cards.push(conCard(p, T, R.range(0.7, 1.0) * (R.next() < 0.5 ? 1 : -1), h * 0.9, 1 - cell, PINE_BASE, lobe));
    }
  });
  emitBlossom(leaf, R, cards);
  return { wood: wood.build(), leaf: leaf.build() };
}

// sugi: a straight trunk, boughs in a close spiral reaching out level and drooping, shortening to a narrow spire;
// the fronds that clothe them fan out along each bough and crowd its end (built 18 m tall)
function cedar(seed, lod = false) {
  const R = rng(seed);
  const wood = new Builder(), leaf = new Builder(2);
  leaf.withCtr = true;
  if (lod) { wood.minR = lod === 2 ? 0.07 : 0.03; wood.lodSides = true; }
  const H = 18;
  const tr = limb(R, V(), V(R.range(-0.03, 0.03), 1, R.range(-0.03, 0.03)).normalize(), H, 8, V(), 0.02);
  // the leader thins to a whip inside the spire, so no bare pole stands above the foliage
  wood.tube(tr.pts, tr.pts.map((_, i) => 0.37 * Math.pow(1 - i / 8.6, 1.2) + 0.012), 7, 2.0);
  const at = (y) => {
    const f = clamp(y / H, 0, 1) * 8, i = Math.min(7, Math.floor(f));
    return tr.pts[i].clone().lerp(tr.pts[i + 1], f - i);
  };
  const cards = [];
  const crownBase = R.range(3.5, 5.5);
  let a = R.next() * Math.PI * 2, lobe = 0;
  for (let y = crownBase; y < H - 0.4; y += R.range(0.2, 0.28)) {
    const t = (y - crownBase) / (H - crownBase);
    const reach = Math.pow(1 - t, 0.9) * R.range(2.0, 2.6) + 0.45;
    a += 2.39996 + R.range(-0.25, 0.25);
    const d = V(Math.cos(a), R.range(-0.2, 0.05) + t * 0.35, Math.sin(a)).normalize();
    const b = bough(R, at(y), d, reach, 3, 0.2 + 0.25 * (1 - t), 0.06);
    if (reach > 0.8) wood.tube(b.pts, b.pts.map((_, i) => (0.055 * (1 - t) + 0.015) * (1 - i * 0.25)), 3, 1);
    // fronds crowd the bough in layers: one level, one rolled up, one rolled down at every station, so from any side
    // the bough reads as a dense, feathery mass
    const n = Math.max(1, Math.round(reach / 0.32));
    for (let k = 0; k < n; k++) {
      const f = ((k + R.range(0.2, 0.9)) / n) * 3;
      const i = Math.min(2, Math.floor(f));
      const q = b.pts[i].clone().lerp(b.pts[i + 1], f - i);
      const seg = b.pts[i + 1].clone().sub(b.pts[i]).normalize();
      const h = R.range(0.6, 0.78) * (0.65 + 0.35 * (1 - t));
      for (const roll of [R.range(-0.25, 0.25), R.range(0.6, 0.95), -R.range(0.6, 0.95)]) {
        const sw = R.range(-0.75, 0.75);
        const T = V(seg.x * Math.cos(sw) - seg.z * Math.sin(sw), seg.y + R.range(-0.12, 0.05), seg.x * Math.sin(sw) + seg.z * Math.cos(sw)).normalize();
        cards.push(conCard(q, T, roll, h * R.range(0.85, 1.05), 2 + R.int(0, 1), SUGI_BASE, lobe));
      }
    }
    lobe++;
  }
  // the spire
  for (let k = 0; k < 8; k++) {
    const aa = (k / 8) * Math.PI * 2;
    const T = V(Math.cos(aa) * 0.45, 1, Math.sin(aa) * 0.45).normalize();
    cards.push(conCard(at(H - 0.95 - k * 0.14), T, R.range(-0.3, 0.3), 0.66, 2 + (k % 2), SUGI_BASE, lobe));
  }
  emitBlossom(leaf, R, cards);
  return { wood: wood.build(), leaf: leaf.build() };
}

// bamboo: a tall thin culm leaning slightly, its branches rising from the nodes of its upper half, each a spray of
// drooping leaf fans from the bamboo atlas (the twig enters at BAMBOO_SPRAY's base)
const BAMBOO_SPRAY = [[0, 0.0429, 0.5], [1, 0.0429, 0.5], [2, 0.0429, 0.5], [3, 0.0429, 0.5]];
// lod: the culm alone, three-sided and half as many rings, for the river's mirror
function bamboo(seed, lod = false) {
  const R = rng(seed);
  const wood = new Builder(1), leaf = new Builder(2);
  leaf.withCtr = true;
  const H = R.range(10, 14);
  const lean = V(R.range(-0.08, 0.08), 1, R.range(-0.08, 0.08)).normalize();
  const tr = limb(R, V(), lean, H, 10, V(lean.x * 0.4, 0, lean.z * 0.4), 0.01);
  if (lod) {
    const pts = tr.pts.filter((_, i) => i % 2 === 0);
    wood.tube(pts, pts.map((_, i) => 0.065 * (1 - (i * 2) / 14)), 3, 1.0, (i) => [(i * 2) / 10]);
    return { wood: wood.build() };
  }
  wood.tube(tr.pts, tr.pts.map((_, i) => 0.065 * (1 - i / 14)), 6, 1.0, (i) => [i / 10]);
  const cards = [];
  // where the leaves begin varies culm to culm, so a grove on a slope has no level hem of foliage
  for (let i = R.int(3, 5); i < tr.pts.length; i++) {
    const n = R.int(3, 4);
    const a0 = R.next() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2 + R.range(-0.5, 0.5);
      // branches leave the node rising, the spray's own droop bends them down
      const d = V(Math.cos(a), R.range(0.0, 0.3), Math.sin(a)).normalize();
      const out = V(-Math.sin(a), 0.25, Math.cos(a));
      // the top of the culm carries smaller sprays
      cards.push(sprayCard(R, tr.pts[i], d, R.range(0.6, 0.8) * (1 - 0.25 * Math.max(0, i - 8) / 2), out, i, BAMBOO_SPRAY));
    }
  }
  emitBlossom(leaf, R, cards);
  return { wood: wood.build(), leaf: leaf.build() };
}

// far forms (unit height). Sugi: a narrow spire of drooping, saw-edged skirts, light on the tips and dark
// underneath, so a hillside of them reads as thousands of separate points against the haze.
// lod: the stand-in drawn in the river's mirror, three tiers and one skirt instead of five and six
function farConifer(seed, lod = false) {
  const R = rng(seed);
  const b = new Builder();
  b.withColor = true;
  const T = lod ? 3 : 5, N = lod ? 6 : 10;
  const spire = (y0, h, r, droop, cTop, cRim, skirt = true) => {
    const top = b.count;
    b.vert(V(R.range(-0.004, 0.004), y0 + h, 0), V(0, 1, 0), 0.5, 1, null, [cTop, cTop, cTop]);
    const rim = b.count;
    const a0 = R.next() * Math.PI;
    for (let s = 0; s < N; s++) {
      const a = a0 + (s / N) * Math.PI * 2 + R.range(-0.12, 0.12);
      const long = s % 2 === 0;
      const rr = r * (long ? R.range(0.92, 1.12) : R.range(0.55, 0.7));
      const y = y0 - (long ? droop * R.range(0.7, 1.2) : 0);
      const c = cRim * (long ? R.range(0.95, 1.15) : 0.7);
      b.vert(V(Math.cos(a) * rr, y, Math.sin(a) * rr), V(Math.cos(a), 0.55, Math.sin(a)).normalize(), s / N, 0, null, [c, c, c]);
    }
    const under = b.count;
    b.vert(V(0, y0 + h * 0.28, 0), V(0, -1, 0), 0.5, 0, null, [cRim * 0.35, cRim * 0.35, cRim * 0.35]);
    for (let s = 0; s < N; s++) {
      const i0 = rim + s, i1 = rim + ((s + 1) % N);
      b.tri(top, i1, i0);
      if (skirt) b.tri(under, i0, i1);
    }
  };
  for (let t = 0; t < T; t++) {
    const k = t / (T - 1);
    const y0 = 0.14 + t * (lod ? 0.25 : 0.15), h = (lod ? 0.4 : 0.3) - k * (lod ? 0.1 : 0.06);
    spire(y0, h, 0.19 * (1 - k * 0.72) * R.range(0.9, 1.1), 0.05 * (1 - k * 0.5), 0.95 + k * 0.1, 0.5 + k * 0.15, !lod || t === 0);
  }
  spire(0.86, 0.15, 0.035, 0.0, 1.05, 0.8, !lod);
  if (lod) return b.build();
  // trunk stub
  const base = b.count;
  for (let s = 0; s <= 4; s++) {
    const a = (s / 4) * Math.PI * 2;
    const n = V(Math.cos(a), 0, Math.sin(a));
    b.vert(V(Math.cos(a) * 0.018, 0, Math.sin(a) * 0.018), n, 0, 0, null, [0.25, 0.2, 0.17]);
    b.vert(V(Math.cos(a) * 0.014, 0.2, Math.sin(a) * 0.014), n, 0, 1, null, [0.25, 0.2, 0.17]);
  }
  for (let s = 0; s < 4; s++) b.quad(base + s * 2, base + s * 2 + 2, base + s * 2 + 3, base + s * 2 + 1);
  return b.build();
}

// every step-th leaf card, each grown to cover what its dropped neighbours did: for the mirror, where the canopy is
// seen at half resolution through ripples, and for crowns set far back. Null if the geometry is not plain cards.
function thinCards(geo, step, grow) {
  const idx = geo.index.array, pos = geo.attributes.position;
  const cards = idx.length / 6;
  if (pos.count !== cards * 4) return null;
  for (let i = 0; i < cards; i++) if (idx[i * 6] !== i * 4 || idx[i * 6 + 5] !== i * 4 + 3) return null;
  const p = pos.array.slice();
  const keep = [];
  for (let i = 0; i < cards; i += step) {
    const o = i * 12;
    for (let a = 0; a < 3; a++) {
      const c = (p[o + a] + p[o + 3 + a] + p[o + 6 + a] + p[o + 9 + a]) / 4;
      for (let v = 0; v < 4; v++) p[o + v * 3 + a] = c + (p[o + v * 3 + a] - c) * grow;
    }
    for (let k = 0; k < 6; k++) keep.push(idx[i * 6 + k]);
  }
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, k === 'position' ? new THREE.BufferAttribute(p, 3) : a);
  g.setIndex(new THREE.BufferAttribute(idx.constructor.from(keep), 1));
  g.boundingSphere = geo.boundingSphere;
  return g;
}

// broadleaf: a cauliflower crown of small lumps, so the canopy edge is bumpy rather than a ball
// lod: the stand-in for the river's mirror and the farthest slopes, six lumps instead of fourteen
function farBroad(seed, lod = false) {
  const R = rng(seed);
  const b = new Builder();
  b.withColor = true;
  // a cauliflower of small leaf masses, each knobbly (its twelve corners pushed in and out), so the outline breaks up
  // the way a real crown's does at a distance; the clump shading carries the finer texture
  const ico = mergeVertices((() => { const g = new THREE.IcosahedronGeometry(1, 0); g.deleteAttribute('normal'); g.deleteAttribute('uv'); return g; })());
  // a low, spreading dome, wider than tall, lopsided, so neighbours knit into a canopy
  const lumps = [[R.range(-0.05, 0.05), 0.68, R.range(-0.05, 0.05), lod ? 0.26 : 0.2]];
  const sx = R.range(0.85, 1.2), sz = R.range(0.85, 1.2);
  const NL = lod ? 5 : 13, NR = lod ? 5 : 9;
  for (let i = 0; i < NL; i++) {
    const a = (i / Math.min(NL, 8)) * Math.PI * 2 + R.range(-0.35, 0.35);
    const ring = i < NR ? 0 : 1;
    const rr = ring ? R.range(0.1, 0.2) : R.range(0.24, 0.36);
    lumps.push([Math.cos(a) * rr * sx, ring ? R.range(0.64, 0.78) : R.range(0.42, 0.58) - rr * 0.25, Math.sin(a) * rr * sz, R.range(0.11, 0.17) * (lod ? 1.45 : 1.1)]);
  }
  for (const [lx, ly, lz, lr] of lumps) {
    const p = ico.attributes.position;
    const base = b.count;
    for (let i = 0; i < p.count; i++) {
      const v = V(p.getX(i), p.getY(i), p.getZ(i)).multiplyScalar(lr * R.range(0.8, 1.2));
      v.y *= 0.85;
      const n = V(p.getX(i), p.getY(i) + 0.3, p.getZ(i)).normalize();
      const y = v.y + ly;
      const inner = 1 - clamp(Math.hypot(v.x + lx, v.z + lz) / 0.42, 0, 1);
      const c = (0.4 + 0.6 * smoothstep(0.35, 0.95, y)) * (1 - 0.25 * inner * (1 - Math.max(0, p.getY(i)))) * R.range(0.85, 1.1);
      b.vert(V(v.x + lx, y, v.z + lz), n, 0, 0, null, [c, c, c]);
    }
    for (let i = 0; i < ico.index.count; i++) b.idx.push(base + ico.index.getX(i));
  }
  return b.build();
}

// ---------------------------------------------------------------- materials

export const LEAF_VERT = /* glsl */ `
  {
    #ifdef USE_INSTANCING
      vec3 root = instanceMatrix[3].xyz;
      mat3 im = mat3(instanceMatrix);
      float s2 = dot(im[0], im[0]);
    #else
      vec3 root = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      mat3 im = mat3(1.0); float s2 = 1.0;
    #endif
    #ifdef SF_SWELL
      // far off, the cards grow about their centres: what thins to sparse fronds in the mip chain stays a full crown
      float sfCamD = distance((modelMatrix * vec4(root, 1.0)).xyz, uViewPos);
      transformed = aCtr + (transformed - aCtr) * (1.0 + SF_SWELL * smoothstep(22.0, 90.0, sfCamD));
    #endif
    float hW = position.y * sqrt(s2);
    vec3 off = sfWindOffset(root, hW, SF_STIFF);
    #ifdef SF_LEAF
      float ph = aAux.y * 6.2831;
      off += vec3(sin(uTime * 3.1 + ph), sin(uTime * 2.3 + ph * 1.7) * 0.6, cos(uTime * 2.7 + ph)) * 0.035 * (0.4 + uWind.z) * aAux.x;
      vLeaf = aAux;
      vSeed = fract(sin(dot(root.xz, vec2(12.9898, 78.233))) * 43758.5453);
    #endif
    transformed += (transpose(im) * off) / s2;
  }
`;

const leafHead = /* glsl */ `
  attribute vec2 aAux; varying vec2 vLeaf; varying float vSeed;
  #ifdef SF_SWELL
    attribute vec3 aCtr;
  #endif
  ${WIND_GLSL}
`;

// the atlas cell (2 x 2, row 0 at the top of the image) a blossom card samples, from the quarter its aAux.y falls in
const ATLAS_GLSL = /* glsl */ `
  vec2 sfAtlasCell(float k) {
    float c = min(floor(k * 4.0), 3.0);
    return vec2(mod(c, 2.0), 1.0 - floor(c * 0.5));
  }
  #ifdef SF_BLOOMSWAP
    // 4 x 2 cells, the cell in the eighth of k: out of flower a card shows the same spray in leaf (0, 1 -> 4, 5) or
    // a leafy mound (2 -> 3, 6 -> 7); cards go over one by one, by their hash, as the season turns
    vec2 sfAtlasUv(float k, vec2 uv) {
      float c = min(floor(k * 8.0), 7.0);
      if (fract(k * 8.0) >= uSeason.x * 1.08 - 0.04) c = c < 2.0 ? c + 4.0 : c == 2.0 ? 3.0 : c == 6.0 ? 7.0 : c;
      return (vec2(mod(c, 4.0), 1.0 - floor(c / 4.0)) + uv) * vec2(0.25, 0.5);
    }
  #elif defined(SF_AUTUMNSWAP)
    // 2 x 2: green sprays in 0, 1 turn to their autumn colours in 2, 3, card by card as the season comes on
    vec2 sfAtlasUv(float k, vec2 uv) {
      float c = min(floor(k * 4.0), 1.0);
      if (fract(k * 4.0) < uSeason.z * 1.08 - 0.04) c += 2.0;
      return (vec2(mod(c, 2.0), 1.0 - floor(c * 0.5)) + uv) * 0.5;
    }
  #else
    vec2 sfAtlasUv(float k, vec2 uv) { return (sfAtlasCell(k) + uv) * 0.5; }
  #endif
`;

function leafMaterial(opts) {
  const m = new THREE.MeshLambertMaterial({ map: opts.map, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: true });
  const uniforms = {
    uLeafSp: { value: new THREE.Vector3(...opts.colors[0]) },
    uLeafSu: { value: new THREE.Vector3(...opts.colors[1]) },
    uLeafAu: { value: new THREE.Vector3(...opts.colors[2]) },
    uLeafAu2: { value: new THREE.Vector3(...(opts.colors[4] || opts.colors[2])) },
    uLeafWi: { value: new THREE.Vector3(...opts.colors[3]) },
    uPresence: { value: new THREE.Vector4(...opts.presence) },
    tBlossom: { value: opts.blossom || opts.map },
    tBlossomN: { value: opts.blossomN || null },
    tLeafA: { value: opts.leafAtlas || null },
    tLeafN: { value: opts.leafAtlasN || null },
    uTransl: { value: opts.transl ?? 0.6 },
  };
  const defs = `#define SF_LEAF\n#define SF_STIFF ${opts.stiff.toFixed(3)}\n${opts.blossom ? '#define SF_BLOSSOM\n' : ''}${opts.atlas || opts.photo ? '#define SF_ATLAS\n' : ''}${opts.photo ? '#define SF_PHOTO\n' : ''}${opts.swap ? '#define SF_BLOOMSWAP\n' : ''}${opts.autumnSwap ? '#define SF_AUTUMNSWAP\n' : ''}${opts.leafAtlas ? '#define SF_LEAFATLAS\n' : ''}${opts.swell ? `#define SF_SWELL ${opts.swell.toFixed(2)}\n` : ''}${opts.patchy ? '#define SF_PATCHY\n' : ''}${opts.eternal ? '#define SF_ETERNAL\n' : ''}#define SF_BLOOMW ${opts.eternal || opts.photo ? '1.0' : 'uSeason.x'}\n`;
  patch(m, {
    key: 'leaf-' + opts.key,
    snow: opts.snow ?? 0.7,
    wet: 0.25,
    wrap: 0.6,
    uniforms,
    vertexHead: defs + leafHead,
    fragHead: /* glsl */ `${defs}
      varying vec2 vLeaf; varying float vSeed;
      uniform vec3 uLeafSp, uLeafSu, uLeafAu, uLeafAu2, uLeafWi;
      uniform vec4 uPresence; uniform sampler2D tBlossom; uniform float uTransl;
      #ifdef SF_ATLAS
        uniform sampler2D tBlossomN;
      #endif
      #ifdef SF_LEAFATLAS
        uniform sampler2D tLeafA, tLeafN;
      #endif
      ${ATLAS_GLSL}
    `,
    hooks: {
      vertex: LEAF_VERT,
      map: /* glsl */ `
        {
          float lum = diffuseColor.r;
          float var = fract(vLeaf.y * 13.7 + vSeed * 7.1);
          vec3 au = mix(uLeafAu, uLeafAu2, smoothstep(0.2, 0.8, fract(vSeed * 3.7 + vLeaf.y * 0.6)));
          vec3 lc = uLeafSp * uSeason.x + uLeafSu * uSeason.y + au * uSeason.z + uLeafWi * uSeason.w;
          lc *= 0.82 + 0.36 * var;
          vec3 col = lum * lum * lc * 3.2;
          // footprint of one pixel in texels: far cards read their outline from a softer mip so they resolve as
          // clumps instead of single-pixel specks
          vec2 sz = vec2(512.0);
          vec2 du = dFdx(vMapUv * sz), dv = dFdy(vMapUv * sz);
          float lod = 0.5 * log2(max(dot(du, du), dot(dv, dv)));
          #ifdef SF_ATLAS
            float soft = clamp(lod * 0.35 - 0.3, 0.0, 0.9);
          #else
            float soft = clamp(lod * 0.7 - 0.2, 0.0, 1.6);
          #endif
          float a = texture2D(map, vMapUv, soft).a;
          #ifdef SF_LEAFATLAS
          {
            // out of bloom the card shows the same spray in leaf. The atlas holds the leaves as photographed in
            // autumn; through spring and summer their light and shade carry a fresh, then a deep green, and in autumn
            // each spray turns to its own colours in its own time (the grey twig keeps its colour throughout)
            vec2 lUv = sfAtlasUv(vLeaf.y, vMapUv);
            vec3 lf = texture2D(tLeafA, lUv).rgb;
            float ll = dot(lf, vec3(0.3, 0.59, 0.11));
            float lsat = (max(lf.r, max(lf.g, lf.b)) - min(lf.r, min(lf.g, lf.b))) / max(max(lf.r, max(lf.g, lf.b)), 1e-3);
            vec3 green = ll * mix(vec3(0.74, 1.2, 0.36), vec3(0.44, 0.9, 0.36), clamp(uSeason.y + uSeason.z, 0.0, 1.0));
            green = mix(lf, green, smoothstep(0.25, 0.45, lsat));
            float turn = step(fract(vSeed * 3.1 + vLeaf.y * 7.7), uSeason.z * 1.1 - 0.05);
            vec3 lcol = mix(green, lf * vec3(1.05, 0.95, 0.9), max(turn, uSeason.w));
            col = lcol * (0.9 + 0.16 * var);
            a = texture2D(tLeafA, lUv, soft).a;
          }
          #endif
          #ifdef SF_BLOSSOM
            vec2 bUv = vMapUv;
            #ifdef SF_ATLAS
              bUv = sfAtlasUv(vLeaf.y, vMapUv);
            #endif
            vec4 b = texture2D(tBlossom, bUv);
            b.a = texture2D(tBlossom, bUv, soft).a;
            float bw = SF_BLOOMW;
            // whole sprays vary between near-white and a deeper pink, the way a real crown does
            float pk = smoothstep(0.35, 0.95, fract(vSeed * 5.3 + vLeaf.y * 2.9));
            #if defined(SF_PHOTO)
              // photographed throughout: the season colours are tints over the photograph (the two autumn ones split
              // card by card)
              vec3 lt = mix(uLeafAu, uLeafAu2, step(0.55, fract(vSeed * 2.3 + vLeaf.y * 5.1)));
              vec3 tint = uSeason.x * uLeafSp + uSeason.y * uLeafSu + uSeason.z * lt + uSeason.w * uLeafWi;
              col = b.rgb * tint * (0.9 + 0.16 * var);
            #elif defined(SF_ATLAS)
              // photographed albedo: only a breath of extra pink, more in some sprays than others
              col = mix(col, b.rgb * mix(vec3(1.0, 0.9, 0.93), vec3(1.0, 0.78, 0.86), pk) * (0.9 + 0.16 * var), bw);
            #else
              col = mix(col, b.rgb * mix(vec3(1.0, 0.9, 0.94), vec3(1.0, 0.76, 0.86), pk) * (0.82 + 0.22 * var), bw);
            #endif
            a = mix(a, b.a, bw);
          #endif
          // inner leaves sit in the crown's own shade
          #if defined(SF_PHOTO)
            col *= mix(vec3(0.55), vec3(1.0), smoothstep(0.1, 0.9, vLeaf.x));
          #elif defined(SF_ATLAS)
            // the atlas carries its own occlusion; the crown adds the depth of the lobes, shading to rose
            #ifdef SF_LEAFATLAS
              col *= mix(mix(vec3(0.55), vec3(0.6, 0.47, 0.5), uSeason.x), vec3(1.0), smoothstep(0.1, 0.9, vLeaf.x));
            #else
              col *= mix(mix(vec3(0.38), vec3(0.6, 0.47, 0.5), uSeason.x), vec3(1.0), smoothstep(0.1, 0.9, vLeaf.x));
            #endif
          #elif defined(SF_BLOSSOM)
            // in blossom the crown's shade is a deep rose, not the sky's violet
            col *= mix(mix(vec3(0.38), vec3(0.5, 0.36, 0.38), uSeason.x), vec3(1.0), smoothstep(0.15, 0.95, vLeaf.x));
          #else
            col *= mix(0.38, 1.0, smoothstep(0.1, 0.95, vLeaf.x));
          #endif
          #ifdef SF_PATCHY
            // a grove stands in patches of older and younger culms, lighter and yellower or darker and bluer, and
            // culm by culm a little lighter or darker, so a hillside of it is not one even pile of leaves
            float sfP = sfNoise(vSfWP.xz * 0.045 + 1.7) * 0.7 + sfNoise(vSfWP.xz * 0.13) * 0.3;
            col *= mix(vec3(0.74, 0.82, 0.92), vec3(1.14, 1.1, 0.84), smoothstep(0.2, 0.8, sfP)) * (0.86 + 0.28 * vSeed);
          #endif
          diffuseColor.rgb = col;
          // fewer leaves out of season: whole cards drop out by their seed
          float pres = dot(uSeason, uPresence);
          #ifdef SF_ETERNAL
            pres = 1.0;
          #endif
          if (fract(vLeaf.y * 7.31 + 0.13) > pres + 0.001) discard;
          // keep thin cards from dissolving in the mip chain
          a *= 1.0 + max(lod, 0.0) * 0.28;
          // a card seen edge-on is a hairline streak: let it go before it gets there
          // (the shading normals are bent toward the crown, so take the card's own plane from the derivatives)
          vec3 gN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
          float facing = abs(dot(gN, normalize(vViewPosition)));
          a *= smoothstep(0.12, 0.42, facing);
          diffuseColor.a = a;
        }`,
      normal: /* glsl */ `
        normal = normalize(vNormal);
        #ifdef SF_ATLAS
        {
          // each flower turns its own way: the atlas' normals, carried into the card's frame (taken from the screen
          // derivatives, since cards are twisted and mirrored at random), bend the crown's normal by their tilt
          #ifdef SF_LEAFATLAS
            vec2 nUv = sfAtlasUv(vLeaf.y, vMapUv);
            vec3 tn = mix(texture2D(tLeafN, nUv).xyz, texture2D(tBlossomN, nUv).xyz, uSeason.x) * 2.0 - 1.0;
            float nw = 1.0;
          #else
            vec3 tn = texture2D(tBlossomN, sfAtlasUv(vLeaf.y, vMapUv)).xyz * 2.0 - 1.0;
            float nw = SF_BLOOMW;
          #endif
          vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
          vec2 st0 = dFdx(vMapUv), st1 = dFdy(vMapUv);
          vec3 cn = normalize(cross(q0, q1));
          cn *= sign(dot(cn, vViewPosition));
          vec3 q1p = cross(q1, cn), q0p = cross(cn, q0);
          vec3 T = q1p * st0.x + q0p * st1.x;
          vec3 B = q1p * st0.y + q0p * st1.y;
          float det = max(dot(T, T), dot(B, B));
          float sc = det == 0.0 ? 0.0 : inversesqrt(det);
          vec3 fn = normalize(T * (tn.x * sc) + B * (tn.y * sc) + cn * tn.z);
          normal = normalize(normal + (fn - cn) * 0.9 * nw);
        }
        #endif`,
      light: /* glsl */ `
        {
          // sun through the leaves when they are backlit
          vec3 Vv = normalize(cameraPosition - vSfWP);
          float back = pow(max(dot(-Vv, uSunDir), 0.0), 2.5);
          float tr = uTransl * (0.25 + 0.75 * vLeaf.x) * (0.25 + 0.75 * sfShadow);
          reflectedLight.directDiffuse += diffuseColor.rgb * uSunCol * back * tr * 0.45;
          reflectedLight.directDiffuse += diffuseColor.rgb * uSunCol * 0.08 * tr * max(uSunDir.y, 0.0);
          #ifdef SF_PHOTO
            // light passed through the sunlit leaves and petals warms the shade inside the mound
            reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(1.0, 0.84, 0.78) * uSunCol * 0.06 * (0.4 + 0.6 * vLeaf.x);
          #endif
          #if defined(SF_ATLAS) && !defined(SF_PHOTO)
            // petals are thin: light that came through the sunlit ones fills the crown's shade with rose, not violet
            float bloomW = SF_BLOOMW;
            reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(1.0, 0.7, 0.76) * uSunCol * 0.07 * bloomW * (0.4 + 0.6 * vLeaf.x);
          #endif
          #ifdef SF_ETERNAL
            // the tree's own light after dark: a slow breath running up through the blossoms
            float breath = 0.65 + 0.35 * sin(uTime * 0.7 - vSfWP.y * 0.25 + vLeaf.y * 2.0);
            reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(1.0, 0.62, 0.78) * uSpirit * breath * (0.6 + 0.8 * vLeaf.x) * 1.4;
          #endif
        }`,
    },
  });
  // shadows sway and thin with the leaves
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: opts.map, alphaTest: 0.5, side: THREE.DoubleSide });
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, { uTime: U.uTime, uWind: U.uWind, uSeason: U.uSeason, uViewPos: U.uViewPos });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${defs}\nuniform float uTime; uniform vec4 uWind; uniform vec3 uViewPos;\n${NOISE}\n${leafHead}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${LEAF_VERT}`);
    // in bloom the shadow takes the blossom's outline, not the leaf card's
    const leafAlpha = opts.leafAtlas ? `diffuseColor.a = texture2D(tLeafA, sfAtlasUv(vLeaf.y, vMapUv)).a;\n` : '';
    const bloomAlpha = opts.blossom ? `diffuseColor.a = mix(diffuseColor.a, texture2D(tBlossom, ${opts.atlas || opts.photo ? 'sfAtlasUv(vLeaf.y, vMapUv)' : 'vMapUv'}).a, SF_BLOOMW);\n` : '';
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${defs}\nvarying vec2 vLeaf; uniform vec4 uSeason; uniform vec4 uPresence; uniform sampler2D tBlossom;${opts.leafAtlas ? ' uniform sampler2D tLeafA;' : ''}\n${ATLAS_GLSL}`)
      .replace('#include <alphatest_fragment>', `${leafAlpha}${bloomAlpha}if (fract(vLeaf.y * 7.31 + 0.13) > dot(uSeason, uPresence) + 0.001) discard;\n#include <alphatest_fragment>`);
  };
  depth.customProgramCacheKey = () => 'leafdepth-' + opts.key;
  return { material: m, depth, uniforms };
}

// vRep: repeats of the bark along a tube per its v unit, to keep the scan's own proportions (tubes wrap u once per
// 0.6 m of girth)
// contrast: the scans are shot flat and lose their fissures to the mip chain at a few metres; the colour is pushed
// away from the texture's own mean (its last mip) to bring them back
function woodMaterial(tex, id, tint, stiff, key, vRep = 1, contrast = 1) {
  const along = (t) => {
    if (vRep === 1) return t;
    const c = t.clone();
    c.repeat.set(1, vRep);
    c.needsUpdate = true;
    return c;
  };
  const m = new THREE.MeshStandardMaterial({ map: along(tex[id + '_c']), normalMap: along(tex[id + '_n']), roughness: 0.93, color: new THREE.Color(...tint) });
  if (contrast > 1) m.normalScale.set(1 + (contrast - 1) * 0.6, 1 + (contrast - 1) * 0.6);
  const defs = `#define SF_STIFF ${stiff.toFixed(3)}\n`;
  patch(m, {
    key: 'wood-' + key, snow: 0.9, wet: 0.8, vertexHead: defs + WIND_GLSL,
    hooks: {
      vertex: LEAF_VERT,
      map: contrast > 1 ? `
        {
          vec3 sfMean = textureLod(map, vMapUv, 12.0).rgb * diffuse;
          diffuseColor.rgb = max(sfMean + (diffuseColor.rgb - sfMean) * ${contrast.toFixed(2)}, sfMean * 0.25);
        }` : '',
    },
  });
  return m;
}

function bambooWoodMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const defs = `#define SF_STIFF 0.9\n`;
  patch(m, {
    key: 'bamboo-culm', snow: 0.5, wet: 0.5,
    vertexHead: defs + WIND_GLSL + 'attribute float aAux; varying float vCulm;',
    fragHead: 'varying float vCulm;',
    hooks: {
      vertex: LEAF_VERT + 'vCulm = position.y;',
      map: /* glsl */ `
        {
          // nodes every ~35 cm, culms yellowing with age
          float node = smoothstep(0.92, 1.0, fract(vCulm / 0.38)) ;
          vec3 c = mix(vec3(0.16, 0.24, 0.06), vec3(0.3, 0.28, 0.1), sfNoise(vSfWP.xz * 3.0));
          c *= 1.0 - node * 0.45;
          c = mix(c, vec3(0.22, 0.2, 0.1), uSeason.w * 0.4);
          diffuseColor.rgb = c;
        }`,
    },
  });
  return m;
}

function farMaterial(key, colors, presenceWinter, nearFade = false, clumps = false) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  const uniforms = {
    uFarSp: { value: new THREE.Vector3(...colors[0]) },
    uFarSu: { value: new THREE.Vector3(...colors[1]) },
    uFarAu: { value: new THREE.Vector3(...colors[2]) },
    uFarAu2: { value: new THREE.Vector3(...(colors[4] || colors[2])) },
    uFarWi: { value: new THREE.Vector3(...colors[3]) },
  };
  const defs = `#define SF_STIFF 0.08\n`;
  patch(m, {
    key: 'far-' + key, snow: 0.95, wet: 0.2, wrap: 0.4, uniforms,
    vertexHead: defs + WIND_GLSL + 'varying float vSeedF;',
    fragHead: 'uniform vec3 uFarSp, uFarSu, uFarAu, uFarAu2, uFarWi; varying float vSeedF;',
    hooks: {
      vertex: (nearFade ? `
        // a solid core only reads as mass from afar; up close it shrinks into the trunk and the needle cards
        // carry the tree on their own
        #ifdef USE_INSTANCING
          transformed *= smoothstep(40.0, 90.0, distance((modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz, uViewPos));
        #endif` : '') + LEAF_VERT + `
        #ifdef USE_INSTANCING
          vSeedF = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        #endif`,
      map: /* glsl */ `
        {
          vec3 au = mix(uFarAu, uFarAu2, smoothstep(0.3, 0.7, vSeedF));
          vec3 c = uFarSp * uSeason.x + uFarSu * uSeason.y + au * uSeason.z + uFarWi * uSeason.w;
          diffuseColor.rgb *= c * (0.8 + 0.4 * vSeedF);
          ${clumps ? `
          // leaf clumps in light and shade over the masses, and a ragged rim where the masses turn away
          float cl = sfNoise(vSfWP.xz * 0.85 + vSfWP.y * 0.7) * 0.6 + sfNoise(vSfWP.xz * 2.3 - vSfWP.y * 1.9 + 3.1) * 0.4;
          float fine = sfNoise(vSfWP.xz * 6.0 + vSfWP.y * 5.3);
          diffuseColor.rgb *= (0.62 + 0.66 * cl) * (0.86 + 0.28 * fine);
          ${clumps === 'mixed' ? `
          // a mixed wood: pale konara and keyaki among dark evergreen shii and kashi, crown by crown, while in leaf
          float hv = fract(vSeedF * 7.31);
          vec3 tint = hv < 0.35 ? vec3(0.78, 0.88, 1.0) : hv > 0.72 ? vec3(1.16, 1.12, 0.76) : vec3(1.0);
          diffuseColor.rgb *= mix(vec3(1.0), tint, clamp(uSeason.x + uSeason.y, 0.0, 1.0));` : ''}
          float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));
          if (cl < rim * 1.25 - 0.55) discard;` : ''}
        }`,
    },
  });
  return m;
}

// ---------------------------------------------------------------- placement & instancing

export function createSacredTree(tex, ftex, x, y, z) {
  const g = sacred(4242);
  const wood = woodMaterial(tex, 'sakura_bark', [0.5, 0.44, 0.42], 0.6, 'sacred', 2.33, 1.9);
  const leaf = leafMaterial({ key: 'sacred', map: ftex.leaves, blossom: ftex.blossomAtlas, blossomN: ftex.blossomAtlasN, atlas: true, eternal: true, stiff: 0.5, colors: [[0.12, 0.22, 0.05], [0.07, 0.16, 0.035], [0.42, 0.12, 0.035], [0.1, 0.08, 0.06]], presence: [1, 1, 1, 1], transl: 0.6 });
  const group = new THREE.Group();
  group.name = 'sacred-tree';
  const S = 2.4;
  for (const [geo, mat] of [[g.wood, wood], [g.leaf, leaf.material]]) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y - 0.4, z);
    m.scale.setScalar(S);
    m.castShadow = true;
    m.receiveShadow = true;
    if (mat === leaf.material) m.customDepthMaterial = leaf.depth;
    group.add(m);
  }
  group.userData.trunkR = 0.62 * S;
  return group;
}

const CHUNK = 240;
const chunkOf = (z) => Math.floor((760 - z) / CHUNK);

export function createTrees(tex, ftex, placed) {
  const group = new THREE.Group();
  group.name = 'trees';
  const L = (o) => leafMaterial(o);

  const species = {
    sakura: {
      variants: [101, 202, 303].map((sd) => sakura(sd)),
      lods: [101, 202, 303].map((sd) => sakura(sd, true).wood),
      lods2: [101, 202, 303].map((sd) => sakura(sd, 2).wood),
      wood: woodMaterial(tex, 'sakura_bark', [0.5, 0.45, 0.45], 0.22, 'sakura', 2.33, 2.0),
      leaf: L({ key: 'sakura', swell: 0.3, map: ftex.leaves, blossom: ftex.blossomAtlas, blossomN: ftex.blossomAtlasN, leafAtlas: ftex.sakuraLeaf, leafAtlasN: ftex.sakuraLeafN, atlas: true, stiff: 0.32, colors: [[0.12, 0.22, 0.05], [0.07, 0.16, 0.035], [0.42, 0.12, 0.035], [0.1, 0.08, 0.06], [0.5, 0.25, 0.05]], presence: [1, 1, 0.85, 0], transl: 0.45 }),
      shadow: true,
    },
    maple: {
      variants: [11, 22, 33].map((sd) => maple(sd)),
      lods: [11, 22, 33].map((sd) => maple(sd, true).wood),
      lods2: [11, 22, 33].map((sd) => maple(sd, 2).wood),
      // trident maple's scan, cooled toward irohamomiji's grey bark; 1.8 m square scan, drawn 0.6 m a tile
      wood: woodMaterial(tex, 'trident_maple_bark', [0.78, 0.8, 0.86], 0.25, 'maple', 2.0, 1.5),
      leaf: L({ key: 'maple', swell: 0.3, map: ftex.maple, blossom: ftex.mapleAtlas, blossomN: ftex.mapleAtlasN, photo: true, autumnSwap: true, stiff: 0.4, colors: [[1.08, 1.12, 0.8], [0.88, 0.96, 0.86], [1.0, 1.0, 1.0], [0.6, 0.5, 0.42], [1.05, 1.15, 1.0]], presence: [0.9, 1, 0.95, 0], transl: 0.9 }),
      shadow: true,
    },
    broad: {
      variants: [5, 6].map((sd) => broad(sd)),
      lods: [5, 6].map((sd) => broad(sd, true).wood),
      lods2: [5, 6].map((sd) => broad(sd, 2).wood),
      // jolcham (konara, Quercus serrata) bark, scanned 1 x 2 m, drawn 0.6 x 1.2 m a tile
      wood: woodMaterial(tex, 'jolcham_oak_bark_01', [0.92, 0.92, 0.9], 0.18, 'broad', 1.17, 1.3),
      leaf: L({ key: 'broad', swell: 0.35, map: ftex.leaves, blossom: ftex.broadAtlas, blossomN: ftex.broadAtlasN, photo: true, autumnSwap: true, stiff: 0.3, colors: [[1.08, 1.14, 0.78], [0.86, 0.95, 0.86], [1.0, 1.0, 1.0], [0.6, 0.52, 0.45], [1.04, 0.94, 0.9]], presence: [0.85, 1, 0.8, 0], transl: 0.6 }),
      shadow: true,
    },
    pine: {
      variants: [7, 8].map((sd) => pine(sd)),
      wood: woodMaterial(tex, 'pine_bark', [0.6, 0.52, 0.46], 0.14, 'pine', 1.67, 1.3),
      leaf: L({ key: 'pine', swell: 0.35, map: ftex.pine, blossom: ftex.coniferAtlas, blossomN: ftex.coniferAtlasN, photo: true, stiff: 0.2, colors: [[1.0, 1.0, 0.95], [0.86, 0.94, 0.86], [0.9, 0.92, 0.82], [0.8, 0.84, 0.76]], presence: [1, 1, 1, 1], transl: 0.35, snow: 1 }),
      shadow: true,
    },
    cedar: {
      variants: [9, 10].map((sd) => cedar(sd)),
      lods: [9, 10].map((sd) => cedar(sd, true).wood),
      lods2: [9, 10].map((sd) => cedar(sd, 2).wood),
      wood: woodMaterial(tex, 'japanese_cedar_bark', [0.6, 0.5, 0.45], 0.06, 'cedar', 1.67, 1.3),
      leaf: L({ key: 'cedar', swell: 0.6, map: ftex.needles, blossom: ftex.coniferAtlas, blossomN: ftex.coniferAtlasN, photo: true, stiff: 0.07, colors: [[0.95, 1.0, 0.95], [0.85, 0.95, 0.88], [0.92, 0.9, 0.78], [1.05, 0.78, 0.58], [0.88, 0.92, 0.8]], presence: [1, 1, 1, 1], transl: 0.3, snow: 1 }),
      shadow: true,
    },
    bamboo: {
      variants: [12, 13].map((sd) => bamboo(sd)),
      lods2: [12, 13].map((sd) => bamboo(sd, true).wood),
      wood: bambooWoodMaterial(),
      leaf: L({ key: 'bamboo', swell: 0.2, patchy: true, map: ftex.bamboo, blossom: ftex.bambooAtlas, blossomN: ftex.bambooAtlasN, photo: true, snow: 0.3, stiff: 0.9, colors: [[0.96, 1.02, 0.82], [0.84, 0.92, 0.84], [0.92, 0.92, 0.8], [0.86, 0.87, 0.76], [0.94, 0.93, 0.8]], presence: [1, 1, 1, 1], transl: 0.85 }),
      shadow: true,
    },
  };

  species.azalea = {
    variants: [61, 62, 63].map((sd) => azalea(sd)),
    wood: woodMaterial(tex, 'pine_bark', [0.35, 0.3, 0.27], 0.3, 'azalea', 1.67),
    leaf: L({ key: 'azalea', map: ftex.azaleaLeaves, blossom: ftex.azaleaAtlas, blossomN: ftex.azaleaAtlasN, photo: true, swap: true, stiff: 0.25, colors: [[1, 1, 1], [0.86, 0.96, 0.82], [0.95, 0.88, 0.72], [0.76, 0.78, 0.66], [1.25, 0.66, 0.46]], presence: [1, 1, 1, 0.9], transl: 0.45 }),
    shadow: true,
  };

  const farConSet = { geos: [farConifer(1), farConifer(2), farConifer(3)], lods: [1, 2, 3].map((sd) => farConifer(sd, true)), mat: farMaterial('con', [[0.05, 0.095, 0.04], [0.04, 0.085, 0.035], [0.05, 0.08, 0.035], [0.04, 0.07, 0.045]], undefined, false, true) };
  const farBroadSet = { geos: [farBroad(3), farBroad(4)], lods: [farBroad(3, true), farBroad(4, true)], mat: farMaterial('broad', [[0.1, 0.18, 0.05], [0.05, 0.12, 0.03], [0.4, 0.12, 0.03], [0.08, 0.07, 0.06], [0.42, 0.26, 0.04]], undefined, false, 'mixed') };

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qt = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  const stats = { meshes: 0, instances: 0 };
  const reflLod = [];
  const thinned = new Map();
  const thin = (g, step) => {
    const k = g.uuid + step;
    if (!thinned.has(k)) thinned.set(k, thinCards(g, step, step === 2 ? 1.4 : 1.85) || g);
    return thinned.get(k);
  };
  const S = 8;
  const matrixOf = (a, o) => {
    q.setFromAxisAngle(UP, a[o + 3]);
    e.set(a[o + 6], 0, -a[o + 5]);
    qt.setFromEuler(e);
    q.premultiply(qt);
    sc.setScalar(a[o + 4]);
    ps.set(a[o], a[o + 1], a[o + 2]);
    return m4.compose(ps, q, sc);
  };

  const addInstanced = (geo, mat, arr, ids, opts) => {
    if (!ids.length) return;
    const im = new THREE.InstancedMesh(geo, mat, ids.length);
    im.name = opts.name;
    ids.forEach((o, i) => im.setMatrixAt(i, matrixOf(arr, o)));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = !!opts.shadow;
    im.receiveShadow = true;
    if (opts.depth) im.customDepthMaterial = opts.depth;
    if (opts.refl) reflLod.push([im, opts.refl]);
    im.matrixAutoUpdate = false;
    group.add(im);
    stats.meshes++;
    stats.instances += ids.length;
    return im;
  };

  // group record offsets by chunk and variant
  const byChunk = (arr) => {
    const m = new Map();
    for (let o = 0; o < arr.length; o += S) {
      const key = chunkOf(arr[o + 2]) * 8 + arr[o + 7];
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(o);
    }
    return m;
  };

  // a slim solid spire well inside the fronds darkens the crown's heart, so the trunk does not show through it; kept
  // narrow enough that its facets never reach the silhouette
  const coreMat = farMaterial('con-core', [[0.028, 0.052, 0.024], [0.024, 0.048, 0.022], [0.028, 0.045, 0.022], [0.024, 0.04, 0.026]], undefined, true);
  const cedarCore = [41, 42].map((sd) => farConifer(sd).applyMatrix4(new THREE.Matrix4().makeScale(8.5, 17.2, 8.5)));
  // the boat keeps to the river, so a tree's distance from the water is about how close it is seen: trees set back
  // from the banks are drawn without their twigs and with half as many (larger) leaf cards. A camera taken onto the
  // bank (zoomed out, the bank shot) gets the whole tree back for any group it comes within 30 m of
  const farGroups = [];
  const split = (arr, ids, d) => {
    const near = [], far = [];
    for (const o of ids) (waterSd(arr[o], arr[o + 2]) > d ? far : near).push(o);
    return [near, far];
  };
  for (const [name, sp] of Object.entries(species)) {
    const arr = placed[name];
    for (const [key, ids] of byChunk(arr)) {
      const vi = (((key % 8) + 8) % 8) % sp.variants.length;
      const v = sp.variants[vi];
      const [near, back] = sp.lods ? split(arr, ids, 36) : [ids, []];
      // past 80 m (the first rank of broadleaf above the banks, most sugi on the slopes) a quarter of the cards and
      // only the trunk and main limbs carry the crown
      const [mid, far] = split(arr, back, 80);
      const hl = thin(v.leaf, 2);
      // the mirror is drawn at half resolution and broken up by the ripples: trees there take their lightest tier
      addInstanced(v.wood, sp.wood, arr, near, { name: name + '-wood', shadow: sp.shadow, refl: sp.lods2 && sp.lods2[vi] });
      addInstanced(v.leaf, sp.leaf.material, arr, near, { name: name + '-leaf', shadow: sp.shadow, depth: sp.leaf.depth, refl: thin(v.leaf, sp.lods ? 4 : 2) });
      for (const [tier, wood, leaf] of [[mid, sp.lods && sp.lods[vi], hl], [far, sp.lods2 && sp.lods2[vi], thin(v.leaf, 4)]]) {
        if (!tier.length) continue;
        const wf = addInstanced(wood, sp.wood, arr, tier, { name: name + '-wood-far', shadow: sp.shadow, refl: sp.lods2[vi] });
        const lf = addInstanced(leaf, sp.leaf.material, arr, tier, { name: name + '-leaf-far', shadow: sp.shadow, depth: sp.leaf.depth, refl: thin(v.leaf, 4) });
        const xz = new Float32Array(tier.length * 2);
        tier.forEach((o, i) => { xz[i * 2] = arr[o]; xz[i * 2 + 1] = arr[o + 2]; });
        farGroups.push({ xz, sphere: wf.boundingSphere, swap: [[wf, v.wood, wood], [lf, v.leaf, leaf]], whole: false });
      }
      if (name === 'cedar') addInstanced(cedarCore[vi % 2], coreMat, arr, ids, { name: 'cedar-core', shadow: true });
    }
  }
  for (const [far, arr, name] of [[farConSet, placed.farCon, 'farCon'], [farBroadSet, placed.farBroad, 'farBroad']]) {
    for (const [key, ids] of byChunk(arr)) {
      const vi = (((key % 8) + 8) % 8) % far.geos.length;
      // past ~180 m a far form is a few dozen pixels in the haze: its stand-in serves
      const [near, distant] = split(arr, ids, 180);
      addInstanced(far.geos[vi], far.mat, arr, near, { name, shadow: false, refl: far.lods[vi] });
      addInstanced(far.lods[vi], far.mat, arr, distant, { name: name + '-lod', shadow: false });
    }
  }
  const cam = new THREE.Vector3();
  group.userData.update = (camera) => {
    camera.getWorldPosition(cam);
    for (const g of farGroups) {
      // 30 m in, 34 m out, so a camera at the edge does not flicker between the two
      const r = g.whole ? 34 : 30;
      let near = cam.distanceTo(g.sphere.center) - g.sphere.radius < r;
      if (near) {
        near = false;
        const xz = g.xz;
        for (let i = 0; i < xz.length; i += 2) {
          const dx = xz[i] - cam.x, dz = xz[i + 1] - cam.z;
          if (dx * dx + dz * dz < r * r) { near = true; break; }
        }
      }
      if (near === g.whole) continue;
      g.whole = near;
      for (const [im, whole, lod] of g.swap) im.geometry = near ? whole : lod;
    }
  };
  group.userData.stats = stats;
  group.userData.reflLod = reflLod;
  group.userData.species = species;
  return group;
}

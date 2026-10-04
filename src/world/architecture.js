// Everything built by hand: the vermilion drum bridge, the temple on the right bank (pagoda, hall, belfry),
// the village and its stone embankment, the river gate tunnel, the great torii standing in the lake, shrines
// and stone lanterns. Each site is merged into one mesh per material; lit windows and lantern fireboxes glow
// through a per-vertex flag once the lamps come on.
import * as THREE from 'three';
import { patch } from '../core/shared.js';
import { Builder } from './geo.js';
import { rng } from '../lib/math.js';
import { riverAt, terrainHeight, ISLAND } from './layout.js';
import { SITES } from './sites.js';

export const C = {
  shu: [0.6, 0.075, 0.022], // vermilion lacquer
  shuDark: [0.32, 0.04, 0.015],
  black: [0.022, 0.02, 0.018],
  plaster: [0.86, 0.83, 0.76],
  plasterWarm: [0.8, 0.7, 0.56],
  wood: [0.62, 0.5, 0.4],
  woodDark: [0.3, 0.22, 0.17],
  woodGrey: [0.55, 0.52, 0.48],
  shoji: [0.9, 0.85, 0.72],
  bronze: [0.32, 0.25, 0.12],
  patina: [0.18, 0.3, 0.24],
  gold: [0.85, 0.6, 0.2],
  stone: [0.78, 0.76, 0.72],
  stoneDark: [0.5, 0.5, 0.48],
  tile: [0.6, 0.62, 0.66],
  thatch: [0.85, 0.78, 0.66],
  rope: [0.75, 0.66, 0.42],
  paper: [0.95, 0.94, 0.9],
};

// box-projected UV tile size per material, in metres
const TILE = { paint: 2.4, wood: 2.2, tile: 2.6, thatch: 3.0, stone: 2.6, metal: 1, cloth: 0.32, skin: 1, wagasa: 1 };

const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Kit {
  constructor() {
    this.b = {};
    this.m = new THREE.Matrix4();
  }
  at(x, y, z, rot = 0) {
    this.m.makeRotationY(rot).setPosition(x, y, z);
    return this;
  }
  builder(mat) {
    if (!this.b[mat]) {
      const b = new Builder(1);
      b.withColor = true;
      this.b[mat] = b;
    }
    return this.b[mat];
  }
  // local geometry -> world, box-projected UVs unless keepUv
  add(mat, g, col, glow = 0, keepUv = false, local = null) {
    if (local) g.applyMatrix4(local);
    g.applyMatrix4(this.m);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!keepUv || !g.attributes.uv) {
      const p = g.attributes.position, n = g.attributes.normal;
      const uv = new Float32Array(p.count * 2);
      const t = TILE[mat];
      for (let i = 0; i < p.count; i++) {
        const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
        let u, v;
        if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
        else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
        else { u = p.getX(i); v = p.getY(i); }
        uv[i * 2] = u / t; uv[i * 2 + 1] = v / t;
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    this.builder(mat).addGeometry(g, 1, [glow], col);
  }
  box(mat, cx, cy, cz, sx, sy, sz, col, o = {}) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
    _q.setFromEuler(_e);
    this.add(mat, g, col, o.glow || 0, false, _m.compose(_p.set(cx, cy, cz), _q, _s.set(1, 1, 1)));
  }
  cyl(mat, cx, cy, cz, rTop, rBot, h, col, o = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, o.sides || 12, 1, !!o.open);
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
    _q.setFromEuler(_e);
    this.add(mat, g, col, o.glow || 0, false, _m.compose(_p.set(cx, cy + h / 2, cz), _q, _s.set(1, 1, 1)));
  }
  lathe(mat, pts, cx, cy, cz, col, o = {}) {
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), o.sides || 16);
    this.add(mat, g, col, o.glow || 0, false, _m.makeTranslation(cx, cy, cz));
  }
  tube(mat, pts, r, col, sides = 8) {
    const b = new Builder();
    b.tube(pts, pts.map(() => r), sides, 1.5);
    this.add(mat, b.build(), col);
  }
  build(materials, name) {
    const group = new THREE.Group();
    group.name = name;
    for (const [k, b] of Object.entries(this.b)) {
      if (!b.count) continue;
      const mesh = new THREE.Mesh(b.build('aGlow'), materials[k]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    return group;
  }
}

// ------------------------------------------------------------------ roofs

// A Japanese roof sheet: concave from ridge to eave, corners curling up and out. Origin at the eave line centre.
// hip: four sheets meeting at hips (ridge rx x rz, 0 for a pyramid); gable: two sheets and vertical gable ends.
export function roof(kit, mat, cx, cy, cz, o) {
  const { ex, ez, rise } = o;
  const rx = o.rx ?? 0, rz = o.rz ?? 0, curl = o.curl ?? 0.8, thick = o.thick ?? 0.3, gable = !!o.gable;
  const col = o.col || (mat === 'thatch' ? C.thatch : C.tile);
  const SU = 10, SV = 7;
  const sides = gable
    ? [
        { e0: [-ex, ez], e1: [ex, ez], r0: [-ex, 0], r1: [ex, 0] },
        { e0: [ex, -ez], e1: [-ex, -ez], r0: [ex, 0], r1: [-ex, 0] },
      ]
    : [
        { e0: [-ex, ez], e1: [ex, ez], r0: [-rx, rz], r1: [rx, rz] },
        { e0: [ex, ez], e1: [ex, -ez], r0: [rx, rz], r1: [rx, -rz] },
        { e0: [ex, -ez], e1: [-ex, -ez], r0: [rx, -rz], r1: [-rx, -rz] },
        { e0: [-ex, -ez], e1: [-ex, ez], r0: [-rx, -rz], r1: [-rx, rz] },
      ];
  const P = (s, u, v, under) => {
    const tx = s.r0[0] + (s.r1[0] - s.r0[0]) * u, tz = s.r0[1] + (s.r1[1] - s.r0[1]) * u;
    const bx = s.e0[0] + (s.e1[0] - s.e0[0]) * u, bz = s.e0[1] + (s.e1[1] - s.e0[1]) * u;
    let x = tx + (bx - tx) * v, z = tz + (bz - tz) * v;
    let y = rise * Math.pow(1 - v, 1.55);
    const k = gable ? 0 : Math.pow(Math.abs(2 * u - 1), 3) * v * v;
    y += curl * k;
    const push = 1 + curl * 0.07 * k;
    x *= push; z *= push;
    if (under) y -= thick;
    return [x + cx, y + cy, z + cz];
  };
  for (const s of sides) {
    const len = Math.hypot(s.e1[0] - s.e0[0], s.e1[1] - s.e0[1]);
    const slope = Math.hypot(rise, Math.hypot((s.e0[0] + s.e1[0]) / 2 - (s.r0[0] + s.r1[0]) / 2, (s.e0[1] + s.e1[1]) / 2 - (s.r0[1] + s.r1[1]) / 2));
    for (const under of [false, true]) {
      const pos = [], uv = [], idx = [];
      for (let j = 0; j <= SV; j++) for (let i = 0; i <= SU; i++) {
        pos.push(...P(s, i / SU, j / SV, under));
        uv.push((i / SU) * len / TILE[mat], (j / SV) * slope / TILE[mat]);
      }
      for (let j = 0; j < SV; j++) for (let i = 0; i < SU; i++) {
        const a = j * (SU + 1) + i, b = a + 1, c = a + SU + 1, d = c + 1;
        if (under) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      kit.add(under ? 'wood' : mat, g, under ? C.woodDark : col, 0, true);
    }
    // fascia along the eave edge
    const pos = [];
    for (let i = 0; i <= SU; i++) pos.push(...P(s, i / SU, 1, false), ...P(s, i / SU, 1, true));
    const idx = [];
    for (let i = 0; i < SU; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    kit.add('wood', g, o.fascia || C.woodDark);
  }
  if (gable) {
    // gable ends and a ridge beam
    for (const sx of [-1, 1]) {
      const pts = [];
      for (let j = 0; j <= SV; j++) {
        const v = j / SV;
        pts.push([sx * ex * 0.97, rise * Math.pow(1 - v, 1.55), ez * v * 0.97]);
      }
      const pos = [], idx = [];
      for (let j = 0; j <= SV; j++) { const [x, y, z] = pts[j]; pos.push(x + cx, y + cy, z + cz, x + cx, y + cy, -z + cz); }
      for (let j = 0; j < SV; j++) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2, a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      kit.add('wood', g, C.woodDark);
    }
    kit.box(mat, cx, cy + rise + 0.12, cz, ex * 2 + 0.3, 0.32, 0.42, mat === 'thatch' ? [0.45, 0.4, 0.33] : [0.42, 0.44, 0.47]);
  } else if (rx > 0.01) {
    kit.box(mat, cx, cy + rise + 0.1, cz, rx * 2 + 0.4, 0.3, rz * 2 + 0.35, [0.42, 0.44, 0.47]);
    // decorated ridge ends
    for (const sx of [-1, 1]) kit.box(mat, cx + sx * (rx + 0.2), cy + rise + 0.45, cz, 0.35, 0.7, 0.42, [0.32, 0.33, 0.36]);
  }
}

// ------------------------------------------------------------------ pieces

function torii(kit, w, h, o = {}) {
  const r = o.r ?? Math.max(0.22, w * 0.03);
  const col = o.col || C.shu;
  const y0 = o.y0 ?? -1.2;
  for (const s of [-1, 1]) {
    kit.cyl('paint', s * w / 2, y0, 0, r * 0.9, r * 1.05, h - y0, col, { sides: 14 });
    kit.cyl('paint', s * w / 2, y0, 0, r * 1.18, r * 1.2, 0.9 - y0 + (o.ground ?? 0), C.black, { sides: 14 });
  }
  // nuki tie beam through the pillars
  kit.box('paint', 0, h * 0.78, 0, w + r * 5, r * 1.0, r * 0.8, col);
  // gakuzuka strut
  kit.box('paint', 0, h * 0.78 + (h * 0.22) * 0.5, 0, r * 1.1, h * 0.22, r * 0.7, col);
  // kasagi + shimaki: lintels sweeping up at the ends
  const L = w + r * 9, N = 12;
  const yAt = (x) => h + 0.04 * L * Math.pow(Math.abs(x) / (L / 2), 2.6);
  for (let i = 0; i < N; i++) {
    const x0 = -L / 2 + (i / N) * L, x1 = -L / 2 + ((i + 1) / N) * L;
    const xm = (x0 + x1) / 2, ang = Math.atan2(yAt(x1) - yAt(x0), x1 - x0);
    const seg = (x1 - x0) / Math.cos(ang) + 0.02;
    kit.box('paint', xm, yAt(xm), 0, seg, r * 0.85, r * 1.5, col, { rz: ang });
    kit.box('paint', xm, yAt(xm) + r * 0.75, 0, seg, r * 0.7, r * 1.75, C.black, { rz: ang });
  }
  if (o.plaque) kit.box('paint', 0, h * 0.89, r * 0.42, r * 1.8, r * 2.4, 0.08, C.black);
}

function lantern(kit, x, y, z, s = 1, o = {}) {
  // kasuga-style stone lantern; the firebox glows at night
  kit.at(x, y, z, o.rot || 0);
  const k = (v) => v * s;
  kit.cyl('stone', 0, -0.4, 0, k(0.42), k(0.5), k(0.62), C.stone, { sides: 6 });
  kit.cyl('stone', 0, k(0.22), 0, k(0.13), k(0.16), k(0.75), C.stone, { sides: 10 });
  kit.cyl('stone', 0, k(0.97), 0, k(0.36), k(0.24), k(0.2), C.stone, { sides: 6 });
  kit.cyl('stone', 0, k(1.17), 0, k(0.26), k(0.26), k(0.36), C.stone, { sides: 6 });
  kit.cyl('paint', 0, k(1.22), 0, k(0.2), k(0.2), k(0.26), C.paper, { sides: 6, glow: 1 });
  kit.cyl('stone', 0, k(1.53), 0, k(0.06), k(0.55), k(0.28), C.stone, { sides: 6 });
  kit.lathe('stone', [[0, 0], [k(0.1), k(0.02)], [k(0.12), k(0.12)], [k(0.05), k(0.24)], [0, k(0.3)]], 0, k(1.79), 0, C.stone, { sides: 8 });
  return { x, y: y + k(1.35), z };
}

function hokora(kit, x, y, z, rot, s = 1) {
  kit.at(x, y, z, rot);
  kit.box('stone', 0, -0.3, 0, 2.2 * s, 0.9, 1.9 * s, C.stone);
  kit.box('wood', 0, 0.15 + 0.55 * s, 0, 1.2 * s, 1.1 * s, 1.0 * s, C.wood);
  kit.box('paint', 0, 0.15 + 0.55 * s, 0.505 * s, 0.9 * s, 0.85 * s, 0.02, C.shoji, { glow: 0.6 });
  for (const sx of [-1, 1]) kit.box('wood', sx * 0.62 * s, 0.15 + 0.55 * s, 0.52 * s, 0.1 * s, 1.1 * s, 0.1 * s, C.woodDark);
  roof(kit, 'tile', 0, 0.15 + 1.12 * s, 0, { ex: 1.0 * s, ez: 0.95 * s, rise: 0.5 * s, gable: true, thick: 0.1 * s, curl: 0 });
  kit.box('paint', 0, 0.15 + 0.88 * s, 0.6 * s, 1.2 * s, 0.05, 0.05, C.rope);
  for (let i = 0; i < 4; i++) kit.box('paint', (-0.36 + i * 0.24) * s, 0.15 + 0.76 * s, 0.61 * s, 0.07 * s, 0.22 * s, 0.01, C.paper);
}

// ------------------------------------------------------------------ sites

function bridge(kit, lamps) {
  const B = SITES.bridge;
  kit.at(B.x, 0, B.z, 0);
  const half = B.half, N = 28, W = 3.2;
  const yAt = (x) => 1.3 + 3.8 * Math.pow(Math.max(0, 1 - (x / half) ** 2), 0.85);
  // deck as a curved slab
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const x = -half + (i / N) * half * 2, y = yAt(x);
    pos.push(x, y, -W / 2, x, y, W / 2, x, y - 0.35, -W / 2, x, y - 0.35, W / 2);
    uv.push(x / 2, 0, x / 2, W / 2, x / 2, 0, x / 2, W / 2);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 4, b = a + 4;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
    idx.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  kit.add('wood', g, C.woodGrey, 0, true);
  // lacquered side beams
  for (const sz of [-1, 1]) {
    const p2 = [], i2 = [];
    for (let i = 0; i <= N; i++) {
      const x = -half + (i / N) * half * 2, y = yAt(x);
      p2.push(x, y + 0.05, sz * (W / 2 + 0.06), x, y - 0.55, sz * (W / 2 + 0.06));
    }
    for (let i = 0; i < N; i++) { const a = i * 2; if (sz > 0) i2.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else i2.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3));
    g2.setIndex(i2);
    g2.computeVertexNormals();
    kit.add('paint', g2, C.shu);
    // railing: posts, top and mid rails, bronze giboshi on the end posts
    const top = [], mid = [];
    for (let i = 0; i <= N; i++) {
      const x = -half + (i / N) * half * 2, y = yAt(x);
      top.push(V(x, y + 1.0, sz * W / 2));
      mid.push(V(x, y + 0.5, sz * W / 2));
      if (i % 3 === 0 || i === N) {
        kit.box('paint', x, y + 0.5, sz * W / 2, 0.16, 1.1, 0.16, C.shu);
        if (i === 0 || i === N || i === 12 || i === 15) kit.lathe('metal', [[0, 0], [0.11, 0.02], [0.13, 0.12], [0.06, 0.26], [0.01, 0.36], [0, 0.38]], x, y + 1.05, sz * W / 2, C.bronze, { sides: 10 });
      }
    }
    kit.tube('paint', top, 0.07, C.shu);
    kit.tube('paint', mid, 0.05, C.shu);
  }
  // piers and cross ties
  for (const px of [-0.62, -0.3, 0.3, 0.62]) {
    const x = px * half, y = yAt(x) - 0.35;
    for (const sz of [-1, 1]) {
      kit.cyl('paint', x, -2.2, sz * 1.25, 0.18, 0.2, y + 2.2, C.shu, { sides: 10 });
      kit.cyl('paint', x, -2.2, sz * 1.25, 0.22, 0.22, 2.4, C.black, { sides: 10 });
    }
    kit.box('paint', x, y - 0.7, 0, 0.22, 0.26, 3.2, C.shu);
    kit.box('paint', x, y - 2.0, 0, 0.18, 0.2, 3.0, C.shu);
  }
  // hanging lanterns at both ends
  for (const sx of [-1, 1]) {
    const x = sx * (half - 0.4), y = yAt(x);
    for (const sz of [-1, 1]) {
      kit.box('wood', x, y + 1.6, sz * (W / 2 + 0.25), 0.08, 2.2, 0.08, C.black);
      kit.lathe('paint', [[0, 0], [0.18, 0.04], [0.22, 0.25], [0.18, 0.46], [0, 0.5]], x, y + 1.85, sz * (W / 2 + 0.25), C.paper, { glow: 1, sides: 12 });
    }
    lamps.push({ x: B.x + x, y: y + 2.1, z: B.z, r: 7, k: 1 });
  }
}

function pagoda(kit, lamps) {
  const P = SITES.pagoda;
  kit.at(P.x, P.y, P.z, -Math.PI / 2);
  kit.box('stone', 0, -0.6, 0, 11, 1.6, 11, C.stone);
  for (let i = 0; i < 3; i++) kit.box('stone', 0, -0.9 + i * 0.25, 6.0 + (2 - i) * 0.45, 3.2, 0.25, 0.5, C.stone);
  let y = 0.2, topY = 0;
  let b = 6.4;
  for (let s = 0; s < 5; s++) {
    const H = s === 0 ? 3.4 : 2.0;
    // body: plaster panels between vermilion posts
    kit.box('paint', 0, y + H / 2, 0, b - 0.3, H, b - 0.3, C.plaster);
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) {
      kit.box('paint', sx * (b / 2 - 0.15) * (sx ? 1 : 0), y + H / 2, sz * (b / 2 - 0.1), 0.26, H, 0.26, C.shu);
      kit.box('paint', sz * (b / 2 - 0.1), y + H / 2, sx * (b / 2 - 0.15) * (sx ? 1 : 0), 0.26, H, 0.26, C.shu);
    }
    // doors on the ground storey, railings on upper ones
    if (s === 0) {
      kit.box('paint', 0, y + 1.25, b / 2 - 0.12, 1.6, 2.5, 0.06, C.shu);
      kit.box('wood', 0, y + 1.25, b / 2 - 0.09, 1.3, 2.2, 0.04, C.woodDark, { glow: 0.35 });
    } else {
      kit.box('paint', 0, y + 0.45, 0, b + 0.9, 0.1, b + 0.9, C.shu);
      kit.box('wood', 0, y + 0.05, 0, b + 0.9, 0.12, b + 0.9, C.woodDark);
    }
    // bracket band
    kit.box('paint', 0, y + H + 0.3, 0, b + 0.5, 0.6, b + 0.5, C.shuDark);
    kit.box('paint', 0, y + H + 0.75, 0, b + 1.3, 0.3, b + 1.3, C.plasterWarm);
    const ex = b / 2 + 2.2;
    const rise = s === 4 ? 2.2 : 1.25;
    roof(kit, 'tile', 0, y + H + 0.9, 0, { ex, ez: ex, rx: b * 0.3, rz: b * 0.3, rise, curl: 0.95, thick: 0.38 });
    topY = y + H + 0.9 + rise + 0.25;
    y += H + 0.9 + 1.25 * 0.55;
    b *= 0.86;
  }
  // sorin: the bronze spire with nine rings and a flame
  const top = topY - 0.2;
  kit.box('metal', 0, top + 0.2, 0, 1.1, 0.4, 1.1, C.patina);
  kit.cyl('metal', 0, top + 0.4, 0, 0.12, 0.14, 7.2, C.patina, { sides: 10 });
  for (let i = 0; i < 9; i++) kit.cyl('metal', 0, top + 1.5 + i * 0.5, 0, 0.55 - i * 0.025, 0.55 - i * 0.025, 0.1, C.patina, { sides: 16 });
  kit.lathe('metal', [[0, 0], [0.32, 0.15], [0.42, 0.55], [0.18, 0.95], [0, 1.15]], 0, top + 6.3, 0, C.gold, { sides: 10 });
  lamps.push({ x: P.x - 6.5, y: P.y + 1.6, z: P.z, r: 8, k: 0.5 });
}

function hall(kit, lamps) {
  const H = SITES.hall;
  kit.at(H.x, H.y, H.z, -Math.PI / 2);
  const w = 16, d = 11;
  kit.box('stone', 0, -0.5, 0, w + 3, 1.4, d + 3, C.stone);
  kit.box('wood', 0, 0.85, 0, w + 2.4, 0.2, d + 2.4, C.woodGrey);
  for (let i = 0; i < 5; i++) kit.box('wood', 0, 0.1 + i * 0.18, d / 2 + 1.4 + (5 - i) * 0.3, 4.2, 0.18, 0.4, C.woodGrey);
  const bodyH = 4.4;
  kit.box('paint', 0, 0.95 + bodyH / 2, 0, w - 0.4, bodyH, d - 0.4, C.plaster);
  const cols = 7;
  for (let i = 0; i < cols; i++) {
    const x = -w / 2 + (i / (cols - 1)) * w;
    for (const sz of [-1, 1]) kit.cyl('paint', x, 0.95, sz * d / 2, 0.24, 0.26, bodyH, C.shu, { sides: 12 });
  }
  for (const sx of [-1, 1]) for (const z of [-d / 2 + d / 3, d / 2 - d / 3]) kit.cyl('paint', sx * w / 2, 0.95, z, 0.24, 0.26, bodyH, C.shu, { sides: 12 });
  // lattice doors on the front, lit from inside at night
  for (let i = 0; i < cols - 1; i++) {
    const x = -w / 2 + ((i + 0.5) / (cols - 1)) * w;
    kit.box('paint', x, 0.95 + 1.6, d / 2 - 0.15, w / (cols - 1) - 0.6, 3.0, 0.06, C.shoji, { glow: 0.85 });
    for (let k = -2; k <= 2; k++) kit.box('wood', x + k * 0.42, 0.95 + 1.6, d / 2 - 0.1, 0.06, 3.0, 0.05, C.woodDark);
    for (let k = 0; k < 6; k++) kit.box('wood', x, 0.95 + 0.2 + k * 0.55, d / 2 - 0.1, w / (cols - 1) - 0.6, 0.05, 0.05, C.woodDark);
  }
  // beams and brackets
  kit.box('paint', 0, 0.95 + bodyH + 0.25, 0, w + 0.6, 0.5, d + 0.6, C.shuDark);
  kit.box('paint', 0, 0.95 + bodyH + 0.7, 0, w + 1.6, 0.4, d + 1.6, C.plasterWarm);
  roof(kit, 'tile', 0, 0.95 + bodyH + 0.85, 0, { ex: w / 2 + 3.4, ez: d / 2 + 3.4, rx: w * 0.3, rz: 0.6, rise: 5.0, curl: 1.1, thick: 0.5 });
  // irimoya gable faces above the hips
  for (const sx of [-1, 1]) {
    const gx = sx * (w * 0.3 + 0.2), gy = 0.95 + bodyH + 0.85 + 2.6;
    const pos = [gx, gy, -3.2, gx, gy, 3.2, gx, gy + 2.5, 0];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(sx > 0 ? pos : [pos[3], pos[4], pos[5], pos[0], pos[1], pos[2], pos[6], pos[7], pos[8]], 3));
    g.computeVertexNormals();
    kit.add('paint', g, C.plasterWarm);
  }
  // a great hanging lantern under the eave
  kit.lathe('paint', [[0, 0], [0.45, 0.1], [0.62, 0.7], [0.45, 1.3], [0, 1.4]], 0, 0.95 + 2.9, d / 2 + 1.3, C.shu, { glow: 0.9, sides: 16 });
  lamps.push({ x: H.x - (d / 2 + 2), y: H.y + 3.5, z: H.z, r: 10, k: 1 });
}

function belfry(kit) {
  const Bf = SITES.belfry;
  kit.at(Bf.x, Bf.y, Bf.z, 0);
  kit.box('stone', 0, -0.4, 0, 5.6, 1.2, 5.6, C.stone);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.cyl('paint', sx * 1.9, 0.2, sz * 1.9, 0.16, 0.22, 3.6, C.shu, { sides: 10, rx: sz * 0.04, rz: -sx * 0.04 });
  kit.box('paint', 0, 3.7, 0, 4.4, 0.35, 4.4, C.shuDark);
  roof(kit, 'tile', 0, 3.9, 0, { ex: 3.3, ez: 3.3, rx: 1.0, rz: 0.4, rise: 1.9, curl: 0.8, thick: 0.3 });
  kit.box('wood', 0, 3.55, 0, 3.8, 0.2, 0.25, C.woodDark);
  kit.lathe('metal', [[0, 0], [0.82, 0.02], [0.78, 0.25], [0.7, 1.0], [0.66, 1.5], [0.5, 1.75], [0.12, 1.85], [0, 1.9]], 0, 1.6, 0, C.patina, { sides: 20 });
  // the beam that strikes it
  kit.box('wood', 1.9, 2.3, 0, 2.4, 0.22, 0.22, C.wood);
}

function village(kit, lamps) {
  for (const h of SITES.houses) {
    const R = rng(h.seed);
    kit.at(h.x, h.y, h.z, h.rot);
    const { w, d } = h;
    const H1 = 2.9, H2 = h.floors === 2 ? 2.4 : 0;
    const bodyH = H1 + H2;
    kit.box('stone', 0, -0.35, 0, w + 0.6, 0.9, d + 0.6, C.stoneDark);
    // timber lower walls, plaster above
    kit.box('wood', 0, 0.1 + 1.1, 0, w, 2.2, d, C.woodDark);
    kit.box('paint', 0, 0.1 + 2.2 + (bodyH - 2.2) / 2, 0, w - 0.04, bodyH - 2.2, d - 0.04, R.next() < 0.5 ? C.plaster : C.plasterWarm);
    for (let i = 0; i <= 4; i++) {
      const x = -w / 2 + (i / 4) * w;
      for (const sz of [-1, 1]) kit.box('wood', x, 0.1 + bodyH / 2, sz * (d / 2 + 0.03), 0.18, bodyH, 0.12, C.black);
    }
    kit.box('wood', 0, 0.1 + 2.2, 0, w + 0.12, 0.16, d + 0.12, C.black);
    // shoji on the river side: some lit, some dark
    const lit = R.next() < 0.75 ? R.range(0.6, 1) : 0.05;
    for (let i = 0; i < 3; i++) {
      const x = -w / 2 + ((i + 0.5) / 3) * w;
      kit.box('paint', x, 0.1 + 1.25, d / 2 + 0.04, w / 3 - 0.5, 1.6, 0.03, C.shoji, { glow: lit * R.range(0.7, 1) });
      for (let k = -1; k <= 1; k++) kit.box('wood', x + k * (w / 3 - 0.5) / 3, 0.1 + 1.25, d / 2 + 0.06, 0.04, 1.6, 0.03, C.woodDark);
      for (let k = 0; k < 4; k++) kit.box('wood', x, 0.1 + 0.55 + k * 0.45, d / 2 + 0.06, w / 3 - 0.5, 0.035, 0.03, C.woodDark);
    }
    if (h.floors === 2) {
      for (let i = 0; i < 2; i++) kit.box('paint', -w / 4 + i * w / 2, 0.1 + H1 + 1.1, d / 2 + 0.04, w / 2 - 1.2, 1.0, 0.03, C.shoji, { glow: lit * 0.8 });
      // pent roof over the ground floor
      kit.at(h.x, h.y, h.z, h.rot);
      roof(kit, 'tile', 0, 0.1 + H1 - 0.1, d / 2 + 0.55, { ex: w / 2 + 0.6, ez: 0.65, rise: 0.0001, gable: true, curl: 0, thick: 0.12 });
    }
    // veranda
    kit.box('wood', 0, 0.45, d / 2 + 0.7, w, 0.12, 1.3, C.woodGrey);
    for (const sx of [-1, 1]) kit.box('wood', sx * (w / 2 - 0.1), 0.15, d / 2 + 1.25, 0.14, 0.6, 0.14, C.woodDark);
    const thatch = R.next() < 0.35 && h.floors === 1;
    roof(kit, thatch ? 'thatch' : 'tile', 0, 0.1 + bodyH, 0, { ex: w / 2 + (thatch ? 1.3 : 0.9), ez: d / 2 + (thatch ? 1.3 : 0.9), rise: d * (thatch ? 0.62 : 0.34), gable: true, curl: 0, thick: thatch ? 0.55 : 0.18 });
    if (lit > 0.3 && R.next() < 0.5) lamps.push({ x: h.x + Math.sin(h.rot) * (d / 2 + 1.5), y: h.y + 1.6, z: h.z + Math.cos(h.rot) * (d / 2 + 1.5), r: 5, k: 0.5 * lit });
  }
}

function embankment(kit) {
  const E = SITES.embank;
  kit.at(0, 0, 0, 0);
  const pts = [];
  for (let z = E.z0 + 6; z >= E.z1 - 6; z -= 3) {
    const r = riverAt(z);
    pts.push({ x: r.x + E.side * (r.w + 0.6), z });
  }
  const pos = [], uv = [], idx = [];
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i) len += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
    // battered face toward the water, flat coping on top
    pos.push(p.x - E.side * 0.9, -1.4, p.z, p.x, 1.85, p.z, p.x + E.side * 1.6, 1.85, p.z);
    uv.push(len / 2.6, -1.4 / 2.6, len / 2.6, 1.85 / 2.6, len / 2.6, 2.4 / 2.6);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 3, b = a + 3;
    if (E.side < 0) idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    else idx.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  kit.add('stone', g, C.stone, 0, true);
  // stone steps down to the water at three landings
  for (const z of [-870, -960, -1045]) {
    const r = riverAt(z);
    const x = r.x + E.side * (r.w + 0.6);
    for (let i = 0; i < 6; i++) kit.box('stone', x - E.side * (0.3 + i * 0.32), 1.55 - i * 0.36, z, 0.7, 0.36, 2.4, C.stone);
    kit.box('wood', x - E.side * 2.6, 0.18, z, 2.6, 0.14, 2.0, C.woodGrey);
    for (const sz of [-1, 1]) kit.cyl('wood', x - E.side * 3.6, -1.2, z + sz * 0.9, 0.09, 0.09, 1.9, C.woodDark, { sides: 6 });
  }
}

function riverGates(kit, lamps) {
  const T = SITES.torii;
  let i = 0;
  for (let z = T.z0; z >= T.z1; z -= T.step, i++) {
    const r = riverAt(z);
    const w = r.w * 2 + 1.0;
    kit.at(r.x, 0, z, Math.atan2(riverAt(z - 2).x - riverAt(z + 2).x, -4) + Math.PI);
    torii(kit, w, 8.4 + Math.sin(i * 0.7) * 0.15, { r: 0.36, y0: -2.2 });
    if (i % 5 === 2) {
      // paper lanterns hung from the tie beams
      for (const sx of [-1, 1]) kit.lathe('paint', [[0, 0], [0.22, 0.05], [0.28, 0.32], [0.22, 0.6], [0, 0.65]], sx * w * 0.32, 8.4 * 0.78 - 1.25, 0, C.paper, { glow: 1, sides: 12 });
      lamps.push({ x: r.x, y: 5.6, z, r: 9, k: 0.8 });
    }
  }
}

function greatTorii(kit, lamps) {
  const O = SITES.otorii;
  kit.at(O.x, 0, O.z, 0);
  const w = 15, h = 16.5;
  torii(kit, w, h, { r: 0.78, y0: -3, plaque: true });
  // ryobu legs bracing each pillar fore and aft
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      kit.cyl('paint', sx * w / 2, -3, sz * 2.6, 0.36, 0.4, 3 + 7.2, C.shu, { sides: 12 });
      kit.cyl('paint', sx * w / 2, -3, sz * 2.6, 0.44, 0.46, 3 + 0.9, C.black, { sides: 12 });
      kit.box('paint', sx * w / 2, 7.4, 0, 0.3, 0.5, 5.6, C.shu);
      kit.box('paint', sx * w / 2, 7.0, sz * 2.6, 0.62, 0.42, 0.62, C.black);
    }
    kit.box('paint', sx * w / 2, 4.2, 0, 0.26, 0.36, 5.4, C.shu);
  }
  lamps.push({ x: O.x, y: 2.5, z: O.z + 6, r: 12, k: 0.6 });
}

function shrines(kit, lamps) {
  // the wayside shrine in the morning shallows
  const S = SITES.shrine;
  hokora(kit, S.x - 1.5, S.y, S.z, Math.PI / 2, 1);
  kit.at(S.x + 1.8, S.y, S.z, Math.PI / 2);
  torii(kit, 2.2, 2.7, { r: 0.12, y0: -0.6 });
  for (const sz of [-1, 1]) lantern(kit, S.x + 1.2, S.y, S.z + sz * 2.4, 0.75);
  lamps.push({ x: S.x + 2.5, y: S.y + 1.2, z: S.z, r: 6, k: 0.7 });
  // the island shrine before the sacred tree, facing the river mouth
  const Hk = SITES.hokora;
  const y = terrainHeight(Hk.x, Hk.z);
  hokora(kit, Hk.x, y, Hk.z, 0, 1.35);
  kit.at(Hk.x, terrainHeight(Hk.x, Hk.z + 6), Hk.z + 6, 0);
  torii(kit, 2.8, 3.4, { r: 0.15, y0: -0.6 });
  for (const sx of [-1, 1]) lantern(kit, Hk.x + sx * 2.6, terrainHeight(Hk.x + sx * 2.6, Hk.z + 3.5), Hk.z + 3.5, 0.85);
  lamps.push({ x: Hk.x, y: y + 2.0, z: Hk.z + 3, r: 8, k: 0.8 });
  // shimenawa: the straw rope and paper streamers that mark the sacred tree
  const ty = terrainHeight(ISLAND.x, ISLAND.z);
  kit.at(ISLAND.x, ty + 2.4, ISLAND.z, 0);
  const rope = new THREE.TorusGeometry(1.62, 0.16, 8, 40);
  rope.rotateX(Math.PI / 2);
  kit.add('paint', rope, C.rope);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    kit.box('paint', Math.cos(a) * 1.7, -0.35, Math.sin(a) * 1.7, 0.16, 0.5, 0.012, C.paper, { ry: -a + Math.PI / 2 });
  }
}

function lanterns(kit, lamps) {
  for (const L of SITES.bankLanterns) {
    const y = terrainHeight(L.x, L.z);
    lamps.push({ ...lantern(kit, L.x, y, L.z, 1), r: 7, k: 1 });
  }
  for (const L of SITES.lakeLanterns) {
    const y = Math.max(terrainHeight(L.x, L.z), -0.2);
    lamps.push({ ...lantern(kit, L.x, y, L.z, 1.1), r: 8, k: 1 });
  }
}

// ------------------------------------------------------------------ materials

// plain-woven cotton, painted once: uneven dye, a fine weave and soft drape folds, in neutral grey so the vertex
// colour of each garment shows through
let fabricTex = null;
function fabric(size = 256) {
  if (fabricTex) return fabricTex;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const R = rng(907);
  g.fillStyle = 'rgb(214,214,214)';
  g.fillRect(0, 0, size, size);
  // folds: soft vertical bands, wrapped so the tile repeats
  for (let i = 0; i < 9; i++) {
    const x = R.next() * size, w = R.range(10, 34), a = R.range(0.06, 0.16);
    for (const ox of [-size, 0, size]) {
      const grd = g.createLinearGradient(x + ox - w, 0, x + ox + w, 0);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.5, `rgba(0,0,0,${a})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x + ox - w, 0, w * 2, size);
    }
  }
  // dye: blotches, lighter and darker
  for (let i = 0; i < 70; i++) {
    const x = R.next() * size, y = R.next() * size, r = R.range(6, 26);
    const l = R.next() < 0.5 ? '255,255,255' : '0,0,0';
    for (const [ox, oy] of [[0, 0], [-size, 0], [0, -size], [-size, -size]]) {
      const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grd.addColorStop(0, `rgba(${l},0.07)`);
      grd.addColorStop(1, `rgba(${l},0)`);
      g.fillStyle = grd;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  // the weave
  const img = g.getImageData(0, 0, size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const w = ((x >> 1) + (y >> 1)) & 1 ? 1.06 : 0.94;
    const k = w * (0.97 + 0.06 * R.next());
    d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k);
  }
  g.putImageData(img, 0, 0);
  fabricTex = new THREE.CanvasTexture(c);
  fabricTex.wrapS = fabricTex.wrapT = THREE.RepeatWrapping;
  fabricTex.colorSpace = THREE.SRGBColorSpace;
  fabricTex.anisotropy = 4;
  return fabricTex;
}

export function archMaterials(tex) {
  const mk = (key, params, o = {}) => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...params });
    patch(m, {
      key: 'arch-' + key,
      snow: o.snow ?? 1,
      wet: o.wet ?? 0.8,
      vertexHead: `attribute float aGlow; varying float vGlow;`,
      fragHead: `varying float vGlow;`,
      hooks: {
        vertex: `vGlow = aGlow;`,
        preLight: /* glsl */ `
          {
            // lit paper: a warm inner glow, brighter at the centre of each panel
            float g = vGlow * uLampOn;
            if (g > 0.001) {
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.4, g * 0.6);
              totalEmissiveRadiance += vec3(1.0, 0.52, 0.2) * g * 2.4 * (0.85 + 0.15 * sin(uTime * 7.0 + vSfWP.x * 3.0 + vSfWP.z));
            }
          }`,
      },
    });
    return m;
  };
  const T = (id) => ({ map: tex[id + '_c'], normalMap: tex[id + '_n'] });
  return {
    paint: mk('paint', { ...T('painted_plaster_wall'), roughness: 0.62, normalScale: new THREE.Vector2(0.4, 0.4) }),
    wood: mk('wood', { ...T('weathered_planks'), roughness: 0.85 }),
    tile: mk('tile', { ...T('grey_roof_tiles'), roughness: 0.58, metalness: 0.1 }, { snow: 1.2 }),
    thatch: mk('thatch', { ...T('reed_roof_04'), roughness: 0.95 }, { snow: 1.2 }),
    stone: mk('stone', { ...T('japanese_stone_wall'), roughness: 0.9 }),
    metal: mk('metal', { roughness: 0.38, metalness: 0.85 }, { snow: 0.6, wet: 0.3 }),
    cloth: mk('cloth', { map: fabric(), roughness: 0.86, side: THREE.DoubleSide }, { snow: 0.5, wet: 0.5 }),
    skin: mk('skin', { roughness: 0.62 }, { snow: 0.2, wet: 0.4 }),
  };
}

export function createArchitecture(tex) {
  const mats = archMaterials(tex);
  const group = new THREE.Group();
  group.name = 'architecture';
  const lamps = [];
  const sites = [
    ['bridge', bridge], ['pagoda', pagoda], ['hall', hall], ['belfry', belfry], ['village', village],
    ['embankment', embankment], ['gates', riverGates], ['otorii', greatTorii], ['shrines', shrines], ['lanterns', lanterns],
  ];
  for (const [name, fn] of sites) {
    const kit = new Kit();
    fn(kit, lamps);
    group.add(kit.build(mats, name));
  }
  for (const l of lamps) l.c = [1.0 * l.k * 2.2, 0.5 * l.k * 2.2, 0.18 * l.k * 2.2];
  group.userData.lamps = lamps;
  return group;
}

export { ISLAND };

// The valley: river centreline, channel widths, terrain height, building pads, places and the boat's path.
// Water level is y = 0, the boat travels toward -z, +x is the right bank as seen from the boat.
import { clamp, lerp, smoothstep, fbm, ridged, vnoise } from '../lib/math.js';

// z, x (centre), w (water half-width), v (valley floor half-width), d (bed depth), cliff (0..1)
const CP = [
  [700, 0, 16, 60, 2.0, 0],
  [400, 4, 16, 60, 2.0, 0],
  [200, 6, 17, 64, 1.8, 0],
  [60, 0, 19, 72, 1.5, 0],
  [-80, 16, 21, 82, 1.3, 0],
  [-220, 28, 18, 72, 1.7, 0],
  [-360, 10, 15, 56, 2.2, 0],
  [-500, -16, 14, 50, 2.4, 0],
  [-620, -24, 13, 54, 2.4, 0],
  [-700, -16, 12, 60, 2.4, 0],
  [-800, 2, 15, 104, 2.4, 0],
  [-950, 12, 16, 112, 2.4, 0],
  [-1100, 6, 15, 92, 2.4, 0],
  [-1220, -8, 12, 28, 2.8, 0.55],
  [-1320, -20, 11, 15, 3.0, 1],
  [-1440, -26, 11, 13, 3.0, 1],
  [-1560, -12, 11, 18, 3.0, 0.8],
  [-1620, 0, 10, 26, 2.7, 0.35],
  [-1660, 0, 10, 28, 2.6, 0.25],
  [-1780, 0, 10, 26, 2.6, 0.2],
  [-1900, 0, 10, 30, 2.6, 0.2],
  [-1940, 0, 11, 36, 2.7, 0.1],
  [-2020, 0, 13, 50, 2.8, 0],
  [-2100, 0, 16, 64, 3.0, 0],
  [-2400, 0, 16, 64, 3.0, 0],
  [-2900, 0, 16, 64, 3.0, 0],
];

export const LAKE = { x: 0, z: -2330, r: 188 };
export const ISLAND = { x: 6, z: -2345, r: 34 };
export const Z_START = 40;
export const Z_LAKE = -2110;

const N = CP.length;
const cr = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

const _r = { x: 0, w: 0, v: 0, d: 0, cliff: 0, slope: 0, cos: 1 };
// interpolated channel parameters at z; returns a shared object, copy if kept
export function riverAt(z) {
  let i = 0;
  if (z >= CP[0][0]) i = 0;
  else if (z <= CP[N - 1][0]) i = N - 2;
  else while (i < N - 2 && CP[i + 1][0] > z) i++;
  const a = CP[Math.max(0, i - 1)], b = CP[i], c = CP[i + 1], e = CP[Math.min(N - 1, i + 2)];
  const t = clamp((b[0] - z) / (b[0] - c[0]), 0, 1);
  const x = cr(a[1], b[1], c[1], e[1], t);
  const s = t * t * (3 - 2 * t);
  _r.x = x;
  _r.w = lerp(b[2], c[2], s);
  _r.v = lerp(b[3], c[3], s);
  _r.d = lerp(b[4], c[4], s);
  _r.cliff = lerp(b[5], c[5], s);
  const dz = 0.5;
  const tt = clamp((b[0] - (z - dz)) / (b[0] - c[0]), 0, 1);
  const x2 = cr(a[1], b[1], c[1], e[1], tt);
  _r.slope = (x2 - x) / dz;
  _r.cos = 1 / Math.sqrt(1 + _r.slope * _r.slope);
  return _r;
}

export const riverX = (z) => riverAt(z).x;

// noisy half-width per bank, so the two shores never run parallel
function bankW(r, z, side) {
  return r.w * (1 + 0.13 * fbm(z * 0.021 + side * 31.7, side * 4.1, 3)) + 1.2 * vnoise(z * 0.11, side * 9.3);
}

// signed horizontal distance to the open water (negative on water)
export function waterSd(x, z) {
  const r = riverAt(z);
  const side = x >= r.x ? 1 : -1;
  const dx = Math.abs(x - r.x) * r.cos;
  let sd = dx - bankW(r, z, side);
  // the river ends in the lake
  if (z < -2168) sd += (-2168 - z) * 4;
  if (z < -1950) {
    const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
    const ang = Math.atan2(z - LAKE.z, x - LAKE.x);
    const lakeR = LAKE.r * (1 + 0.06 * Math.sin(ang * 3 + 1.2) + 0.04 * Math.sin(ang * 7 - 0.4));
    let lsd = ld - lakeR;
    const di = Math.hypot(x - ISLAND.x, z - ISLAND.z);
    const isl = ISLAND.r * (1 + 0.09 * Math.sin(Math.atan2(z - ISLAND.z, x - ISLAND.x) * 4 + 0.7));
    lsd = Math.max(lsd, isl - di);
    sd = Math.min(sd, lsd);
  }
  return sd;
}

// building pads: terrain is flattened to y inside r, blending out over f
export const PADS = [];
export function addPad(x, z, r, y, f = 8) { PADS.push({ x, z, r, y, f }); }

function hillHeight(x, z, t, r) {
  // t = metres beyond the valley floor: rounded wooded foothills, then ridges receding into the range
  if (t <= 0) return 0;
  const n = fbm(x * 0.0045 + 1.3, z * 0.0045, 4);
  const spur = fbm(x * 0.0016 - 4.0, z * 0.0022 + 2.0, 3); // side valleys and spurs
  const foot = (t * 0.3 + t * t * 0.0009) * (0.7 + 0.45 * n) * (0.75 + 0.5 * spur);
  const ridge = ridged(x * 0.0026 + 3.1, z * 0.0026 - 1.7, 5) * 210 * smoothstep(90, 520, t);
  let h = Math.min(foot, 150 + foot * 0.15) + ridge;
  if (r.cliff > 0) {
    const wall = Math.min(t, 34) * 2.1 + Math.max(0, t - 34) * 0.42;
    h = lerp(h, wall + ridge * 0.6 + 6 * fbm(x * 0.05, z * 0.05, 3), r.cliff);
  }
  return Math.min(h, 330);
}

export function terrainHeight(x, z) {
  const r = riverAt(z);
  const v = r.v, w = r.w, d = r.d, cliff = r.cliff;
  const sd = waterSd(x, z);
  let h;
  const lakeZone = z < -1990 ? smoothstep(-1990, -2120, z) : 0;
  const depth = lerp(d, 4.2, lakeZone);
  if (sd < 0) {
    // bed: parabolic-ish channel, a little noise
    const k = clamp(-sd / Math.max(4, lerp(w, 40, lakeZone)), 0, 1);
    h = -depth * Math.pow(1 - (1 - k) * (1 - k), 0.85) + 0.25 * fbm(x * 0.15, z * 0.15, 2) * k;
    h = Math.min(h, -0.05 - 0.4 * k);
  } else {
    // bank, then floodplain with soft undulation
    const bank = 0.75 * smoothstep(0, 5.5 - 3 * cliff, sd);
    const plain = smoothstep(4, 22, sd) * (0.55 + 0.55 * fbm(x * 0.03, z * 0.03, 3));
    const rise = smoothstep(0, Math.max(10, v - w), sd) * 1.6;
    h = bank + plain * (1 - cliff) + rise;
    h += hillHeight(x, z, sd - Math.max(4, v - w), r);
  }
  // the sacred island: a low mound for the tree
  const di = Math.hypot(x - ISLAND.x, z - ISLAND.z);
  if (di < ISLAND.r + 10) h += 1.4 * smoothstep(ISLAND.r * 0.85, 0, di) + 0.6 * smoothstep(ISLAND.r, ISLAND.r * 0.5, di);
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i];
    const dd = Math.hypot(x - p.x, z - p.z);
    if (dd < p.r + p.f) h = lerp(h, p.y, smoothstep(p.r + p.f, p.r, dd));
  }
  return h;
}

// woodland density: slopes above the valley floor, broken into stands; thin on high ridges
export function forestAt(x, z, h, sd) {
  const r = riverAt(z);
  const t = sd - Math.max(4, r.v - r.w);
  let f = smoothstep(-8, 16, t) * (0.62 + 0.55 * fbm(x * 0.011 + 7.0, z * 0.011, 3));
  f *= 1 - smoothstep(170, 280, h);
  // scattered copses on the floodplain
  f = Math.max(f, smoothstep(0.42, 0.7, fbm(x * 0.02 - 3.0, z * 0.02 + 5.0, 3)) * smoothstep(8, 20, sd) * 0.8);
  return clamp(f, 0, 1);
}

export function terrainNormal(x, z, e = 0.8, out = [0, 1, 0]) {
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  const l = Math.hypot(hx, 2 * e, hz);
  out[0] = -hx / l; out[1] = (2 * e) / l; out[2] = -hz / l;
  return out;
}

// chapters along the journey; z is where the title appears
export const PLACES = [
  { id: 'asagiri', z: 10, jp: '朝霧の瀬', kana: 'あさぎりのせ', en: 'Shallows of Morning Mist' },
  { id: 'sakura', z: -300, jp: '桜並木', kana: 'さくらなみき', en: 'The Cherry Avenue' },
  { id: 'bridge', z: -640, jp: '朱の太鼓橋', kana: 'あけのたいこばし', en: 'The Vermilion Drum Bridge' },
  { id: 'village', z: -820, jp: '五重塔の里', kana: 'ごじゅうのとうのさと', en: 'Village of the Five-Storey Pagoda' },
  { id: 'gorge', z: -1230, jp: '竹林峡', kana: 'ちくりんきょう', en: 'The Bamboo Gorge' },
  { id: 'torii', z: -1640, jp: '千本鳥居', kana: 'せんぼんとりい', en: 'A Thousand Gates' },
  { id: 'lake', z: -2080, jp: '御神木の湖', kana: 'ごしんぼくのみずうみ', en: 'Lake of the Sacred Tree' },
];

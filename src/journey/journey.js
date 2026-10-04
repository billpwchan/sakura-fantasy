// The voyage: a path down the river centre, through the great torii and once around the sacred island.
// Owns the boat's progress, the steering offset, and the day/weather schedule that follows the journey.
import { riverAt, ISLAND, PLACES, Z_START } from '../world/layout.js';
import { SITES } from '../world/sites.js';
import { clamp, lerp, smoothstep } from '../lib/math.js';

const ORBIT_R = 80;
const MOUTH_Z = -2165;

function buildPath() {
  const raw = [];
  for (let z = Z_START; z > MOUTH_Z; z -= 2) raw.push([riverAt(z).x, z]);
  // smooth the centre line so the boat never zigzags with the banks
  const sm = raw.map((p, i) => {
    let sx = 0, n = 0;
    for (let k = -8; k <= 8; k++) {
      const q = raw[Math.max(0, Math.min(raw.length - 1, i + k))];
      sx += q[0]; n++;
    }
    return [i < 4 || i > raw.length - 5 ? p[0] : sx / n, p[1]];
  });
  // ease into the lake: from the mouth to the west side of the island, then once around it
  const p0 = sm[sm.length - 1];
  const wx = ISLAND.x - ORBIT_R, wz = ISLAND.z;
  const P = [p0, [p0[0], p0[1] - 60], [wx, wz + 60], [wx, wz]];
  for (let i = 1; i <= 40; i++) {
    const t = i / 40, u = 1 - t;
    sm.push([
      u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0],
      u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1],
    ]);
  }
  const orbitStart = sm.length;
  for (let i = 1; i <= 160; i++) {
    const a = Math.PI + (i / 160) * Math.PI * 2;
    sm.push([ISLAND.x + Math.cos(a) * ORBIT_R, ISLAND.z + Math.sin(a) * ORBIT_R]);
  }
  const len = new Float32Array(sm.length);
  for (let i = 1; i < sm.length; i++) len[i] = len[i - 1] + Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]);
  return { pts: sm, len, total: len[len.length - 1], orbitS: len[orbitStart - 1] };
}

// when on the journey (0..1) it is what time of day: misty dawn at the start, night by the island
const DAY = [
  [0.0, 5.75], [0.06, 6.6], [0.16, 8.4], [0.3, 11.2], [0.44, 13.6], [0.56, 15.6], [0.66, 17.2], [0.74, 18.0],
  [0.8, 18.7], [0.86, 19.6], [0.92, 21.0], [1.0, 22.0],
];

export class Journey {
  constructor() {
    const p = buildPath();
    this.pts = p.pts;
    this.len = p.len;
    this.total = p.total;
    this.orbitS = p.orbitS;
    this.s = 0;
    this.speed = 0;
    this.cruise = 4.6; // m/s
    this.target = this.cruise;
    this.lat = 0;
    this.latV = 0;
    this.steer = 0;
    this.thrust = 0;
    this.loop = 0;
    this.pose = { x: 0, z: 0, heading: Math.PI, speed: 0, lean: 0 };
    this.placeIdx = -1;
    this.onPlace = null;
    this.onLoopEnd = null;
    this._i = 0;
    this.ended = false;
  }

  get progress() { return this.s / this.total; }

  sAtZ(z) {
    for (let i = 1; i < this.pts.length; i++) if (this.pts[i][1] <= z) return this.len[i];
    return 0;
  }

  hourAt(f = this.progress) {
    for (let i = 1; i < DAY.length; i++) {
      if (f <= DAY[i][0]) {
        const t = (f - DAY[i - 1][0]) / (DAY[i][0] - DAY[i - 1][0]);
        return lerp(DAY[i - 1][1], DAY[i][1], smoothstep(0, 1, t));
      }
    }
    return DAY[DAY.length - 1][1];
  }

  // the weather each stretch of river asks for, by season (0 spring .. 3 winter)
  weatherAt(z, season) {
    const gorge = z < -1180 && z > -1560;
    if (z > -150) return season === 3 ? 'snow' : 'mist';
    if (gorge) return season === 3 ? 'snow' : season === 2 ? 'mist' : 'rain';
    if (z < -1560 && z > -1700) return 'mist';
    if (season === 3) return z < -2000 ? 'clear' : 'snow';
    return 'clear';
  }

  placeAt(z) {
    let idx = -1;
    for (let i = 0; i < PLACES.length; i++) if (z <= PLACES[i].z) idx = i;
    return idx;
  }

  sample(s, out) {
    s = clamp(s, 0, this.total);
    let i = this._i;
    while (i < this.len.length - 2 && this.len[i + 1] < s) i++;
    while (i > 0 && this.len[i] > s) i--;
    this._i = i;
    const a = this.pts[i], b = this.pts[i + 1];
    const t = (s - this.len[i]) / Math.max(1e-6, this.len[i + 1] - this.len[i]);
    out.x = a[0] + (b[0] - a[0]) * t;
    out.z = a[1] + (b[1] - a[1]) * t;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    out.tx = dx / l; out.tz = dz / l;
    return out;
  }

  // how far the boat may stray from the centre line here
  latLimit(z) {
    if (z < -2150) return 30;
    if (Math.abs(z - SITES.bridge.z) < 14) return 2.2;
    const r = riverAt(z);
    return Math.max(1.5, r.w * 0.55 - 2.5);
  }

  reset(loop) {
    this.s = 0;
    this._i = 0;
    this.lat = 0;
    this.latV = 0;
    this.loop = loop;
    this.placeIdx = -1;
    this.ended = false;
  }

  // move straight to a stretch of river, as if the boat had always been there
  jump(s) {
    this.s = clamp(s, 0, this.total - 1);
    this._i = 0;
    this.lat = 0;
    this.latV = 0;
    this.ended = false;
    const c = this.sample(this.s, this._c || (this._c = {}));
    this.placeIdx = this.placeAt(c.z) - 1;
    this.pose.heading = Math.atan2(c.tx, c.tz);
  }

  update(dt) {
    // speed eases toward the cruise or the player's thrust
    const want = clamp(this.target + this.thrust * 4, 0, 11);
    this.speed += (want - this.speed) * (1 - Math.exp(-dt * (want > this.speed ? 0.6 : 1.1)));
    this.s += this.speed * dt;
    if (this.s >= this.total) {
      this.s = this.total;
      if (!this.ended) {
        this.ended = true;
        this.onLoopEnd && this.onLoopEnd();
      }
    }
    const c = this.sample(this.s, this._c || (this._c = {}));
    // steering: a sideways drift with inertia, bounded by the banks
    const lim = this.latLimit(c.z);
    this.latV += (this.steer * 2.2 - this.latV) * (1 - Math.exp(-dt * 1.4));
    this.lat = clamp(this.lat + this.latV * dt * (0.4 + this.speed * 0.15), -lim, lim);
    if (!this.steer) this.lat *= Math.exp(-dt * 0.08);
    const nx = -c.tz, nz = c.tx;
    const x = c.x + nx * this.lat, z = c.z + nz * this.lat;
    const heading = Math.atan2(c.tx, c.tz) - this.latV * 0.08;
    const p = this.pose;
    // smooth heading through the polyline corners
    let dh = heading - p.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    p.heading += dh * (1 - Math.exp(-dt * 2.5));
    p.x = x; p.z = z;
    p.speed = this.speed;
    p.lean = -this.latV * 0.4;

    const idx = this.placeAt(c.z);
    if (idx !== this.placeIdx && idx > this.placeIdx) {
      this.placeIdx = idx;
      this.onPlace && this.onPlace(PLACES[idx], idx);
    }
    return p;
  }
}

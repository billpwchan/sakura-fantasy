// Foliage cards painted at load on a canvas: sakura blossom sprays, broad leaves, maple, needle sprays, bamboo.
// Leaf cards are painted in neutral greys (the material tints them per season); blossoms keep their colour.
import * as THREE from 'three';
import { rng } from '../lib/math.js';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

// transparent texels take the mean leaf colour, so mipmaps do not darken the silhouettes
function toTexture(c) {
  const g = c.getContext('2d');
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
  if (n) { r /= n; gg /= n; b /= n; }
  // a soft round mask so no card ever shows a straight cut edge
  const W = c.width, Hh = c.height;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const dx = (x + 0.5) / W - 0.5, dy = (y + 0.5) / Hh - 0.5;
    const rr = Math.sqrt(dx * dx + dy * dy);
    const m = Math.min(1, Math.max(0, (0.5 - rr) / 0.12));
    d[i + 3] = d[i + 3] * m;
  }
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 8) { d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 0; }
  const t = new THREE.DataTexture(new Uint8Array(d.buffer.slice(0)), c.width, c.height, THREE.RGBAFormat);
  t.flipY = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.premultiplyAlpha = false;
  return t;
}

// a twig that wanders from (x,y) with a given direction, returns points
function twig(R, x, y, ang, len, steps) {
  const pts = [[x, y]];
  for (let i = 0; i < steps; i++) {
    ang += R.range(-0.25, 0.25);
    x += Math.cos(ang) * (len / steps);
    y += Math.sin(ang) * (len / steps);
    pts.push([x, y]);
  }
  return pts;
}

function strokeTwig(g, pts, w0, w1, col) {
  g.strokeStyle = col;
  g.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    g.lineWidth = w0 + (w1 - w0) * (i / pts.length);
    g.beginPath();
    g.moveTo(pts[i - 1][0], pts[i - 1][1]);
    g.lineTo(pts[i][0], pts[i][1]);
    g.stroke();
  }
}

function blossom(size = 512) {
  const [c, g] = canvas(size);
  const R = rng(11);
  const S = size / 512;
  // twigs from the lower-left corner region out across the card
  const tips = [];
  for (let k = 0; k < 9; k++) {
    const a = R.next() * Math.PI * 2;
    const pts = twig(R, 256 * S + Math.cos(a) * 30 * S, 256 * S + Math.sin(a) * 30 * S, a, R.range(120, 190) * S, 7);
    strokeTwig(g, pts, 5 * S, 1.5 * S, '#3a2620');
    for (let i = 1; i < pts.length; i++) if (R.next() < 0.85) tips.push(pts[i]);
  }
  // flowers clustered on the twigs: five notched petals, white blushing pink toward the centre
  const flower = (x, y, r, rot, tint) => {
    for (let p = 0; p < 5; p++) {
      const a = rot + (p / 5) * Math.PI * 2;
      g.save();
      g.translate(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55);
      g.rotate(a + Math.PI / 2);
      const grd = g.createRadialGradient(0, r * 0.35, 0, 0, 0, r * 0.75);
      grd.addColorStop(0, `rgb(${238 - tint * 12},${178 - tint * 25},${196 - tint * 20})`);
      grd.addColorStop(0.55, `rgb(${252 - tint * 4},${226 - tint * 18},${234 - tint * 14})`);
      grd.addColorStop(1, `rgb(255,${244 - tint * 14},${246 - tint * 10})`);
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(0, 0, r * 0.42, r * 0.6, 0, 0, Math.PI * 2);
      g.fill();
      // the notch at the petal tip
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(0, -r * 0.62, r * 0.1, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'source-over';
      g.restore();
    }
    g.fillStyle = '#c0506e';
    g.beginPath();
    g.arc(x, y, r * 0.16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f3d27a';
    for (let s = 0; s < 6; s++) {
      const a = R.next() * Math.PI * 2;
      g.fillRect(x + Math.cos(a) * r * 0.22, y + Math.sin(a) * r * 0.22, 1.6 * S, 1.6 * S);
    }
  };
  for (const [tx, ty] of tips) {
    const n = R.int(4, 7);
    const tint = R.next() < 0.3 ? R.range(0.6, 1) : R.range(0, 0.5);
    for (let i = 0; i < n; i++) flower(tx + R.range(-24, 24) * S, ty + R.range(-24, 24) * S, R.range(13, 19) * S, R.next() * 6.28, Math.min(1, tint + R.range(-0.15, 0.15)));
  }
  // a few young reddish leaves among the flowers
  g.fillStyle = 'rgba(120,70,50,0.9)';
  for (let i = 0; i < 18; i++) {
    const [tx, ty] = R.pick(tips);
    g.save();
    g.translate(tx + R.range(-20, 20) * S, ty + R.range(-20, 20) * S);
    g.rotate(R.next() * 6.28);
    g.beginPath();
    g.ellipse(0, 0, 4 * S, 10 * S, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  return toTexture(c);
}

// a round puff of blossoms: flowers come in umbels of five to nine on short stalks, so the card reads as
// clumps with shade between them, not an even speckle; deeper flowers sit darker and pinker
function blossomPuff(size = 512) {
  const [c, g] = canvas(size);
  const R = rng(17);
  const S = size / 512;
  for (let k = 0; k < 5; k++) {
    const a = R.next() * Math.PI * 2;
    const pts = twig(R, 256 * S, 256 * S, a, R.range(140, 200) * S, 6);
    strokeTwig(g, pts, 4 * S, 1.2 * S, '#2e1e1a');
  }
  const flower = (x, y, r, lift, pink, rot) => {
    for (let p = 0; p < 5; p++) {
      const pa = rot + (p / 5) * Math.PI * 2;
      g.save();
      g.translate(x + Math.cos(pa) * r * 0.48, y + Math.sin(pa) * r * 0.48);
      g.rotate(pa + Math.PI / 2);
      const grd = g.createLinearGradient(0, r * 0.3, 0, -r * 0.5);
      const base = [255 - pink * 12, 214 - pink * 58, 226 - pink * 40];
      const tip = [255, 240 - pink * 22, 244 - pink * 16];
      grd.addColorStop(0, `rgb(${(base[0] * lift) | 0},${(base[1] * lift) | 0},${(base[2] * lift) | 0})`);
      grd.addColorStop(1, `rgb(${(tip[0] * lift) | 0},${(tip[1] * lift) | 0},${(tip[2] * lift) | 0})`);
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(0, 0, r * 0.44, r * 0.6, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.fillStyle = `rgb(${(214 * lift) | 0},${(96 * lift) | 0},${(128 * lift) | 0})`;
    g.beginPath();
    g.arc(x, y, r * 0.16, 0, Math.PI * 2);
    g.fill();
  };
  const clumps = [];
  for (let i = 0; i < 46; i++) {
    const rr = Math.pow(R.next(), 0.6) * 185 * S, a = R.next() * Math.PI * 2;
    clumps.push([256 * S + Math.cos(a) * rr, 256 * S + Math.sin(a) * rr * 0.92, R.next()]);
  }
  clumps.sort((p, q) => p[2] - q[2]);
  for (const [cx, cy, depth] of clumps) {
    // the clump's own shadow underneath, then its flowers, lit from above
    const sr = R.range(30, 42) * S;
    const sh = g.createRadialGradient(cx, cy + sr * 0.25, 0, cx, cy + sr * 0.25, sr);
    sh.addColorStop(0, 'rgba(120,52,72,0.55)');
    sh.addColorStop(1, 'rgba(120,52,72,0)');
    g.fillStyle = sh;
    g.beginPath();
    g.arc(cx, cy + sr * 0.25, sr, 0, Math.PI * 2);
    g.fill();
    const n = R.int(5, 9);
    const pink = R.next() < 0.3 ? R.range(0.55, 1) : R.range(0, 0.4);
    for (let k = 0; k < n; k++) {
      const a = R.next() * Math.PI * 2, d = Math.sqrt(R.next()) * sr * 0.62;
      const fy = Math.sin(a) * d;
      const lift = (0.6 + 0.3 * depth) * (0.86 + 0.14 * (1 - (fy / (sr * 0.62) + 1) / 2) * 1.6);
      flower(cx + Math.cos(a) * d, cy + fy, R.range(10, 14.5) * S, Math.min(1, lift), pink, R.next() * 6.283);
    }
  }
  return toTexture(c);
}

// small florets for meadow flowers, painted grey and tinted per season in the grass shader
function florets(size = 128) {
  const [c, g] = canvas(size);
  const R = rng(61);
  const S = size / 128;
  for (let i = 0; i < 26; i++) {
    const rr = Math.pow(R.next(), 0.7) * 44 * S, a = R.next() * 6.283;
    const x = 64 * S + Math.cos(a) * rr, y = 64 * S + Math.sin(a) * rr;
    const r = R.range(5, 8) * S;
    const v = R.range(170, 250) | 0;
    g.fillStyle = `rgb(${v},${v},${v})`;
    for (let p = 0; p < 4; p++) {
      const pa = (p / 4) * 6.283 + a;
      g.beginPath();
      g.ellipse(x + Math.cos(pa) * r * 0.45, y + Math.sin(pa) * r * 0.45, r * 0.42, r * 0.3, pa, 0, 6.283);
      g.fill();
    }
  }
  return toTexture(c);
}

function leafShape(g, len, wid) {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(wid, -len * 0.25, wid * 0.8, -len * 0.75, 0, -len);
  g.bezierCurveTo(-wid * 0.8, -len * 0.75, -wid, -len * 0.25, 0, 0);
  g.fill();
}

function broadleaf(size = 512, seed = 21, lenR = [26, 40], density = 1) {
  const [c, g] = canvas(size);
  const R = rng(seed);
  const S = size / 512;
  const tips = [];
  for (let k = 0; k < 6; k++) {
    const pts = twig(R, R.range(80, 420) * S, R.range(420, 500) * S, R.range(-2.2, -0.9), R.range(250, 400) * S, 10);
    strokeTwig(g, pts, 5 * S, 1.5 * S, '#2a2a2a');
    for (let i = 2; i < pts.length; i++) tips.push(pts[i]);
  }
  for (let i = 0; i < 260 * density; i++) {
    const [tx, ty] = R.pick(tips);
    const v = R.range(105, 215) | 0;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.save();
    g.translate(tx + R.range(-14, 14) * S, ty + R.range(-14, 14) * S);
    g.rotate(R.range(-3.1, 3.1));
    leafShape(g, R.range(lenR[0], lenR[1]) * S, R.range(9, 14) * S);
    // midrib
    g.strokeStyle = `rgba(255,255,255,0.18)`;
    g.lineWidth = 1 * S;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -lenR[0] * S);
    g.stroke();
    g.restore();
  }
  return toTexture(c);
}

function maple(size = 512) {
  const [c, g] = canvas(size);
  const R = rng(33);
  const S = size / 512;
  const tips = [];
  for (let k = 0; k < 7; k++) {
    const pts = twig(R, R.range(60, 450) * S, R.range(430, 500) * S, R.range(-2.3, -0.8), R.range(250, 380) * S, 10);
    strokeTwig(g, pts, 4 * S, 1.2 * S, '#3a2222');
    for (let i = 2; i < pts.length; i++) tips.push(pts[i]);
  }
  const lobes = 7;
  for (let i = 0; i < 150; i++) {
    const [tx, ty] = R.pick(tips);
    const v = R.range(110, 220) | 0;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.save();
    g.translate(tx + R.range(-16, 16) * S, ty + R.range(-16, 16) * S);
    g.rotate(R.range(-3.1, 3.1));
    const r = R.range(15, 24) * S;
    g.beginPath();
    for (let l = 0; l <= lobes * 2; l++) {
      const a = -Math.PI / 2 + ((l / (lobes * 2)) - 0.5) * Math.PI * 1.65;
      const rr = l % 2 === 0 ? r * (l === lobes ? 1 : 0.85) : r * 0.38;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (l === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
    g.restore();
  }
  return toTexture(c);
}

function needles(size = 512, seed = 44) {
  const [c, g] = canvas(size);
  const R = rng(seed);
  const S = size / 512;
  // a flat spray: a central stem with needle tufts, slightly drooping
  for (let k = 0; k < 9; k++) {
    const pts = twig(R, R.range(60, 450) * S, R.range(380, 500) * S, R.range(-2.0, -1.1), R.range(250, 420) * S, 12);
    strokeTwig(g, pts, 4 * S, 1 * S, '#303030');
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      for (let n = 0; n < 16; n++) {
        const a = R.next() * Math.PI * 2;
        const l = R.range(14, 30) * S;
        const v = R.range(90, 200) | 0;
        g.strokeStyle = `rgb(${v},${v},${v})`;
        g.lineWidth = R.range(1.4, 2.6) * S;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.8);
        g.stroke();
      }
    }
  }
  return toTexture(c);
}

function bambooLeaves(size = 512) {
  const [c, g] = canvas(size);
  const R = rng(55);
  const S = size / 512;
  for (let k = 0; k < 8; k++) {
    const pts = twig(R, R.range(80, 430) * S, R.range(80, 460) * S, R.range(0, 6.28), R.range(80, 160) * S, 5);
    strokeTwig(g, pts, 2.2 * S, 1 * S, '#3c3c3c');
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      const n = R.int(2, 4);
      for (let j = 0; j < n; j++) {
        const v = R.range(120, 215) | 0;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.save();
        g.translate(x, y);
        g.rotate(R.range(-3.1, 3.1));
        leafShape(g, R.range(55, 85) * S, R.range(6, 9) * S);
        g.restore();
      }
    }
  }
  return toTexture(c);
}

// tsutsuji in flower: funnel blooms in trusses over small dark leaves, painted in their own colours
function azaleaBloom(size = 512) {
  const [c, g] = canvas(size);
  const R = rng(83);
  const S = size / 512;
  for (let i = 0; i < 420; i++) {
    const rr = Math.pow(R.next(), 0.55) * 225 * S, a = R.next() * 6.283;
    const v = R.range(0.7, 1.15);
    g.fillStyle = `rgb(${(56 * v) | 0},${(92 * v) | 0},${(34 * v) | 0})`;
    g.save();
    g.translate(256 * S + Math.cos(a) * rr, 256 * S + Math.sin(a) * rr);
    g.rotate(R.range(-3.1, 3.1));
    leafShape(g, R.range(15, 22) * S, R.range(6, 8) * S);
    g.restore();
  }
  const bloom = (x, y, r, lift, rot) => {
    for (let p = 0; p < 5; p++) {
      const pa = rot + (p / 5) * Math.PI * 2;
      g.save();
      g.translate(x + Math.cos(pa) * r * 0.42, y + Math.sin(pa) * r * 0.42);
      g.rotate(pa + Math.PI / 2);
      const grd = g.createLinearGradient(0, r * 0.35, 0, -r * 0.55);
      grd.addColorStop(0, `rgb(${(176 * lift) | 0},${(22 * lift) | 0},${(92 * lift) | 0})`);
      grd.addColorStop(1, `rgb(${(232 * lift) | 0},${(70 * lift) | 0},${(146 * lift) | 0})`);
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(0, 0, r * 0.47, r * 0.6, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    // the speckled upper lobe and the throat
    g.fillStyle = `rgba(110,10,52,${0.75 * lift})`;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.arc(x + Math.cos(rot - 1.4) * r * (0.25 + k * 0.08), y + Math.sin(rot - 1.4) * r * (0.25 + k * 0.08), r * 0.05, 0, 6.283);
      g.fill();
    }
    g.fillStyle = `rgb(${(120 * lift) | 0},${(12 * lift) | 0},${(60 * lift) | 0})`;
    g.beginPath();
    g.arc(x, y, r * 0.17, 0, 6.283);
    g.fill();
  };
  const trusses = [];
  for (let i = 0; i < 34; i++) {
    const rr = Math.pow(R.next(), 0.6) * 190 * S, a = R.next() * 6.283;
    trusses.push([256 * S + Math.cos(a) * rr, 256 * S + Math.sin(a) * rr, R.next()]);
  }
  trusses.sort((p, q) => p[2] - q[2]);
  for (const [cx, cy, depth] of trusses) {
    const n = R.int(3, 5);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.283 + R.range(-0.4, 0.4), d = R.range(9, 16) * S;
      bloom(cx + Math.cos(a) * d, cy + Math.sin(a) * d, R.range(14, 19) * S, 0.8 + 0.2 * depth, R.next() * 6.283);
    }
  }
  return toTexture(c);
}

export function createFoliageTextures() {
  return {
    blossom: blossomPuff(512),
    leaves: broadleaf(512, 21),
    maple: maple(512),
    needles: needles(512, 44),
    pine: needles(512, 77),
    bamboo: bambooLeaves(512),
    florets: florets(128),
    azalea: azaleaBloom(512),
    azaleaLeaves: broadleaf(512, 61, [15, 22], 1.7),
  };
}

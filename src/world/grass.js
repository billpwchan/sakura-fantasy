// Ground cover along the banks: meadow grass clumps, reeds standing in the shallows, seasonal flowers
// (nanohana in spring, higanbana in autumn), susuki pampas that plumes silver in autumn.
// Placement is pure (runs in the generation workers); drawing is one instanced mesh per 60 m chunk and kind.
import * as THREE from 'three';
import { patch, WIND_GLSL } from '../core/shared.js';
import { rng } from '../lib/math.js';
import { LAYER_NOREFL } from '../core/pipeline.js';

import { KINDS } from './place-grass.js';

export const GRASS_CHUNK = 60;

// --------------------------------------------------------------- geometry

function clumpGeo(kind) {
  const R = rng(kind === 'meadow' ? 3 : kind === 'reed' ? 4 : kind === 'flower' ? 5 : 6);
  const pos = [], nrm = [], blade = [], idx = [], uvs = [];
  const addBlade = (bx, bz, h, w, lean, ang, segs, head = 0) => {
    const base = pos.length / 3;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const br = R.next(); // one random per blade, so colour varies blade to blade rather than along it
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const ww = w * (1 - t * 0.85);
      const bend = lean * t * t;
      const cx = bx + dx * bend, cz = bz + dz * bend, cy = h * t;
      // blade faces across its lean direction
      pos.push(cx - dz * ww, cy, cz + dx * ww, cx + dz * ww, cy, cz - dx * ww);
      nrm.push(dx, 0.5, dz, dx, 0.5, dz);
      uvs.push(0.5, 0.5, 0.5, 0.5);
      blade.push(t, br, -1, head, t, br, 1, head);
    }
    for (let s = 0; s < segs; s++) {
      const a = base + s * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  };
  const addHead = (hx, hy, hz, size, kindId) => {
    // two crossed quads, flagged so the shader colours them as flowers or plumes
    for (let q = 0; q < 2; q++) {
      const a = (q / 2) * Math.PI + R.next();
      const dx = Math.cos(a) * size, dz = Math.sin(a) * size;
      const base = pos.length / 3;
      const hh = kindId === 2 ? size * 2.6 : size;
      pos.push(hx - dx, hy - hh * 0.3, hz - dz, hx + dx, hy - hh * 0.3, hz + dz, hx + dx, hy + hh, hz + dz, hx - dx, hy + hh, hz - dz);
      for (let i = 0; i < 4; i++) nrm.push(0, 1, 0);
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      blade.push(1, R.next(), 0, kindId, 1, R.next(), 0, kindId, 1, R.next(), 0, kindId, 1, R.next(), 0, kindId);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  };
  if (kind === 'meadow') {
    // a tussock: thin blades fanning out from a tight crown, a few long ones arching over
    for (let i = 0; i < 24; i++) {
      const a = R.next() * 6.283, r = Math.pow(R.next(), 0.8) * 0.26;
      const tall = R.next() < 0.3;
      addBlade(Math.cos(a) * r, Math.sin(a) * r, tall ? R.range(0.6, 0.95) : R.range(0.22, 0.55), R.range(0.012, 0.02), R.range(0.08, 0.3) * (tall ? 1.5 : 1), a + R.range(-0.7, 0.7), 2);
    }
  } else if (kind === 'reed') {
    for (let i = 0; i < 7; i++) {
      const a = R.next() * 6.283, r = Math.sqrt(R.next()) * 0.35;
      addBlade(Math.cos(a) * r, Math.sin(a) * r, R.range(1.4, 2.2), R.range(0.016, 0.024), R.range(0.1, 0.35), R.next() * 6.283, 3);
    }
  } else if (kind === 'flower') {
    for (let i = 0; i < 6; i++) {
      const a = R.next() * 6.283, r = Math.sqrt(R.next()) * 0.22;
      const h = R.range(0.45, 0.8);
      addBlade(Math.cos(a) * r, Math.sin(a) * r, h, 0.012, 0.04, R.next() * 6.283, 2);
      addHead(Math.cos(a) * r, h, Math.sin(a) * r, R.range(0.06, 0.09), 1);
    }
    for (let i = 0; i < 6; i++) {
      const a = R.next() * 6.283, r = Math.sqrt(R.next()) * 0.3;
      addBlade(Math.cos(a) * r, Math.sin(a) * r, R.range(0.25, 0.45), R.range(0.025, 0.035), R.range(0.05, 0.15), R.next() * 6.283, 2);
    }
  } else {
    for (let i = 0; i < 12; i++) {
      const a = R.next() * 6.283, r = Math.sqrt(R.next()) * 0.35;
      const lean = R.range(0.2, 0.55), ang = R.next() * 6.283, h = R.range(1.0, 1.6);
      addBlade(Math.cos(a) * r, Math.sin(a) * r, h, R.range(0.014, 0.022), lean, ang, 3);
      if (i < 6) addHead(Math.cos(a) * r + Math.cos(ang) * lean, h, Math.sin(a) * r + Math.sin(ang) * lean, 0.07, 2);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(blade, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

// photographed ground flora (ground_flora atlas): grass tufts and wildflowers rendered from CC0 scans, one group per
// cell; [x, y, w, h] in px of the 2048 atlas (y from the top) and the cell's size in metres. Mirrors build_ground.py.
const ATLAS = 2048;
const CELLS = [
  ...Array.from({ length: 8 }, (_, i) => [(i % 4) * 512, Math.floor(i / 4) * 256, 512, 256, 0.6, 0.3]),
  ...Array.from({ length: 4 }, (_, i) => [i * 512, 512, 512, 512, 0.6, 0.6]),
  ...Array.from({ length: 8 }, (_, i) => [(i % 4) * 512, 1024 + Math.floor(i / 4) * 512, 512, 512, 0.6, 0.6]),
  // 20-27 in the tall atlas: reed stands (20, 21 in plume, 22, 23 before), susuki clumps (24, 25 in plume, 26, 27 before)
  ...Array.from({ length: 8 }, (_, i) => [(i % 4) * 512, Math.floor(i / 4) * 1024, 512, 1024, 0.9, 1.8]),
];
// the renders start 2 cm below the ground line
const CELL_SINK = 0.02;

// a clump of crossed cards; aCard = (u, v, slot, angle). The vertex shader sizes each card to the cell it draws.
function cardGeo(n) {
  const pos = [], idx = [], card = [];
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI + (k % 2) * 0.2;
    const base = pos.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(0, v, 0);
      card.push(u, v, k, ang);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('aCard', new THREE.Float32BufferAttribute(card, 4));
  g.setIndex(idx);
  return g;
}

// --------------------------------------------------------------- material

const GRASS_HEAD = /* glsl */ `
  attribute vec4 aBlade;
  attribute vec4 iA; // x, y, z, rotation
  attribute vec4 iB; // scale, seed, -, -
  varying vec4 vBlade; varying float vGSeed; varying float vFade; varying float vGust;
  uniform float uFar;
  ${WIND_GLSL}
`;

function grassMaterial(kind, florets) {
  const hasHead = kind === 'flower' || kind === 'susuki';
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, map: hasHead ? florets : null, alphaTest: hasHead ? 0.5 : 0, alphaToCoverage: hasHead });
  const far = { meadow: 95, reed: 140, flower: 110, susuki: 150 }[kind];
  const uniforms = { uFar: { value: far } };
  const stiff = { meadow: 1.1, reed: 0.5, flower: 0.9, susuki: 0.8 }[kind];
  patch(m, {
    key: 'grass-' + kind,
    snow: 0.85,
    wet: 0.3,
    wrap: 0.6,
    uniforms,
    vertexHead: GRASS_HEAD,
    fragHead: /* glsl */ `varying vec4 vBlade; varying float vGSeed; varying float vFade; varying float vGust;`,
    hooks: {
      beginNormal: /* glsl */ `
        {
          float c = cos(iA.w), s = sin(iA.w);
          vec3 bn = vec3(c * normal.x - s * normal.z, normal.y, s * normal.x + c * normal.z);
          objectNormal = normalize(mix(vec3(0.0, 1.0, 0.0), bn, 0.45));
        }`,
      vertex: /* glsl */ `
        {
          float dist = distance(iA.xyz, cameraPosition);
          // thin out with distance: far clumps shrink away instead of popping
          float keep = smoothstep(uFar, uFar * 0.55, dist) * step(iB.y, smoothstep(uFar * 1.05, uFar * 0.25, dist) + 0.15);
          float season = 1.0;
          ${kind === 'meadow' ? 'season = 1.0 - uSeason.w * 0.45;' : ''}
          ${kind === 'flower' ? 'season = max(uSeason.x, uSeason.z) * 1.0 + uSeason.y * 0.6;' : ''}
          ${kind === 'susuki' ? 'season = 0.75 + uSeason.z * 0.25 - uSeason.w * 0.25;' : ''}
          float h = iB.x * keep * season;
          float isHead = step(0.5, aBlade.w);
          ${kind === 'susuki' ? 'h *= mix(1.0, smoothstep(0.2, 1.0, uSeason.z + uSeason.w * 0.6), isHead);' : ''}
          vec3 p = position * vec3(iB.x, h, iB.x);
          float c = cos(iA.w), s = sin(iA.w);
          p = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
          // wind: bend grows with height along the blade
          vec3 off = sfWindOffset(iA.xyz + p * 0.3, max(p.y, 0.0) * 3.0, ${stiff.toFixed(2)}) * 0.32;
          off += vec3(sin(uTime * 3.7 + iB.y * 40.0 + iA.x), 0.0, cos(uTime * 3.1 + iB.y * 31.0 + iA.z)) * 0.02 * aBlade.x * (0.5 + uWind.z);
          transformed = iA.xyz + p + off * aBlade.x;
          vBlade = aBlade;
          vGust = sfGust(iA.xz) * uWind.z;
          vGSeed = iB.y;
          vFade = keep;
        }`,
      map: /* glsl */ `
        {
          float t = vBlade.x;
          float r = fract(vBlade.y * 7.3 + vGSeed * 3.1);
          float sp = uSeason.x, su = uSeason.y, au = uSeason.z, wi = uSeason.w;
          ${kind === 'reed'
            ? `vec3 tip = mix(vec3(0.16, 0.24, 0.07), vec3(0.32, 0.27, 0.12), au + wi * 0.8);
               vec3 root = vec3(0.04, 0.06, 0.02);`
            : kind === 'meadow'
            ? `// dark crown, a body that varies blade to blade from blue-green to yellow-green, sun-bleached tips,
               // and the odd dead straw blade
               vec3 mid = vec3(0.1, 0.19, 0.04) * sp + vec3(0.065, 0.14, 0.035) * su + mix(vec3(0.27, 0.2, 0.07), vec3(0.34, 0.12, 0.04), step(0.8, r)) * au + vec3(0.19, 0.16, 0.1) * wi;
               mid *= (0.7 + 0.55 * r) * mix(vec3(1.0, 1.0, 0.85), vec3(0.85, 1.0, 1.2), fract(r * 5.7));
               vec3 tipC = mix(mid, vec3(0.38, 0.35, 0.11) * (sp + su) + vec3(0.42, 0.28, 0.1) * au + vec3(0.3, 0.27, 0.18) * wi, 0.45 + 0.35 * fract(r * 3.3));
               vec3 root = vec3(0.025, 0.035, 0.012);
               vec3 tip = mid;`
            : `vec3 tip = vec3(0.17, 0.3, 0.05) * sp + vec3(0.09, 0.2, 0.035) * su + mix(vec3(0.34, 0.24, 0.07), vec3(0.4, 0.13, 0.04), step(0.75, r)) * au + vec3(0.2, 0.17, 0.11) * wi;
               vec3 root = vec3(0.06, 0.075, 0.03) * (1.0 - au * 0.3) + vec3(0.07, 0.05, 0.025) * au;`}
          vec3 col = mix(root, tip * (0.8 + 0.4 * r), smoothstep(0.0, 0.7, t));
          ${kind === 'meadow'
            ? `col = mix(root, mid, smoothstep(0.0, 0.42, t));
               col = mix(col, tipC, smoothstep(0.5, 1.0, t));
               col = mix(col, vec3(0.34, 0.29, 0.16) * (0.75 + 0.5 * r) * mix(0.5, 1.0, t), step(0.9, fract(r * 13.1)) * (1.0 - wi));`
            : ''}
          ${kind === 'flower'
            ? `// nanohana yellow in spring, white daisies in summer, higanbana red in autumn
               vec3 fl = vec3(0.85, 0.62, 0.04) * sp + vec3(0.7, 0.68, 0.62) * su + vec3(0.62, 0.035, 0.02) * au + vec3(0.3, 0.25, 0.2) * wi;
               col = mix(col, fl * (0.55 + 0.6 * diffuseColor.r), step(0.5, vBlade.w));
               diffuseColor.a = mix(1.0, diffuseColor.a, step(0.5, vBlade.w));`
            : ''}
          ${kind === 'susuki'
            ? `vec3 plume = mix(vec3(0.6, 0.52, 0.42), vec3(0.75, 0.7, 0.62), r);
               col = mix(col, plume * (0.6 + 0.5 * diffuseColor.r), step(1.5, vBlade.w));
               diffuseColor.a = mix(1.0, diffuseColor.a, step(1.5, vBlade.w));`
            : ''}
          // a passing gust lays the blades over and shows their paler, glossier side: the sheen that rolls across a field
          col *= 1.0 + vGust * smoothstep(0.2, 1.0, vBlade.x) * 0.55;
          diffuseColor.rgb = col;
        }`,
      normal: /* glsl */ `normal = normalize(vNormal);`,
      light: /* glsl */ `
        {
          vec3 Vv = normalize(cameraPosition - vSfWP);
          float back = pow(max(dot(-Vv, uSunDir), 0.0), 3.0);
          reflectedLight.directDiffuse += diffuseColor.rgb * uSunCol * back * vBlade.x * 0.5 * (0.2 + 0.8 * sfShadow);
        }`,
    },
  });
  m.userData.far = far * 1.05;
  return m;
}

const CARD_HEAD = /* glsl */ `
  attribute vec4 aCard;
  attribute vec4 iA; // x, y, z, rotation
  attribute vec4 iB; // scale, seed, -, -
  uniform vec4 uCellRect[${CELLS.length}];
  uniform vec2 uCellSize[${CELLS.length}];
  uniform float uFar;
  varying vec2 vCardUv; varying float vH; varying float vGSeed; varying float vFade; varying float vGust;
  varying vec3 vCT, vCN;
  ${WIND_GLSL}
`;

// which cell a card draws: meadow clumps are mostly low lawn with now and then a tall tussock; wildflowers follow the
// season (tanpopo, sumire, kinpouge and clover in spring, clover in summer, higanbana in autumn, none in winter); reed
// and susuki come into plume from late summer and keep their dry plumes through the winter
const PICK_GLSL = (kind) => /* glsl */ `
  int sfCell(float seed, float slot) {
    float r = fract(sin(seed * 91.7 + slot * 17.3) * 43758.5453);
    ${kind === 'meadow'
      ? `if (slot < 0.5 && fract(seed * 7.31) > 0.78) return 8 + int(r * 3.999);
         return int(r * 7.999);`
      : kind === 'reed' || kind === 'susuki'
      ? `int base = ${kind === 'reed' ? 20 : 24};
         float plume = uSeason.z + uSeason.w + uSeason.y * 0.25;
         return base + (fract(seed * 13.7) < plume ? 0 : 2) + int(r * 1.999);`
      : `vec4 sw = uSeason;
         int i = int(r * 3.999);
         if (sw.z >= max(max(sw.x, sw.y), sw.w)) return 16 + (i & 1);
         if (sw.y >= max(sw.x, sw.w)) return i == 0 ? 15 : (i == 1 ? 19 : 14);
         return i == 0 ? 12 : (i == 1 ? 13 : (i == 2 ? 15 : 18));`}
  }
`;

function cardMaterial(kind, atlas, atlasN) {
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, map: atlas, alphaTest: 0.5, alphaToCoverage: true });
  const far = { meadow: 95, flower: 110, reed: 150, susuki: 150 }[kind];
  const uniforms = {
    uFar: { value: far },
    uCellRect: { value: CELLS.map(([x, y, w, h]) => new THREE.Vector4(x / ATLAS, 1 - (y + h) / ATLAS, w / ATLAS, h / ATLAS)) },
    uCellSize: { value: CELLS.map(([, , , , w, h]) => new THREE.Vector2(w, h)) },
    tFloraN: { value: atlasN },
  };
  const stiff = { meadow: 1.1, flower: 0.9, reed: 0.75, susuki: 0.6 }[kind];
  patch(m, {
    key: 'flora-' + kind,
    // the cards' normals point straight up, so full snow would whiten every tuft into a flat white star on the snow:
    // dead grass shows its straw through a dusting, mostly sunk into the cover
    snow: { meadow: 0.22, flower: 0.5, reed: 0.3, susuki: 0.3 }[kind],
    wet: 0.3,
    wrap: 0.6,
    uniforms,
    vertexHead: CARD_HEAD + PICK_GLSL(kind),
    fragHead: /* glsl */ `varying vec2 vCardUv; varying float vH; varying float vGSeed; varying float vFade; varying float vGust;
      varying vec3 vCT, vCN; uniform sampler2D tFloraN;`,
    hooks: {
      beginNormal: /* glsl */ `objectNormal = vec3(0.0, 1.0, 0.0);`,
      vertex: /* glsl */ `
        {
          float dist = distance(iA.xyz, cameraPosition);
          // thin out with distance: far clumps shrink away instead of popping
          float keep = smoothstep(uFar, uFar * 0.55, dist) * step(iB.y, smoothstep(uFar * 1.05, uFar * 0.25, dist) + 0.15);
          float season = 1.0;
          ${kind === 'meadow' ? 'season = 1.0 - uSeason.w * 0.62;' : kind === 'flower' ? 'season = 1.0 - uSeason.w;' : 'season = 1.0 - uSeason.x * 0.3;'}
          int cell = sfCell(iB.y, aCard.z);
          vec4 rect = uCellRect[cell];
          vec2 sz = uCellSize[cell] * iB.x;
          float ang = iA.w + aCard.w;
          vec3 T = vec3(cos(ang), 0.0, sin(ang));
          // the cards of a clump stand a little apart, so they don't all cross at one stalk
          float sl = aCard.z;
          vec3 off = vec3(cos(sl * 2.4 + iB.y * 6.0), 0.0, sin(sl * 2.4 + iB.y * 6.0)) * 0.09 * iB.x * step(0.5, sl);
          float h = (aCard.y * sz.y - ${CELL_SINK.toFixed(3)} * iB.x) * keep * season;
          vec3 p = T * (aCard.x - 0.5) * sz.x * keep + vec3(0.0, h, 0.0) + off;
          vec3 off2 = sfWindOffset(iA.xyz + p * 0.3, max(p.y, 0.0) * 3.0, ${stiff.toFixed(2)}) * 0.32;
          off2 += vec3(sin(uTime * 3.7 + iB.y * 40.0 + iA.x), 0.0, cos(uTime * 3.1 + iB.y * 31.0 + iA.z)) * 0.015 * (0.5 + uWind.z);
          transformed = iA.xyz + p + off2 * aCard.y * aCard.y;
          vCardUv = rect.xy + aCard.xy * rect.zw;
          vH = aCard.y;
          vCT = normalize((viewMatrix * vec4(T, 0.0)).xyz);
          vCN = normalize((viewMatrix * vec4(-T.z, 0.0, T.x, 0.0)).xyz);
          vGust = sfGust(iA.xz) * uWind.z;
          vGSeed = iB.y;
          vFade = keep;
        }`,
      map: /* glsl */ `
        {
          vec4 tx = texture2D(map, vCardUv);
          vec3 col = tx.rgb;
          float sp = uSeason.x, su = uSeason.y, au = uSeason.z, wi = uSeason.w;
          float lum = dot(col, vec3(0.3, 0.55, 0.15));
          float r = fract(vGSeed * 7.3);
          ${kind === 'meadow'
            ? `// spring grass is fresh and yellow-green, summer's deeper; autumn bleaches it to straw, winter to dead tan
               col *= mix(vec3(0.94, 1.07, 0.78), vec3(0.84, 0.97, 0.8), su) * (0.74 + 0.2 * r);
               col = mix(col, lum * vec3(1.35, 1.05, 0.55), au * (0.55 + 0.3 * r));
               col = mix(col, lum * vec3(1.15, 1.0, 0.8), wi * 0.85);`
            : kind === 'flower'
            ? `col *= 0.92 + 0.16 * r;`
            : `// the green goes to straw through autumn and to pale, dead tan in winter; the plumes keep their colour
               float green = smoothstep(-0.01, 0.05, tx.g - tx.r);
               col *= mix(vec3(1.0, 1.04, 0.9), vec3(0.9, 1.0, 0.88), su) * (0.88 + 0.2 * r);
               col = mix(col, lum * vec3(1.42, 1.12, 0.62), au * (0.5 + 0.35 * r) * green);
               col = mix(col, lum * vec3(1.45, 1.3, 1.02), wi * 0.9 * green);`}
          // a passing gust lays the blades over and shows their paler side: the sheen that rolls across a field
          col *= 1.0 + vGust * smoothstep(0.2, 1.0, vH) * 0.45;
          diffuseColor.rgb = col;
          // keep thin blades from dissolving in the mip chain
          vec2 du = dFdx(vCardUv * 2048.0), dv = dFdy(vCardUv * 2048.0);
          float lod = 0.5 * log2(max(dot(du, du), dot(dv, dv)));
          float a = tx.a * (1.0 + max(lod, 0.0) * 0.3);
          // a card seen edge-on is a hairline: let it go before it gets there
          vec3 vd = normalize(vViewPosition);
          a *= smoothstep(0.08, 0.35, abs(dot(vCN, vd)));
          diffuseColor.a = a;
        }`,
      normal: /* glsl */ `
        {
          // grass is lit mostly as the ground it covers, with each blade's own turn from the atlas
          vec3 tn = texture2D(tFloraN, vCardUv).xyz * 2.0 - 1.0;
          float fs = gl_FrontFacing ? 1.0 : -1.0;
          vec3 up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          vec3 bn = normalize(vCT * tn.x * fs + up * tn.y + vCN * tn.z * fs);
          normal = normalize(mix(up, bn, ${kind === 'meadow' ? '0.55' : kind === 'flower' ? '0.75' : '0.85'}));
        }`,
      light: /* glsl */ `
        {
          vec3 Vv = normalize(cameraPosition - vSfWP);
          float back = pow(max(dot(-Vv, uSunDir), 0.0), 3.0);
          reflectedLight.directDiffuse += diffuseColor.rgb * uSunCol * back * vH * 0.5 * (0.2 + 0.8 * sfShadow);
        }`,
    },
  });
  m.userData.far = far * 1.05;
  return m;
}

// --------------------------------------------------------------- meshes

export function createGrass(packs, ftex) {
  const group = new THREE.Group();
  group.name = 'grass';
  const stats = {};
  for (const kind of KINDS) {
    const data = packs[kind];
    const n = data.length / 8;
    stats[kind] = n;
    if (!n) continue;
    const tall = kind === 'reed' || kind === 'susuki';
    const isCard = tall ? !!ftex.tall : !!ftex.flora;
    const base = isCard ? cardGeo(kind === 'meadow' ? 3 : 2) : clumpGeo(kind);
    const mat = isCard ? (tall ? cardMaterial(kind, ftex.tall, ftex.tallN) : cardMaterial(kind, ftex.flora, ftex.floraN)) : grassMaterial(kind, ftex.florets);
    // bucket by chunk along z so culling works per 60 m
    const buckets = new Map();
    for (let i = 0; i < n; i++) {
      const z = data[i * 8 + 2];
      const key = Math.floor((800 - z) / GRASS_CHUNK);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(i);
    }
    for (const [, ids] of buckets) {
      const g = new THREE.InstancedBufferGeometry();
      g.index = base.index;
      for (const k of ['position', 'normal', 'aBlade', 'uv', 'aCard']) if (base.getAttribute(k)) g.setAttribute(k, base.getAttribute(k));
      const A = new Float32Array(ids.length * 4), B = new Float32Array(ids.length * 4);
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
      ids.forEach((id, j) => {
        const o = id * 8;
        A[j * 4] = data[o]; A[j * 4 + 1] = data[o + 1]; A[j * 4 + 2] = data[o + 2]; A[j * 4 + 3] = data[o + 3];
        B[j * 4] = data[o + 4]; B[j * 4 + 1] = data[o + 5];
        minX = Math.min(minX, data[o]); maxX = Math.max(maxX, data[o]);
        minY = Math.min(minY, data[o + 1]); maxY = Math.max(maxY, data[o + 1]);
        minZ = Math.min(minZ, data[o + 2]); maxZ = Math.max(maxZ, data[o + 2]);
      });
      g.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 4));
      g.setAttribute('iB', new THREE.InstancedBufferAttribute(B, 4));
      g.instanceCount = ids.length;
      g.boundingBox = new THREE.Box3(new THREE.Vector3(minX - 2, minY - 1, minZ - 2), new THREE.Vector3(maxX + 2, maxY + 4, maxZ + 2));
      g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = true;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.layers.set(LAYER_NOREFL);
      mesh.userData.far = mat.userData.far;
      group.add(mesh);
    }
  }
  group.userData.stats = stats;
  // the shader has already shrunk every blade to nothing past its kind's far distance; whole chunks out there are skipped
  group.userData.update = (camera) => {
    for (const m of group.children) m.visible = m.geometry.boundingBox.distanceToPoint(camera.position) < m.userData.far;
  };
  return group;
}

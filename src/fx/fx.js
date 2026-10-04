// Everything that drifts, falls or glows: petals and maple leaves, snow, rain, fireflies, and after dark the
// spirit layer: foxfire wisps, lanterns set floating on the lake, sky lanterns rising from the sacred island,
// and summer fireworks. All motion runs in the vertex shaders; the CPU only sets a few weights per frame.
import * as THREE from 'three';
import { U, UNIFORMS_GLSL, NOISE, ATMOS } from '../core/shared.js';
import { LAYER_FX, LAYER_FXREFL } from '../core/pipeline.js';
import { riverAt, terrainHeight, waterSd, ISLAND, LAKE } from '../world/layout.js';
import { SITES } from '../world/sites.js';
import { rng, smoothstep, clamp } from '../lib/math.js';

const HEAD = /* glsl */ `
  precision highp float;
  ${UNIFORMS_GLSL}
  ${NOISE}
  ${ATMOS}
  float sfTrans(vec3 wp){ vec3 v = wp - cameraPosition; float d = length(v); return exp(-sfOptical(cameraPosition, v / max(d, 1e-4), d)); }
`;

function quadGeo(count, attrs) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  for (const [name, size, fn] of attrs) {
    const a = new Float32Array(count * size);
    for (let i = 0; i < count; i++) fn(a, i * size, i);
    g.setAttribute(name, new THREE.InstancedBufferAttribute(a, size));
  }
  g.instanceCount = count;
  return g;
}

// refl: it glows, so the river shows it: drawn again in the mirror pass, where the water's ripples break it up
function fxMesh(geo, mat, name, refl = false) {
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.layers.set(LAYER_FX);
  if (refl) m.layers.enable(LAYER_FXREFL);
  m.name = name;
  m.renderOrder = 10;
  return m;
}

// ------------------------------------------------------------------ falling things around the camera

function fallers() {
  const N = 7000;
  const R = rng(5);
  const geo = quadGeo(N, [['aSeed', 4, (a, o) => { a[o] = R.next(); a[o + 1] = R.next(); a[o + 2] = R.next(); a[o + 3] = R.next(); }]]);
  const uniforms = {
    ...U,
    uCam: { value: new THREE.Vector3() },
    uPetal: { value: 0 }, uLeaf: { value: 0 }, uSnowFall: { value: 0 }, uRainFall: { value: 0 }, uGlow: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${HEAD}
      attribute vec4 aSeed;
      uniform vec3 uCam; uniform float uPetal, uLeaf, uSnowFall, uRainFall;
      varying vec2 vUv; varying vec3 vWP; varying float vKind, vAlpha, vShade; varying vec3 vN;
      mat3 rotAxis(vec3 a, float t){ float c = cos(t), s = sin(t), C = 1.0 - c;
        return mat3(c + a.x*a.x*C, a.y*a.x*C + a.z*s, a.z*a.x*C - a.y*s, a.x*a.y*C - a.z*s, c + a.y*a.y*C, a.z*a.y*C + a.x*s, a.x*a.z*C + a.y*s, a.y*a.z*C - a.x*s, c + a.z*a.z*C); }
      void main(){
        float id = float(gl_InstanceID) / 7000.0;
        // budget split by kind: petals/leaves 0..0.3, snow 0.3..0.62, rain 0.62..1
        float kind = id < 0.3 ? (uPetal >= uLeaf ? 0.0 : 1.0) : id < 0.62 ? 2.0 : 3.0;
        float k = kind < 1.5 ? max(uPetal, uLeaf) : kind < 2.5 ? uSnowFall : uRainFall;
        float slot = kind < 1.5 ? id / 0.3 : kind < 2.5 ? (id - 0.3) / 0.32 : (id - 0.62) / 0.38;
        vKind = kind;
        if (slot > k) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec3 box = kind < 1.5 ? vec3(70.0, 26.0, 70.0) : kind < 2.5 ? vec3(60.0, 30.0, 60.0) : vec3(40.0, 22.0, 40.0);
        vec3 wind = vec3(uWind.x, 0.0, uWind.y) * (0.4 + uWind.z * 2.4);
        float fall = kind < 1.5 ? 0.75 + aSeed.w * 0.5 : kind < 2.5 ? 1.0 + aSeed.w * 0.6 : 9.0 + aSeed.w * 3.0;
        vec3 vel = wind * (kind > 2.5 ? 0.35 : 1.0) + vec3(0.0, -fall, 0.0);
        vec3 p = aSeed.xyz * box + vel * uTime;
        // flutter
        if (kind < 2.5) p += vec3(sin(uTime * 1.3 + aSeed.x * 40.0), sin(uTime * 0.9 + aSeed.y * 30.0) * 0.4, cos(uTime * 1.1 + aSeed.z * 50.0)) * (kind < 1.5 ? 0.9 : 0.35);
        vec3 c0 = uCam + vec3(0.0, box.y * 0.3, 0.0);
        p = mod(p - c0 + box * 0.5, box) - box * 0.5 + c0;
        vec3 rel = (p - c0) / (box * 0.5);
        float edge = 1.0 - smoothstep(0.75, 1.0, max(abs(rel.x), max(abs(rel.y), abs(rel.z))));
        // nothing may brush the lens: very near flakes and petals would fill the frame as flat blobs
        vAlpha = edge * smoothstep(0.6, 1.8, distance(p, cameraPosition));
        vec3 corner = position;
        vec3 wp;
        if (kind < 1.5) {
          // tumbling petal or leaf
          vec3 axis = normalize(aSeed.zxy - 0.5 + 0.001);
          mat3 r = rotAxis(axis, uTime * (1.2 + aSeed.w * 2.0) + aSeed.x * 20.0);
          float s = kind < 0.5 ? 0.075 : 0.13;
          wp = p + r * vec3(corner.x * s, corner.y * s * (kind < 0.5 ? 0.8 : 1.0), 0.0);
          vN = r * vec3(0.0, 0.0, 1.0);
        } else if (kind < 2.5) {
          // snowflake: a small camera-facing sprite
          vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float s = 0.045 + aSeed.w * 0.05;
          wp = p + (cr * corner.x + cu * corner.y) * s;
          vN = vec3(0.0, 1.0, 0.0);
        } else {
          // rain: a thin streak along its fall, turned to face the camera
          vec3 v = normalize(vel);
          vec3 side = normalize(cross(v, normalize(p - cameraPosition)));
          // about what a 1/50 s exposure would smear a falling drop into, not a ruled line
          wp = p + v * corner.y * (0.3 + aSeed.w * 0.2) + side * corner.x * 0.013;
          vN = vec3(0.0, 1.0, 0.0);
        }
        vUv = corner.xy + 0.5;
        vWP = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${HEAD}
      uniform float uGlow;
      varying vec2 vUv; varying vec3 vWP; varying float vKind, vAlpha; varying vec3 vN;
      void main(){
        vec2 q = vUv * 2.0 - 1.0;
        vec3 col; float a;
        vec3 lit = uAmbUp * 1.1 + uSunCol * 0.22 * (0.45 + 0.55 * abs(dot(normalize(vN), uSunDir)));
        if (vKind < 0.5) {
          // a sakura petal: an oval with a notch at the tip
          float d = length(q * vec2(1.25, 1.0));
          float notch = smoothstep(0.18, 0.0, length(q - vec2(0.0, 0.95)));
          a = smoothstep(1.0, 0.85, d) * (1.0 - notch);
          col = mix(vec3(1.0, 0.78, 0.82), vec3(0.95, 0.55, 0.65), smoothstep(0.2, -0.9, q.y)) * lit;
          // shed by the sacred tree at night, they carry its glow
          col = mix(col, vec3(1.0, 0.5, 0.72) * (0.55 + 0.45 * smoothstep(-0.9, 0.6, q.y)), uGlow);
        } else if (vKind < 1.5) {
          // a maple leaf: five lobes in polar form
          float ang = atan(q.x, q.y);
          float r = length(q);
          float lobes = 0.62 + 0.3 * pow(abs(cos(ang * 2.5)), 0.6);
          a = smoothstep(lobes, lobes - 0.08, r);
          col = mix(vec3(0.7, 0.07, 0.02), vec3(0.85, 0.42, 0.04), step(0.6, fract(vWP.x * 3.1 + vWP.z * 1.7))) * lit * 0.9;
        } else if (vKind < 2.5) {
          float d = length(q);
          a = smoothstep(1.0, 0.2, d) * 0.9;
          col = vec3(0.92, 0.95, 1.0) * (uAmbUp * 1.5 + uSunCol * 0.12 + 0.03);
        } else {
          // brighter at the head, thinning into the trail; the nearest drops are only a blur
          a = smoothstep(1.0, 0.0, abs(q.x)) * smoothstep(1.0, 0.5, abs(q.y)) * mix(0.35, 1.0, smoothstep(-1.0, 0.8, -q.y)) * 0.36;
          a *= smoothstep(1.2, 4.0, distance(vWP, cameraPosition));
          col = (uAmbUp * 1.4 + uSunCol * 0.04 + uFlash * 1.5 + 0.015);
        }
        a *= vAlpha;
        if (a < 0.02) discard;
        col = sfAtmos(col, vWP);
        gl_FragColor = vec4(col, a);
      }`,
  });
  return { mesh: fxMesh(geo, mat, 'fallers'), uniforms };
}

// ------------------------------------------------------------------ glowing things at fixed places

function glowMat(uniforms, vertexBody, colourExpr, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, ...uniforms },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${HEAD}
      attribute vec4 aA; attribute vec4 aB;
      varying vec2 vUv; varying vec3 vWP; varying float vI; varying vec4 vB;
      ${opts.vertexHead || ''}
      void main(){
        vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 p; float size; float I; float sy = 1.0; vec3 fogP = vec3(1e9);
        ${vertexBody}
        vI = I; vB = aB;
        if (I < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec3 wp = p + (cr * position.x + cu * position.y * sy) * size;
        vUv = position.xy + 0.5;
        vWP = fogP.x > 1e8 ? p : fogP;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${HEAD}
      varying vec2 vUv; varying vec3 vWP; varying float vI; varying vec4 vB;
      void main(){
        vec2 q = vUv * 2.0 - 1.0;
        vec3 col;
        ${colourExpr}
        gl_FragColor = vec4(col * vI * sfTrans(vWP), 1.0);
      }`,
  });
}

function anchorsAlongRiver(R, n, zFrom, zTo, near, far) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 40) {
    const z = R.range(zTo, zFrom);
    const r = riverAt(z);
    const side = R.next() < 0.5 ? -1 : 1;
    const x = r.x + side * (r.w + R.range(-near, far));
    if (waterSd(x, z) < -3) continue;
    out.push([x, Math.max(terrainHeight(x, z), 0), z]);
  }
  return out;
}

function fireflies() {
  const R = rng(77);
  const pts = anchorsAlongRiver(R, 5200, 0, -2100, 1, 22);
  const geo = quadGeo(pts.length, [
    ['aA', 4, (a, o, i) => { a[o] = pts[i][0]; a[o + 1] = pts[i][1] + R.range(0.3, 2.2); a[o + 2] = pts[i][2]; a[o + 3] = R.next(); }],
    ['aB', 4, (a, o) => { a[o] = R.next(); a[o + 1] = R.next(); a[o + 2] = 0; a[o + 3] = 0; }],
  ]);
  const uniforms = { uK: { value: 0 } };
  const body = /* glsl */ `
      float t = uTime * (0.25 + aA.w * 0.3);
      p = aA.xyz + vec3(sin(t + aB.x * 30.0) * 1.4, sin(t * 1.3 + aB.y * 20.0) * 0.6, cos(t * 0.8 + aA.w * 40.0) * 1.4);
      float blink = 0.12 + 0.88 * pow(max(sin(uTime * (1.2 + aB.x) + aB.y * 60.0), 0.0), 4.0);
      float d = distance(p, cameraPosition);
      I = uK * blink * smoothstep(180.0, 50.0, d) * smoothstep(1.5, 4.0, d) * step(aB.x, uK * 1.2);
      size = 0.55;
  `;
  const colour = /* glsl */ `
        float r = length(q);
        col = vec3(0.65, 1.0, 0.32) * (exp(-r * r * 60.0) * 6.0 + exp(-r * r * 6.0) * 0.5);
  `;
  const head = { vertexHead: 'uniform float uK;' };
  const mat = glowMat(uniforms, body, colour, head);
  return { mesh: fxMesh(geo, mat, 'fireflies', true), uniforms: mat.uniforms };
}

function wisps() {
  const R = rng(91);
  const pts = [];
  // along the gate tunnel, around the lake shore and the island
  for (const p of anchorsAlongRiver(R, 70, SITES.torii.z0 + 40, SITES.torii.z1 - 40, 6, 4)) pts.push(p);
  for (let i = 0; i < 90; i++) {
    const a = R.next() * Math.PI * 2, r = LAKE.r * R.range(0.55, 1.02);
    pts.push([LAKE.x + Math.cos(a) * r, 0.0, LAKE.z + Math.sin(a) * r]);
  }
  for (let i = 0; i < 50; i++) {
    const a = R.next() * Math.PI * 2, r = ISLAND.r * R.range(0.6, 1.4);
    const x = ISLAND.x + Math.cos(a) * r, z = ISLAND.z + Math.sin(a) * r;
    pts.push([x, Math.max(terrainHeight(x, z), 0), z]);
  }
  const geo = quadGeo(pts.length, [
    ['aA', 4, (a, o, i) => { a[o] = pts[i][0]; a[o + 1] = pts[i][1] + R.range(0.8, 3.5); a[o + 2] = pts[i][2]; a[o + 3] = R.next(); }],
    ['aB', 4, (a, o) => { a[o] = R.next(); a[o + 1] = R.next(); a[o + 2] = R.next(); a[o + 3] = 0; }],
  ]);
  const mat = glowMat({}, /* glsl */ `
      float t = uTime * (0.12 + aA.w * 0.12);
      p = aA.xyz + vec3(sin(t + aB.x * 30.0) * 4.0, sin(t * 2.1 + aB.y * 20.0) * 0.8, cos(t * 0.7 + aA.w * 40.0) * 4.0);
      float pulse = 0.55 + 0.45 * sin(uTime * (0.8 + aB.z) + aB.x * 50.0);
      float d = distance(p, cameraPosition);
      I = uSpirit * pulse * smoothstep(260.0, 60.0, d) * smoothstep(5.0, 16.0, d);
      size = 1.3 + aB.z * 0.8;
  `, /* glsl */ `
        float r = length(q);
        // a pale flame: tight core, cool halo, a faint upward lick
        float core = exp(-r * r * 40.0);
        float halo = exp(-r * r * 4.5);
        float lick = exp(-q.x * q.x * 30.0) * smoothstep(0.0, 0.8, q.y) * smoothstep(1.0, 0.3, q.y);
        col = vec3(1.0, 0.95, 0.9) * core * 4.0 + vec3(0.35, 0.65, 1.0) * (halo * 0.55 + lick * 0.6);
        col *= mix(vec3(1.0), vec3(0.75, 1.0, 0.9), vB.y);
  `);
  return { mesh: fxMesh(geo, mat, 'wisps', true) };
}

function floatingLanterns() {
  // toro nagashi: lanterns set on the lake, carried round the island by a slow current
  const N = 150;
  const R = rng(33);
  const geo = quadGeo(N, [
    ['aA', 4, (a, o, i) => { const RR = rng(1000 + i); a[o] = RR.range(46, 150); a[o + 1] = RR.next() * Math.PI * 2; a[o + 2] = RR.next(); a[o + 3] = 0; }],
    ['aB', 4, (a, o) => { a[o] = R.next(); a[o + 1] = R.next(); a[o + 2] = 0; a[o + 3] = 0; }],
  ]);
  const mat = glowMat({}, /* glsl */ `
      float r = aA.x;
      float ang = aA.y + uTime * (1.4 / r) * (0.7 + aA.z * 0.6);
      vec3 c = vec3(${ISLAND.x.toFixed(1)}, 0.0, ${ISLAND.z.toFixed(1)});
      p = c + vec3(cos(ang) * r, 0.0, sin(ang) * r);
      p.y = 0.22 + sin(uTime * 1.3 + aA.z * 20.0) * 0.03;
      float d = distance(p, cameraPosition);
      I = uSpirit * smoothstep(0.45, 0.8, uSpirit) * smoothstep(420.0, 80.0, d);
      size = 0.5;
  `, /* glsl */ `
        // the paper box glowing from within, brighter at the base
        vec2 a = abs(q);
        float box = smoothstep(0.62, 0.55, a.x) * smoothstep(0.75, 0.68, a.y);
        float glow = exp(-dot(q, q) * 2.2);
        col = vec3(1.0, 0.55, 0.2) * (box * (1.6 + 1.6 * smoothstep(0.7, -0.6, q.y)) + glow * 0.35);
  `);
  return { mesh: fxMesh(geo, mat, 'floating-lanterns', true) };
}

function skyLanterns() {
  const N = 220;
  const R = rng(44);
  const geo = quadGeo(N, [
    ['aA', 4, (a, o) => { const ang = R.next() * Math.PI * 2, rr = R.range(0, 26); a[o] = ISLAND.x + Math.cos(ang) * rr; a[o + 1] = R.next(); a[o + 2] = ISLAND.z + Math.sin(ang) * rr; a[o + 3] = R.next(); }],
    ['aB', 4, (a, o) => { a[o] = R.next(); a[o + 1] = R.next(); a[o + 2] = 0; a[o + 3] = 0; }],
  ]);
  const mat = glowMat({ uStart: { value: 0 } }, /* glsl */ `
      // each lantern rises on its own cycle once the spirit layer is full
      float T = 160.0;
      float age = mod(uTime - uStart + aA.y * T, T);
      float rise = age * (0.9 + aA.w * 0.6);
      p = vec3(aA.x, 4.0 + rise, aA.z) + vec3(uWind.x, 0.0, uWind.y) * age * 0.6 + vec3(sin(age * 0.4 + aB.x * 9.0), 0.0, cos(age * 0.3 + aB.y * 9.0)) * 1.5;
      float d = distance(p, cameraPosition);
      float on = smoothstep(0.7, 0.95, uSpirit);
      I = on * smoothstep(0.0, 6.0, age) * smoothstep(T, T * 0.6, age) * smoothstep(900.0, 200.0, d) * (0.85 + 0.15 * sin(uTime * 7.0 + aB.x * 40.0));
      size = 0.9;
  `, /* glsl */ `
        // a tall paper lantern: rounded shoulders, the flame glowing at its open base
        vec2 a = abs(q * vec2(1.25, 1.0));
        float body = smoothstep(0.66, 0.6, a.x + max(q.y - 0.55, 0.0) * 0.8) * smoothstep(0.9, 0.84, a.y);
        float fy = (q.y + 0.65) * 4.0;
        float flame = exp(-q.x * q.x * 9.0 - fy * fy);
        float halo = exp(-dot(q, q) * 1.6);
        col = vec3(1.0, 0.5, 0.17) * (body * (1.0 + 1.8 * smoothstep(0.8, -0.8, q.y)) + flame * 4.0 + halo * 0.4);
  `, { vertexHead: 'uniform float uStart;' });
  return { mesh: fxMesh(geo, mat, 'sky-lanterns', true), uniforms: mat.uniforms };
}

// ------------------------------------------------------------------ hanabi

const SLOTS = 6, PER = 420;

function fireworks() {
  const R = rng(8);
  const geo = quadGeo(SLOTS * PER, [
    ['aA', 4, (a, o, i) => {
      // a random direction on the sphere and a speed spread
      const u = R.range(-1, 1), t = R.next() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      a[o] = Math.cos(t) * s; a[o + 1] = u; a[o + 2] = Math.sin(t) * s; a[o + 3] = Math.floor(i / PER);
    }],
    ['aB', 4, (a, o) => { a[o] = R.next(); a[o + 1] = R.next(); a[o + 2] = R.next(); a[o + 3] = 0; }],
  ]);
  const uniforms = {
    ...U,
    uBurst: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4(0, -999, 0, -999)) },
    uBurstCol: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4(1, 0.5, 0.2, 0)) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${HEAD}
      attribute vec4 aA; attribute vec4 aB;
      uniform vec4 uBurst[${SLOTS}]; uniform vec4 uBurstCol[${SLOTS}];
      varying vec2 vUv; varying vec3 vWP; varying float vI; varying vec3 vCol;
      void main(){
        int s = int(aA.w + 0.5);
        vec4 b = uBurst[s]; vec4 bc = uBurstCol[s];
        float t = uTime - b.w;
        float kind = bc.w; // 0 peony, 1 willow (gold, drooping), 2 ring
        vI = 0.0;
        if (t < -1.6 || t > 4.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec3 dir = aA.xyz;
        if (kind > 1.5) { dir = normalize(vec3(dir.x, dir.y * 0.08, dir.z)); }
        float v0 = (kind > 0.5 && kind < 1.5 ? 44.0 : 60.0) * (0.85 + aB.x * 0.3);
        float drag = kind > 0.5 && kind < 1.5 ? 0.9 : 1.45;
        float g = kind > 0.5 && kind < 1.5 ? 9.0 : 5.0;
        vec3 p, vel;
        float wk = 1.0, tail = 0.0;
        if (t < 0.0) {
          // the shell climbing: a thin wake of sparks that flicker and drop behind it
          if (aB.y > 0.035) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          float u = t + 1.6;
          float lag = aB.z * aB.z * 0.45;
          p = b.xyz + vec3(0.0, t * 40.0 - lag * 40.0, 0.0) + vec3(sin(aB.x * 40.0), 0.0, cos(aB.x * 40.0)) * lag * 3.0 + vec3(0.0, -4.0 * lag * lag, 0.0);
          vel = vec3(0.0, 40.0, 0.0);
          vI = (aB.z < 0.05 ? 1.0 : 0.45 * (1.0 - aB.z)) * (0.5 + 0.5 * step(0.4, fract(uTime * 17.0 + aB.x * 9.0))) * smoothstep(0.0, 0.25, u);
          vCol = vec3(1.0, 0.72, 0.42);
          wk = 0.35;
        } else {
          float e = (1.0 - exp(-drag * t)) / drag;
          p = b.xyz + dir * v0 * e + vec3(0.0, -0.5 * g * t * t, 0.0);
          vel = dir * v0 * exp(-drag * t) + vec3(0.0, -g * t, 0.0);
          float fade = exp(-t * (kind > 0.5 && kind < 1.5 ? 0.75 : 1.3)) * smoothstep(4.5, 3.0, t);
          float sparkle = kind > 0.5 && kind < 1.5 ? 0.6 + 0.4 * step(0.5, fract(uTime * 13.0 + aB.y * 7.0)) : 1.0;
          vI = fade * sparkle * smoothstep(0.0, 0.06, t);
          // colour cools as the stars burn down
          vCol = mix(bc.rgb, vec3(1.0, 0.85, 0.6), exp(-t * 3.0) * 0.6);
          // willow stars leave long hanging trails of burning residue
          if (kind > 0.5 && kind < 1.5) tail = min(1.2 + t * 2.2, 9.0);
        }
        vec3 v = normalize(vel + 1e-4);
        vec3 side = normalize(cross(v, normalize(p - cameraPosition)));
        // stars keep a visible size at any distance; fast ones streak
        float w = (0.3 + distance(p, cameraPosition) * 0.0032) * wk;
        float len = max(max(w, min(length(vel) * 0.09, 7.0)), tail);
        // the quad trails behind the star: its head sits at p
        vec3 wp = p + v * (position.y - 0.4) * len + side * position.x * w;
        vUv = position.xy + 0.5;
        vWP = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${HEAD}
      varying vec2 vUv; varying vec3 vWP; varying float vI; varying vec3 vCol;
      void main(){
        vec2 q = vUv * 2.0 - 1.0;
        // bright head, a tail that thins and fades behind it
        float along = smoothstep(-1.0, 0.75, q.y);
        float a = exp(-q.x * q.x * mix(14.0, 5.0, along)) * along * along * smoothstep(1.0, 0.8, q.y);
        gl_FragColor = vec4(vCol * a * vI * 12.0 * sfTrans(vWP), 1.0);
      }`,
  });
  return { mesh: fxMesh(geo, mat, 'fireworks', true), uniforms };
}

const HANABI_COLS = [[1.0, 0.3, 0.45], [1.0, 0.75, 0.3], [0.5, 0.75, 1.0], [0.85, 0.4, 1.0], [1.0, 0.95, 0.85], [0.45, 1.0, 0.6]];

// ------------------------------------------------------------------ the set

// ------------------------------------------------------------------ birds

// small flocks crossing the sky by day: dark silhouettes that flap and glide, softened by the haze
const FLOCKS = 3, PER_FLOCK = 16;
function birds() {
  const R = rng(91);
  const geo = quadGeo(FLOCKS * PER_FLOCK, [
    ['aA', 4, (a, o, i) => {
      const k = i % PER_FLOCK;
      a[o] = R.range(-7, 7); a[o + 1] = R.range(-2, 2); a[o + 2] = R.range(-6, 6) - k * 0.25; a[o + 3] = Math.floor(i / PER_FLOCK);
    }],
    ['aB', 4, (a, o) => { a[o] = R.next(); a[o + 1] = R.range(0.8, 1.15); a[o + 2] = R.next(); a[o + 3] = 0; }],
  ]);
  const uniforms = {
    uFlock: { value: Array.from({ length: FLOCKS }, () => new THREE.Vector4(0, -999, 0, 0)) },
    uFlockDir: { value: Array.from({ length: FLOCKS }, () => new THREE.Vector4(1, 0, 0, 0)) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, ...uniforms },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      ${HEAD}
      attribute vec4 aA; attribute vec4 aB;
      uniform vec4 uFlock[${FLOCKS}]; uniform vec4 uFlockDir[${FLOCKS}];
      varying vec2 vUv; varying vec3 vWP; varying float vI; varying float vFlap;
      void main(){
        int f = int(aA.w + 0.5);
        vec4 F = uFlock[f], D = uFlockDir[f];
        vec3 fwd = normalize(vec3(D.x, 0.0, D.y)), side = vec3(-fwd.z, 0.0, fwd.x);
        float t = uTime;
        vec3 sway = vec3(sin(t * 0.5 + aB.x * 30.0), sin(t * 0.8 + aB.x * 17.0) * 0.4, cos(t * 0.45 + aB.x * 23.0)) * 1.6;
        vec3 p = F.xyz + side * aA.x + vec3(0.0, aA.y, 0.0) + fwd * aA.z + sway;
        // flap in bursts, then glide with the wings held a little up
        float glide = smoothstep(0.2, 0.7, sin(t * 0.37 + aB.x * 9.0) * 0.5 + 0.5);
        vFlap = mix(sin(t * (7.5 + aB.z * 2.0) + aB.x * 40.0), 0.25, glide);
        vI = F.w;
        vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        // a kite-sized bird, never allowed to shrink below a few pixels where it would break into specks
        float size = max(1.5 * aB.y, distance(p, cameraPosition) * 0.004);
        vUv = position.xy + 0.5;
        vWP = p;
        if (vI < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        gl_Position = projectionMatrix * viewMatrix * vec4(p + (cr * position.x + cu * position.y * 0.6) * size, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${HEAD}
      varying vec2 vUv; varying vec3 vWP; varying float vI; varying float vFlap;
      float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
      void main(){
        vec2 q = vUv * 2.0 - 1.0;
        q.x = abs(q.x);
        float f = vFlap;
        vec2 sh = vec2(0.07, 0.0), el = vec2(0.45, 0.1 + 0.45 * f), tip = vec2(0.95, 0.02 + 0.85 * f);
        float w = min(seg(q, sh, el) - 0.09, seg(q, el, tip) - 0.06 * (1.0 - q.x * 0.5));
        float body = length(q / vec2(0.14, 0.12)) - 1.0;
        float d = min(w, body * 0.1);
        float fw = fwidth(d);
        float a = smoothstep(fw, -fw, d);
        float tr = sfTrans(vWP);
        gl_FragColor = vec4(vec3(0.045, 0.045, 0.05), a * vI * tr * 0.92);
      }`,
  });
  const mesh = fxMesh(geo, mat, 'birds');
  mesh.renderOrder = 9;
  const R2 = rng(4242);
  const fl = Array.from({ length: FLOCKS }, (_, i) => ({ t0: -1, end: i * 9, start: new THREE.Vector3(), dir: new THREE.Vector3(), speed: 10 }));
  const fwd = new THREE.Vector3();
  function update(t, camera, dayK) {
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    for (let i = 0; i < FLOCKS; i++) {
      const F = fl[i];
      if (t > F.end) {
        // enter from one side, ahead of the camera, and cross the view
        const side = R2.next() < 0.5 ? -1 : 1;
        const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
        const ahead = R2.range(50, 130);
        F.start.copy(camera.position).addScaledVector(fwd, ahead).addScaledVector(right, -side * R2.range(45, 100));
        F.start.y = camera.position.y + R2.range(14, 40);
        F.dir.copy(right).multiplyScalar(side).addScaledVector(fwd, R2.range(-0.35, 0.25)).normalize();
        F.speed = R2.range(8, 12);
        F.t0 = t;
        F.end = t + 220 / F.speed + R2.range(6, 30);
      }
      const k = t - F.t0;
      const run = 220 / F.speed;
      const vis = smoothstep(0, 3, k) * smoothstep(run, run - 3, k) * dayK * (i < 2 || dayK > 0.8 ? 1 : 0);
      uniforms.uFlock.value[i].set(F.start.x + F.dir.x * F.speed * k, F.start.y + Math.sin(k * 0.2 + i) * 4, F.start.z + F.dir.z * F.speed * k, vis);
      uniforms.uFlockDir.value[i].set(F.dir.x, F.dir.z, F.speed, 0);
    }
  }
  return { mesh, update };
}

export function createFX(scene) {
  const fall = fallers();
  const ff = fireflies();
  const wi = wisps();
  const fl = floatingLanterns();
  const sl = skyLanterns();
  const fw = fireworks();
  const bd = birds();
  for (const o of [fall, ff, wi, fl, sl, fw, bd]) scene.add(o.mesh);
  const R = rng(123);
  let nextBurst = 0, slot = 0;
  const stats = { bursts: 0 };
  // each live burst as a light: where its stars are, their colour, and how they burn down (the shader's fade)
  const bursts = Array.from({ length: SLOTS }, () => ({ x: 0, y: 0, z: 0, t0: -1e9, r: 0, g: 0, b: 0, kind: 0, I: 0 }));
  const lit = [];

  function update(dt, t, ctx) {
    const { env, camera, onBurst } = ctx;
    const sw = U.uSeason.value;
    const cz = camera.position.z;
    // petals thickest along the cherry avenue and by the sacred tree, leaves through the autumn gorge
    const avenue = smoothstep(-160, -260, cz) * smoothstep(-700, -600, cz);
    const island = smoothstep(-2050, -2200, cz);
    fall.uniforms.uCam.value.copy(camera.position);
    fall.uniforms.uPetal.value = clamp(sw.x * (0.12 + avenue * 0.75 + island * 0.6) + island * 0.35 * U.uSpirit.value, 0, 1);
    fall.uniforms.uLeaf.value = sw.z * (0.15 + 0.5 * smoothstep(-800, -1000, cz) * smoothstep(-1700, -1500, cz));
    fall.uniforms.uSnowFall.value = env.w.snow;
    fall.uniforms.uRainFall.value = env.w.rain;
    fall.uniforms.uGlow.value = island * U.uSpirit.value * 0.85;
    ff.uniforms.uK.value = sw.y * smoothstep(0.35, 0.8, env.night);
    bd.update(t, camera, (1 - smoothstep(0.25, 0.6, env.night)) * (1 - env.w.rain * 0.9) * (1 - env.w.snow * 0.7) * (1 - sw.w * 0.5));

    // summer nights over the lake: fireworks
    const lakeView = cz < -1980;
    if (sw.y > 0.6 && env.night > 0.6 && lakeView && t > nextBurst) {
      nextBurst = t + R.range(1.6, 4.2);
      const ang = R.next() * Math.PI * 2;
      const r = R.range(40, 150);
      const ox = ISLAND.x + Math.cos(ang) * r, oz = ISLAND.z - 40 + Math.sin(ang) * r * 0.7;
      const oy = R.range(38, 72);
      const c = HANABI_COLS[R.int(0, HANABI_COLS.length - 1)];
      const kind = R.next() < 0.25 ? 1 : R.next() < 0.18 ? 2 : 0;
      fw.uniforms.uBurst.value[slot].set(ox, oy, oz, t + 1.6);
      fw.uniforms.uBurstCol.value[slot].set(kind === 1 ? 1.0 : c[0], kind === 1 ? 0.62 : c[1], kind === 1 ? 0.25 : c[2], kind);
      Object.assign(bursts[slot], { x: ox, y: oy, z: oz, t0: t + 1.6, r: kind === 1 ? 1.0 : c[0], g: kind === 1 ? 0.62 : c[1], b: kind === 1 ? 0.25 : c[2], kind });
      slot = (slot + 1) % SLOTS;
      stats.bursts++;
      onBurst && onBurst({ x: ox, y: oy, z: oz, at: t + 1.6 });
    }
    // the bursts light the lake: the brightest three as points for the water's glints, all of them summed into one
    // flash from their direction for the banks, the boat and the haze. A burst flares as it breaks, then fades as
    // its stars burn down and fall
    lit.length = 0;
    const bCol = U.uFwCol.value.set(0, 0, 0), bDir = U.uFwDir.value;
    let dx = 0, dy = 0, dz = 0;
    for (const b of bursts) {
      const age = t - b.t0;
      const willow = b.kind === 1;
      b.I = age < 0 || age > 4.5 ? 0 : Math.exp(-age * (willow ? 0.75 : 1.3)) * smoothstep(4.5, 3.0, age) * (1 + 1.8 * Math.exp(-age * 9));
      if (b.I < 0.01) continue;
      lit.push(b);
      const ex = b.x - camera.position.x, ey = b.y - 0.5 * (willow ? 9 : 5) * age * age - camera.position.y, ez = b.z - camera.position.z;
      const d = Math.hypot(ex, ey, ez);
      const k = b.I * 0.22 * clamp((150 / d) ** 2, 0.15, 1.2);
      bCol.x += b.r * k; bCol.y += b.g * k; bCol.z += b.b * k;
      dx += (ex / d) * k; dy += (ey / d) * k; dz += (ez / d) * k;
    }
    if (dx || dy || dz) bDir.set(dx, dy, dz).normalize();
    lit.sort((a, b) => b.I - a.I);
    const BL = U.uFwL.value, BC = U.uFwC.value;
    for (let i = 0; i < BL.length; i++) {
      const b = lit[i];
      if (!b) { BL[i].set(0, -999, 0, 0); BC[i].set(0, 0, 0, 0); continue; }
      const age = t - b.t0;
      BL[i].set(b.x, b.y - 0.5 * (b.kind === 1 ? 9 : 5) * age * age, b.z, b.I);
      // how far the stars have flown: the shader's v0 (1 - e^-drag t) / drag
      const willow = b.kind === 1, drag = willow ? 0.9 : 1.45;
      BC[i].set(b.r, b.g, b.b, (willow ? 44 : 60) * (1 - Math.exp(-drag * Math.max(age, 0))) / drag);
    }
  }
  return { update, stats, fw };
}

// The gorge waterfall: a long cascade sliding down the left wall from the lip into the river, streaked and
// broken into strands, with spray rolling off the plunge. Drawn with the effects, after the water.
import * as THREE from 'three';
import { U, UNIFORMS_GLSL, NOISE, ATMOS } from '../core/shared.js';
import { LAYER_FX } from '../core/pipeline.js';
import { riverAt, terrainHeight, waterSd } from './layout.js';
import { SITES } from './sites.js';

const HEAD = /* glsl */ `
  ${UNIFORMS_GLSL}
  ${NOISE}
  ${ATMOS}
`;

export function createWaterfall() {
  const { z, side } = SITES.waterfall;
  const r = riverAt(z);
  // the shore, then up the wall to the lip
  // from mid-river out to where the pool's back wall rises out of the water
  let x0 = r.x + side * r.w * 0.6;
  while (waterSd(x0, z) < 0 || terrainHeight(x0, z) < 0.05) x0 += side * 0.25;
  const prof = [];
  for (let d = -0.6; d <= 42; d += 1.5) {
    const x = x0 + side * d;
    prof.push([x, Math.max(terrainHeight(x, z), -0.15)]);
  }
  const lipY = prof[prof.length - 1][1];

  // ribbon: rows along the fall (top first), columns across; it stands a little proud of the rock
  const rows = prof.length, cols = 9;
  const pos = [], uv = [], idx = [];
  let L = 0;
  const lens = [0];
  for (let i = prof.length - 1; i > 0; i--) {
    const [xa, ya] = prof[i], [xb, yb] = prof[i - 1];
    L += Math.hypot(xa - xb, ya - yb);
    lens.push(L);
  }
  for (let k = 0; k < rows; k++) {
    const i = prof.length - 1 - k;
    const [x, y] = prof[i];
    // outward from the wall: the slope normal in the x-y plane, toward the river
    const [xn, yn] = prof[Math.max(0, i - 1)], [xp, yp] = prof[Math.min(prof.length - 1, i + 1)];
    let nx = -(yp - yn), ny = side * (xp - xn);
    const nl = Math.hypot(nx, ny) || 1;
    nx = (nx / nl) * -side; ny = Math.abs(ny / nl);
    const f = k / (rows - 1);
    const half = 2.2 + f * 2.8;
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1);
      const bulge = Math.sin(u * Math.PI) * 0.35;
      pos.push(x + nx * (0.45 + bulge) * -side * side, y + ny * (0.45 + bulge) + 0.05, z + (u - 0.5) * 2 * half);
      uv.push(u, lens[k]);
    }
  }
  for (let k = 0; k < rows - 1; k++) for (let c = 0; c < cols - 1; c++) {
    const a = k * cols + c, b = a + cols;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);

  const sheet = new THREE.ShaderMaterial({
    uniforms: { ...U, uLen: { value: L } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${HEAD}
      varying vec2 vUv; varying vec3 vWP;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      ${HEAD}
      uniform float uLen;
      varying vec2 vUv; varying vec3 vWP;
      void main(){
        float across = vUv.x, along = vUv.y;
        float w = 4.4 + along / uLen * 5.6;
        // water accelerates down the face: the streaks stretch as they fall
        float fall = along - uTime * (4.0 + along * 0.12);
        vec2 p = vec2(across * w, fall);
        float s1 = sfNoise(vec2(p.x * 2.2, p.y * 0.22));
        float s2 = sfNoise(vec2(p.x * 7.0 + 3.0, p.y * 0.7));
        float s3 = sfNoise(vec2(p.x * 19.0 - 1.0, p.y * 1.6));
        float streak = s1 * 0.5 + s2 * 0.32 + s3 * 0.18;
        // a few fixed channels where the flow gathers, thin veils between them
        float chan = smoothstep(0.3, 0.6, sfNoise(vec2(across * w * 0.7, 5.3)) * 0.7 + sfNoise(vec2(across * w * 2.1, along * 0.02)) * 0.3);
        float edge = smoothstep(0.0, 0.2, across) * smoothstep(1.0, 0.8, across);
        float top = smoothstep(0.0, 2.5, along) * smoothstep(uLen, uLen - 1.8, along);
        float a = edge * top * mix(0.18, 1.0, chan) * (0.3 + 0.7 * smoothstep(0.35, 0.72, streak));
        vec3 light = uAmbUp * 1.25 + uSunCol * max(uSunDir.y, 0.0) * 0.22;
        vec3 col = mix(vec3(0.58, 0.68, 0.7), vec3(0.95, 0.97, 0.98), smoothstep(0.45, 0.85, streak + chan * 0.15)) * light;
        gl_FragColor = vec4(sfAtmos(col, vWP), clamp(a, 0.0, 1.0) * 0.9);
      }`,
  });
  const fall = new THREE.Mesh(geo, sheet);
  fall.layers.set(LAYER_FX);
  fall.renderOrder = 8;
  fall.frustumCulled = true;
  geo.computeBoundingSphere();

  // spray rolling off the plunge, and churned foam on the pool
  const base = new THREE.Vector3(x0 - side * 1.2, 0, z);
  const N = 7;
  const sg = new THREE.InstancedBufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  sg.setIndex([0, 1, 2, 0, 2, 3]);
  const a = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    a[i * 4] = base.x - side * (i % 3) * 1.2;
    a[i * 4 + 1] = 0.8 + (i % 4) * 0.9;
    a[i * 4 + 2] = base.z + ((i * 37) % 11 - 5) * 0.9;
    a[i * 4 + 3] = 4 + (i % 3) * 2.2;
  }
  sg.setAttribute('aS', new THREE.InstancedBufferAttribute(a, 4));
  sg.instanceCount = N;
  const spray = new THREE.ShaderMaterial({
    uniforms: { ...U },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      ${HEAD}
      attribute vec4 aS; varying vec2 vUv; varying vec3 vWP; varying float vK;
      void main(){
        vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float k = float(gl_InstanceID);
        vec3 p = aS.xyz + vec3(sin(uTime * 0.4 + k) * 0.6, sin(uTime * 0.3 + k * 2.0) * 0.4, cos(uTime * 0.35 + k) * 0.6);
        vUv = position.xy + 0.5; vWP = p; vK = k;
        gl_Position = projectionMatrix * viewMatrix * vec4(p + (cr * position.x + cu * position.y) * aS.w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${HEAD}
      varying vec2 vUv; varying vec3 vWP; varying float vK;
      void main(){
        vec2 q = vUv * 2.0 - 1.0;
        float n = sfNoise(vUv * 3.0 + vec2(vK * 3.1, -uTime * 0.25)) * 0.6 + sfNoise(vUv * 7.0 + vec2(-uTime * 0.4, vK)) * 0.4;
        float a = smoothstep(1.0, 0.1, length(q)) * smoothstep(0.35, 0.85, n) * 0.2;
        vec3 col = vec3(0.9, 0.93, 0.95) * (uAmbUp * 1.3 + uSunCol * max(uSunDir.y, 0.0) * 0.15);
        gl_FragColor = vec4(sfAtmos(col, vWP), a);
      }`,
  });
  const mist = new THREE.Mesh(sg, spray);
  mist.layers.set(LAYER_FX);
  mist.renderOrder = 9;
  mist.frustumCulled = false;

  const pg = new THREE.CircleGeometry(5.5, 32);
  pg.rotateX(-Math.PI / 2);
  pg.translate(base.x - side * 1.0, 0.04, base.z);
  const pool = new THREE.ShaderMaterial({
    uniforms: { ...U, uC: { value: new THREE.Vector2(base.x, base.z) } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      ${HEAD}
      varying vec3 vWP;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      ${HEAD}
      uniform vec2 uC; varying vec3 vWP;
      void main(){
        vec2 d = vWP.xz - uC;
        float r = length(d);
        vec2 q = vec2(atan(d.y, d.x) * 3.0, r * 1.6 - uTime * 1.4);
        float n = sfNoise(q) * 0.55 + sfNoise(q * 2.7 + 1.3) * 0.3 + sfNoise(vWP.xz * 4.0 + uTime) * 0.15;
        float a = smoothstep(6.5, 1.0, r) * smoothstep(0.42, 0.75, n) * 0.8;
        vec3 col = vec3(0.92, 0.95, 0.96) * (uAmbUp * 1.1 + uSunCol * max(uSunDir.y, 0.0) * 0.12);
        gl_FragColor = vec4(sfAtmos(col, vWP), a);
      }`,
  });
  const foam = new THREE.Mesh(pg, pool);
  foam.layers.set(LAYER_FX);
  foam.renderOrder = 7;

  const group = new THREE.Group();
  group.name = 'waterfall';
  group.add(fall, mist, foam);
  group.userData.base = base;
  group.userData.lipY = lipY;
  return group;
}

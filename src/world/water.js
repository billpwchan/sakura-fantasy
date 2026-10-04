// River and lake surface: planar reflection distorted by flow-advected ripples, refraction through the opaque
// scene (colour + depth), absorption by optical path, sun glitter, lantern glint columns, rain rings,
// the boat's Kelvin wake and bow wave, shoreline foam and petals resting on the surface.
import * as THREE from 'three';
import { U, UNIFORMS_GLSL, NOISE, ATMOS, MAX_LAMPS } from '../core/shared.js';
import { riverAt, LAKE } from './layout.js';
import { T_Z0, T_Z1 } from './terrain-gen.js';

export const LAYER_WATER = 1;

// centre-line lookup: x, half-width, slope, lake weight — sampled by z
function riverTexture() {
  const n = 2048;
  const data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const z = T_Z0 - (i / (n - 1)) * (T_Z0 - T_Z1);
    const r = riverAt(z);
    data[i * 4] = r.x;
    data[i * 4 + 1] = r.w;
    data[i * 4 + 2] = r.slope;
    data[i * 4 + 3] = THREE.MathUtils.smoothstep(-z, 2060, 2160);
  }
  const t = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

// tileable ripple normals: integer wave vectors on the torus, so the texture repeats seamlessly
function rippleTexture(size = 256, seed = 7) {
  const h = new Float32Array(size * size);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const waves = [];
  for (let i = 0; i < 56; i++) {
    const k = 1 + Math.floor(Math.pow(rnd(), 1.6) * 22);
    const a = rnd() * Math.PI * 2;
    const kx = Math.round(Math.cos(a) * k), ky = Math.round(Math.sin(a) * k);
    if (kx === 0 && ky === 0) continue;
    const kl = Math.hypot(kx, ky);
    waves.push([kx, ky, rnd() * Math.PI * 2, Math.pow(kl, -1.25)]);
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0;
      const u = (x / size) * Math.PI * 2, w = (y / size) * Math.PI * 2;
      for (const [kx, ky, ph, am] of waves) {
        const p = Math.sin(kx * u + ky * w + ph);
        v += am * (p - 0.35 * p * p * p); // a little sharper crests
      }
      h[y * size + x] = v;
    }
  const data = new Uint8Array(size * size * 4);
  const sc = 1.6;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
      const d = h[((y - 1 + size) % size) * size + x], u = h[((y + 1) % size) * size + x];
      let nx = (l - r) * sc, ny = (d - u) * sc, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = nz * 255;
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export class Reflection {
  constructor() {
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.cam = new THREE.PerspectiveCamera();
    this.cam.matrixAutoUpdate = true;
    this.textureMatrix = new THREE.Matrix4();
    this._v = new THREE.Vector3(); this._t = new THREE.Vector3(); this._r = new THREE.Matrix4(); this._la = new THREE.Vector3();
    this._plane = new THREE.Plane(); this._clip = new THREE.Vector4(); this._q = new THREE.Vector4();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.planeY = 0;
    this._view = new THREE.Vector3(); this._target = new THREE.Vector3(); this._pp = new THREE.Vector3();
    // [mesh, geometry] pairs: cheaper stand-ins swapped in for the mirror pass only
    this.lod = [];
  }
  setSize(w, h) { this.rt.setSize(Math.max(1, w), Math.max(1, h)); }
  render(renderer, scene, camera, layersMask) {
    const cam = this.cam, n = this.normal;
    const camPos = this._v.setFromMatrixPosition(camera.matrixWorld);
    const origin = this._t.set(0, this.planeY, 0);
    // camera position mirrored in the plane
    const view = this._view.subVectors(origin, camPos).reflect(n).negate().add(origin);
    this._r.extractRotation(camera.matrixWorld);
    const look = this._la.set(0, 0, -1).applyMatrix4(this._r).add(camPos);
    const target = this._target.subVectors(origin, look).reflect(n).negate().add(origin);
    cam.position.copy(view);
    cam.up.set(0, 1, 0).applyMatrix4(this._r).reflect(n);
    cam.lookAt(target);
    cam.far = camera.far; cam.near = camera.near;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    // oblique near plane at the water so nothing below the surface is reflected
    this._plane.setFromNormalAndCoplanarPoint(n, this._pp.set(0, this.planeY - 0.06, 0));
    this._plane.applyMatrix4(cam.matrixWorldInverse);
    const clip = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = cam.projectionMatrix.elements;
    const q = this._q;
    q.x = (Math.sign(clip.x) + pm[8]) / pm[0];
    q.y = (Math.sign(clip.y) + pm[9]) / pm[5];
    q.z = -1.0;
    q.w = (1.0 + pm[10]) / pm[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    pm[2] = clip.x; pm[6] = clip.y; pm[10] = clip.z + 1.0; pm[14] = clip.w;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    cam.layers.mask = layersMask;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    // the shadow map is drawn inside the first render of the frame; once it exists, keep it out of this one so it never
    // sees the stand-ins (the mirror then reads last frame's map). The very first frame has to create it here.
    const sm = renderer.shadowMap, shadowDue = sm.needsUpdate;
    if (this.primed) sm.needsUpdate = false;
    this.primed = true;
    const lod = this.lod;
    for (let i = 0; i < lod.length; i++) { const e = lod[i]; e[2] = e[0].geometry; e[0].geometry = e[1]; }
    renderer.render(scene, cam);
    for (let i = 0; i < lod.length; i++) { const e = lod[i]; e[0].geometry = e[2]; }
    sm.needsUpdate = shadowDue;
  }
}

export function createWater(reflection) {
  const uniforms = {
    ...U,
    tReflect: { value: reflection.rt.texture },
    tScene: { value: null },
    tDepth: { value: null },
    tRipple: { value: rippleTexture() },
    tRiver: { value: riverTexture() },
    uReflMat: { value: reflection.textureMatrix },
    uRes: { value: new THREE.Vector2(1, 1) },
    uNearFar: { value: new THREE.Vector2(0.1, 5000) },
    uZRange: { value: new THREE.Vector2(T_Z0, T_Z1) },
    uLake: { value: new THREE.Vector3(LAKE.x, LAKE.z, LAKE.r) },
    uBoatInv: { value: new THREE.Matrix4().makeTranslation(0, 0, -99999) },
    uBoatK: { value: 1 },
    uOar: { value: new THREE.Vector4(0, -99999, 0, -99999) },
    uEddy: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -99999, -1e3, 0)) },
    uWake: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, -99999, -1e3, 0)) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform mat4 uReflMat;
      varying vec3 vWP; varying vec4 vRefl; varying float vViewZ;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        vRefl = uReflMat * wp;
        vec4 mv = viewMatrix * wp;
        vViewZ = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vWP; varying vec4 vRefl; varying float vViewZ;
      ${UNIFORMS_GLSL}
      ${NOISE}
      ${ATMOS}
      uniform sampler2D tReflect, tScene, tDepth, tRipple, tRiver;
      uniform vec2 uRes, uNearFar, uZRange;
      uniform vec3 uLake;
      uniform mat4 uBoatInv;
      const float HULL_WL[36] = float[36](0.558, 0.574, 0.608, 0.646, 0.674, 0.685, 0.685, 0.685, 0.685, 0.685, 0.685, 0.685, 0.685, 0.685, 0.685, 0.685, 0.685, 0.685, 0.685, 0.680, 0.670, 0.651, 0.624, 0.588, 0.544, 0.491, 0.426, 0.348, 0.256, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
      uniform float uBoatK;
      uniform vec4 uOar, uEddy[8], uWake[16];

      float linDepth(float d){
        float n = uNearFar.x, f = uNearFar.y;
        float z = d * 2.0 - 1.0;
        return 2.0 * n * f / (f + n - z * (f - n));
      }
      vec2 rip(vec2 uv){ return texture2D(tRipple, uv).xy * 2.0 - 1.0; }

      // raindrop rings: one drop per cell per layer, each ring expanding and fading on its own clock
      vec2 rainRings(vec2 p, float t){
        vec2 acc = vec2(0.0);
        for (int L = 0; L < 2; L++){
          vec2 q = p * (L == 0 ? 2.2 : 3.1) + float(L) * 17.0;
          vec2 id = floor(q), f = fract(q) - 0.5;
          float h = sfHash12(id + float(L) * 9.1);
          float ph = fract(t * (0.9 + h * 0.5) + h);
          vec2 c = vec2(sfHash12(id + 3.7), sfHash12(id + 8.3)) - 0.5;
          vec2 d = f - c * 0.6;
          float r = length(d);
          float ring = sin((r - ph * 0.45) * 60.0) * smoothstep(0.08, 0.0, abs(r - ph * 0.45)) * (1.0 - ph);
          acc += d / max(r, 1e-3) * ring;
        }
        return acc;
      }

      // cellular lace: bright along the borders between cells, the way foam breaks into a net
      float lace(vec2 p, float t){
        vec2 i = floor(p), f = fract(p);
        float d1 = 8.0, d2 = 8.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
          vec2 g = vec2(float(x), float(y));
          vec2 o = vec2(sfHash12(i + g), sfHash12(i + g + 19.7));
          o = 0.5 + 0.42 * sin(t + 6.2831 * o);
          float d = length(g + o - f);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
        return d2 - d1;
      }
      // Kelvin ship waves by stationary phase: x metres behind the bow and y off its track, the transverse and the
      // divergent system arrive from the two directions tan = (-x +- sqrt(x^2 - 8y^2)) / 4y inside the 19.47 degree
      // wedge and die away past it. Returns the gradient (d/dx, d/dy) of the surface; px is metres per pixel, so waves
      // too short to show are left out rather than aliased
      vec2 kelvin(float x, float y, float k0, float px){
        float ay = max(abs(y), 1e-3), sy = y < 0.0 ? -1.0 : 1.0;
        float sq = sqrt(max(x * x - 8.0 * ay * ay, 0.0));
        float past = max(ay - 0.35355 * x, 0.0) / (0.35 + 0.25 * pow(x, 0.333));
        float rc = min(ay / (0.35355 * x), 1.0);
        float xs = max(x, 3.0) / 6.0;
        vec2 g = vec2(0.0);
        for (int j = 0; j < 2; j++) {
          float T = (-x + (j == 0 ? sq : -sq)) / (4.0 * ay);
          float r2 = 1.0 + T * T, r = sqrt(r2);
          float ph = k0 * r * (x + ay * T);
          float lam = 6.2832 / (k0 * r2);
          // slope: transverse ~x^-1/2 and weak behind a slender hull, divergent ~x^-1/3 and gathered on the cusp line
          float a = j == 0 ? 0.05 * inversesqrt(xs) : 0.12 * pow(xs, -0.333) * (1.0 + 1.4 * rc * rc * rc);
          a *= smoothstep(0.18, 0.45, lam) * smoothstep(2.5, 5.0, lam / px);
          g -= a * sin(ph) * vec2(1.0, T * sy) / r;
        }
        return g * exp(-past * past) * smoothstep(0.5, 3.0, x);
      }

      // loose round bubbles, at most one to a cell and not in every cell
      float bubbles(vec2 p){
        vec2 i = floor(p), f = fract(p);
        float h = sfHash12(i);
        vec2 o = vec2(h, sfHash12(i + 7.1)) * 0.56 + 0.22;
        float r = 0.09 + 0.11 * sfHash12(i + 3.7);
        return smoothstep(r, r * 0.45, length(f - o)) * step(0.3, h);
      }

      void main(){
        vec3 wp = vWP;
        float petPx = length(fwidth(wp.xz));
        vec2 suv = gl_FragCoord.xy / uRes;
        float sceneZ = linDepth(texture2D(tDepth, suv).x);
        float thick = sceneZ - vViewZ;
        if (thick < 0.0) discard;

        // river-aligned flow
        float zt = clamp((uZRange.x - wp.z) / (uZRange.x - uZRange.y), 0.0, 1.0);
        vec4 rv = texture2D(tRiver, vec2(zt, 0.5));
        float lake = rv.w;
        vec2 flowDir = normalize(vec2(-rv.z, -1.0));
        float across = clamp((wp.x - rv.x) / max(rv.y, 1.0), -1.5, 1.5);
        float speed = mix(0.85, 0.06, lake) * (1.0 - 0.55 * across * across);
        vec2 flow = flowDir * speed;

        // two-phase flow advection: bounded shear, no visible reset
        float T = uTime * 0.22;
        float p0 = fract(T), p1 = fract(T + 0.5);
        float bw = abs(p0 - 0.5) * 2.0;
        vec2 uvA = (wp.xz - flow * p0 * 4.5) / 7.5;
        vec2 uvB = (wp.xz - flow * p1 * 4.5) / 7.5 + 0.43;
        vec2 nA = rip(uvA) + rip(uvA * 2.3 + 0.21) * 0.6;
        vec2 nB = rip(uvB) + rip(uvB * 2.3 + 0.71) * 0.6;
        vec2 n = mix(nA, nB, bw);
        // wind ripples, not advected
        vec2 wdir = normalize(uWind.xy);
        vec2 wuv = wp.xz / 2.6 + wdir * uTime * 0.35;
        n += rip(wuv) * (0.25 + 0.6 * uWind.z) + rip(wuv * 2.7 - wdir * uTime * 0.2) * 0.35 * uWind.z;
        // rain
        n += rainRings(wp.xz, uTime) * uRain * 1.4;

        // the boat: Kelvin wake along its track, a bow wave, hull foam
        float foam = 0.0;
        vec3 bp = (uBoatInv * vec4(wp, 1.0)).xyz; // boat space: +z forward
        // the hull sits just under the surface, which the depth test would otherwise read as a beach
        float offHull = smoothstep(1.0, 1.35, length(vec2(bp.x / 0.78, (bp.z + 0.68) / 3.5)));
        // the wake follows the bow's real track, each point of it carried downstream since the bow passed:
        // wx = metres along that track from the bow, wy = signed distance off it; tb runs back along it
        float wx = -1.0, wy = 0.0, wAge = 1e3, wSpd = 0.0;
        vec2 tb = vec2(0.0, 1.0);
        if (length(wp.xz - uWake[0].xy) < 100.0) {
          float best = 1e9, run = 0.0;
          vec4 a = uWake[0];
          vec2 A = a.xy;
          for (int i = 1; i < 16; i++) {
            vec4 s = uWake[i];
            float age = uTime - s.z;
            if (age > 45.0) break;
            vec2 B = s.xy + flow * age * 1.2;
            vec2 ab = B - A, aq = wp.xz - A;
            float L2 = dot(ab, ab);
            if (L2 > 0.01) {
              float L = sqrt(L2);
              float h = clamp(dot(aq, ab) / L2, 0.0, 1.0);
              vec2 d = aq - ab * h;
              float dd = dot(d, d);
              if (dd < best) {
                best = dd;
                wx = run + h * L;
                wAge = uTime - mix(a.z, s.z, h);
                wSpd = (a.w - s.w) / max(a.z - s.z, 0.05);
                tb = ab / L;
                wy = sign(tb.x * aq.y - tb.y * aq.x) * sqrt(dd);
              }
              run += L;
            }
            a = s; A = B;
          }
        }
        // the V of ship waves spreading from the bow, swaying the reflections; the slick the hull and the ro leave
        // down the middle, where the turbulence has smoothed the ripples away and the river mirrors more clearly
        vec2 wakeS = vec2(0.0);
        float bspd = uBoat.w;
        if (wx > 0.0) {
          float lay = smoothstep(0.4, 2.5, wSpd) * exp(-wAge / 28.0) * smoothstep(80.0, 50.0, wx);
          float Uv = 1.2 + 1.2 * clamp(bspd, 0.0, 1.5);
          vec2 g = kelvin(wx, wy, 9.81 / (Uv * Uv), petPx) * lay;
          wakeS = -(g.x * tb + g.y * vec2(-tb.y, tb.x));
          float along = wx - 6.7, side = abs(wy);
          float slickW = 0.6 + 0.3 * sqrt(max(along, 0.0));
          float ragged = (sfNoise((wp.xz - flow * uTime * 1.2) * 0.45) - 0.5) * 0.9 * slickW;
          float slick = smoothstep(slickW, slickW * 0.3, side + ragged) * smoothstep(-0.5, 1.5, along) * smoothstep(60.0, 25.0, along)
                      * smoothstep(0.4, 2.5, wSpd) * exp(-wAge / 40.0);
          n *= 1.0 - 0.6 * slick;
          if (along > -3.0 && along < 40.0) {
            float trail = exp(-side * side * 0.7) * smoothstep(36.0, 0.0, along) * smoothstep(-1.0, 1.5, along);
            // foam laid down behind the stern stays where it fell and drifts with the river, thinning into lace;
            // cells are stretched along the track and warped so the net never reads as a grid
            vec2 wq = wp.xz - flow * uTime * 1.2;
            vec2 fq = vec2(dot(wq, vec2(-tb.y, tb.x)) * 2.8, dot(wq, tb) * 1.1);
            fq += (vec2(sfNoise(fq * 0.45), sfNoise(fq * 0.45 + 7.3)) - 0.5) * 1.6;
            // thin, broken threads: bubbles strung along cell borders, never a continuous web
            float e1 = lace(fq, uTime * 0.7), e2 = lace(fq * 2.3 + 4.1, uTime * 1.1);
            // strung bubbles: the threads break along their length too, so close up they never read as scratches
            float beads = smoothstep(0.45, 0.8, sfNoise(fq * 3.7 + uTime * 0.3)) * smoothstep(0.32, 0.62, sfNoise(wq * 11.0 + uTime * 0.15));
            float net = (smoothstep(0.06, 0.008, e1) * 0.8 + smoothstep(0.05, 0.006, e2) * 0.45) * beads;
            // close up a thread is a scatter of separate bubbles over a wider band, not a line
            float nearK = smoothstep(22.0, 8.0, length(wp - cameraPosition));
            if (nearK > 0.0) {
              float band = smoothstep(0.17, 0.03, e1) * 0.8 + smoothstep(0.13, 0.02, e2) * 0.45;
              float bub = bubbles(wq * 26.0) + bubbles(wq * 41.0 + 5.3) * 0.6;
              net = mix(net, band * bub * smoothstep(0.2, 0.55, sfNoise(fq * 3.7 + uTime * 0.3)) * 1.3, nearK);
            }
            net *= smoothstep(0.3, 0.65, sfNoise(fq * 0.21 + along * 0.05));
            float fresh = smoothstep(11.0, 0.5, along);
            float churn = smoothstep(0.45, 0.8, sfNoise(fq * 0.8 - uTime * 0.6)) * fresh * fresh;
            foam += trail * (net * 0.45 + churn * 0.3) * smoothstep(-0.5, 2.0, along) * fresh * 0.6 * min(bspd * 0.6, 1.0);
          }
        }
        {
          // collar of ripples ringing the hull (it rocks even at rest)
          float hullD = length(vec2(bp.x / 0.78, (bp.z + 0.68) / 3.5));
          float hr = hullD - 1.05;
          float ring = exp(-hr * hr * 18.0);
          n += normalize(bp.xz + 1e-3) * ring * sin(hullD * 26.0 - uTime * 4.0) * 0.35;
          // the ro: a collar where the loom cuts the surface, a glassy boil over the blade, and the eddies it sheds
          // at each turn of the stroke, left in the river to drift, spread and fade
          if (length(wp.xz - uOar.zw) < 45.0) {
            vec2 e = wp.xz - uOar.xy;
            float de = length(e);
            float dc = de - 0.11;
            float collar = exp(-dc * dc * 600.0);
            n += e / max(de, 1e-3) * collar * sin(de * 75.0 - uTime * 11.0) * 0.6;
            foam += exp(-de * de * 450.0) * 0.45 + collar * 0.15;
            vec2 b = wp.xz - uOar.zw;
            float bd = length(b);
            n *= 1.0 - 0.6 * exp(-bd * bd * 1.8);
            float bw = bd - 0.8;
            n += b / max(bd, 1e-3) * exp(-bw * bw * 9.0) * sin(bd * 14.0 - uTime * 5.0) * 0.22;
            for (int i = 0; i < 8; i++) {
              vec4 ed = uEddy[i];
              float age = uTime - ed.z;
              if (age < 0.0 || age > 7.0) continue;
              vec2 q = wp.xz - ed.xy - flow * age * 1.2;
              float r = 0.32 + age * 0.13;
              float d2 = dot(q, q) / (r * r);
              if (d2 > 7.0) continue;
              float k = exp(-d2) * exp(-age * 0.38) * smoothstep(0.0, 0.4, age) * smoothstep(7.0, 5.5, age);
              // a dimple whose rim spirals with the spin
              n += (q + vec2(-q.y, q.x) * ed.w * 0.9) / r * k * 1.3;
              n *= 1.0 - 0.45 * exp(-d2 * 2.5) * exp(-age * 0.5);
              float rim = sqrt(d2) - 1.1;
              foam += exp(-rim * rim * 5.0) * exp(-age * 1.2) * 0.035;
            }
          }
          // the bow cuts a white curl; elsewhere the collar only glints
          float bowK = smoothstep(0.55, 1.0, (bp.z + 0.68) / 3.5);
          // streaks pulled back along the hull at the boat's speed, warped so they never settle into cells
          vec2 bq = vec2(bp.x * 3.2, bp.z * 1.1 + uTime * 1.6 * bspd);
          bq += (vec2(sfNoise(bq * 0.5), sfNoise(bq * 0.5 + 3.1)) - 0.5) * 1.4;
          float curl = smoothstep(0.5, 0.82, sfNoise(bq) * 0.6 + sfNoise(bq * 2.7) * 0.4);
          foam += ring * bowK * (0.3 + 0.7 * curl) * 0.6 * min(bspd, 1.0);
          // inside the hull there is no river: the hull's half-width where its outer planking meets the surface,
          // sampled from the model every 0.237 m from the transom forward (the forefoot leaves the water at ~2.7 m)
          {
            float hi = (bp.z + 4.1) / 8.3 * 35.0;
            if (hi > 0.0 && hi < 35.0) {
              int i0 = int(floor(hi));
              float hw = mix(HULL_WL[i0], HULL_WL[min(i0 + 1, 35)], fract(hi));
              if (abs(bp.x) < hw) discard;
            }
          }
        }

        // ripples fade with distance so far water reads as a mirror, not noise
        float dist = length(wp - cameraPosition);
        float strength = mix(0.42, 0.1, smoothstep(8.0, 200.0, dist)) * mix(1.0, 0.55, lake * (1.0 - uWind.z * 0.5));
        vec3 N = normalize(vec3(n.x * strength + wakeS.x, 1.0, n.y * strength + wakeS.y));
        vec3 V = normalize(cameraPosition - wp);
        float NdV = max(dot(N, V), 0.0);
        float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);

        // reflection (planar), distorted by the ripples
        vec2 ruv = vRefl.xy / vRefl.w + N.xz * 0.035 * smoothstep(0.0, 1.0, thick);
        // the reflection is half resolution and alias-tested; a rotated 5-tap kernel turns stair-steps into a soft sheen
        vec2 rtx = 1.0 / vec2(textureSize(tReflect, 0)) * (0.9 + 1.4 * smoothstep(0.0, 1.0, length(n) * strength * 4.0));
        vec3 refl = texture2D(tReflect, ruv).rgb * 0.36
          + (texture2D(tReflect, ruv + rtx * vec2( 0.8,  0.45)).rgb + texture2D(tReflect, ruv + rtx * vec2(-0.45,  0.8)).rgb
           + texture2D(tReflect, ruv + rtx * vec2(-0.8, -0.45)).rgb + texture2D(tReflect, ruv + rtx * vec2( 0.45, -0.8)).rgb) * 0.16;

        // refraction through the scene copy; never pull colour from in front of the surface
        vec2 off = N.xz * 0.045 * clamp(thick / 2.0, 0.0, 1.0);
        vec2 suv2 = suv + off;
        float z2 = linDepth(texture2D(tDepth, suv2).x);
        if (z2 < vViewZ) suv2 = suv;
        vec3 under = texture2D(tScene, suv2).rgb;
        float thick2 = max(linDepth(texture2D(tDepth, suv2).x) - vViewZ, 0.0);
        // optical path: vertical depth stretched by the view angle
        float vDepth = thick2 * max(V.y, 0.05);
        float path = thick2 * 1.6 + vDepth * 2.0;
        vec3 absorb = exp(-path * vec3(0.95, 0.36, 0.42));
        // in-scatter colour of the water body: teal-jade lit by sky and sun
        vec3 body = vec3(0.012, 0.042, 0.036) * (uAmbUp * 1.3 + uSunCol * 0.04 * max(uSunDir.y, 0.0)) * 2.0;
        body = mix(body, body * vec3(0.8, 1.05, 1.15), uSeason.w);
        vec3 water = under * absorb + body * (1.0 - exp(-path * 0.6));

        vec3 col = mix(water, refl, F);

        // sun glitter (the key light, moon at night)
        vec3 L = uSunDir;
        vec3 H = normalize(L + V);
        float nh = max(dot(N, H), 0.0);
        // the sharp lobe rides the long ripple crests; a fine twinkling mask breaks those lines into glitter
        float tw = sfNoise(wp.xz * 7.0 + vec2(uTime * 1.7, -uTime * 1.1)) * 0.6 + sfNoise(wp.xz * 15.0 - vec2(uTime * 2.3, uTime * 0.7)) * 0.4;
        float spec = pow(nh, 600.0) * 18.0 * smoothstep(0.5, 0.78, tw) * 2.8 + pow(nh, 90.0) * 0.6;
        col += uSunCol * spec * smoothstep(-0.02, 0.05, L.y);

        // lantern glints: each lamp's image smeared into a column by the ripples
        for (int i = 0; i < ${MAX_LAMPS}; i++){
          vec4 lp = uLampPos[i];
          vec3 Ld = lp.xyz - wp;
          float ld = length(Ld);
          if (ld > 60.0) continue;
          vec3 Hl = normalize(Ld / ld + V);
          float g = pow(max(dot(N, Hl), 0.0), 420.0) * 4.0;
          col += uLampCol[i] * g / (1.0 + ld * ld * 0.008);
        }

        // foam: hull, wake and a thin line at the shore
        float shore = smoothstep(0.45, 0.0, thick2 * max(V.y, 0.2)) * (0.4 + 0.6 * sfNoise(wp.xz * 1.7 - flow * uTime * 2.0));
        // the submerged ro is not a shore: keep the shallow-water foam off the line from its entry to past the blade
        vec2 oA = wp.xz - uOar.xy, oB = (uOar.zw - uOar.xy) * 1.3;
        float offOar = smoothstep(0.12, 0.45, length(oA - oB * clamp(dot(oA, oB) / max(dot(oB, oB), 1e-4), 0.0, 1.0)));
        // nor is the hull: where what the surface hides is the boat's own planking, it is not shallow water
        vec3 bpU = (uBoatInv * vec4(cameraPosition + (wp - cameraPosition) * (sceneZ / vViewZ), 1.0)).xyz;
        float offBoat = 1.0 - (1.0 - smoothstep(0.85, 1.1, abs(bpU.x))) * step(-4.45, bpU.z) * step(bpU.z, 4.75) * step(-0.5, bpU.y);
        foam += shore * 0.55 * (1.0 - lake * 0.6) * offHull * offBoat * offOar * (0.35 + 0.65 * smoothstep(0.35, 0.8, speed));
        foam = clamp(foam, 0.0, 1.0) * smoothstep(0.2, 0.7, sfNoise(wp.xz * 3.1 - flow * uTime * 1.5) + foam * 0.5);
        vec3 foamCol = (uAmbUp * 0.85 + uSunCol * max(uSunDir.y, 0.0) * 0.1) * 1.05;
        col = mix(col, foamCol, foam * 0.78);

        // hanaikada: in spring, fallen petals drift in rafts along the banks below the avenue, drawn out by the current
        float petK = uSeason.x * smoothstep(-200.0, -250.0, wp.z) * smoothstep(-780.0, -680.0, wp.z) * (1.0 - lake);
        if (petK > 0.01) {
          vec2 pq = wp.xz - flow * uTime * 0.9;
          vec2 ps = vec2(pq.x * 0.55, pq.y * 0.14);
          float band = smoothstep(0.45, 0.95, abs(across) + (sfNoise(ps * 0.7) - 0.5) * 0.5);
          float raft = smoothstep(0.42, 0.66, sfNoise(ps) * 0.6 + sfNoise(pq * 0.9) * 0.4) * band;
          // a raft is a mat of overlapping petals: ragged edges, granular inside, open water showing through
          float mat = smoothstep(0.48, 0.92, raft + (sfNoise(pq * 2.7) - 0.5) * 0.5);
          float grain = mix(smoothstep(0.25, 0.75, sfNoise(pq * 17.0) * 0.6 + sfNoise(pq * 41.0) * 0.4), 0.5, smoothstep(0.008, 0.03, petPx));
          float pet = max(sfPetals(pq, 0.06 + raft * 0.9 + band * 0.08, petPx), mat * mix(0.15, 0.8, grain));
          vec3 pcol = vec3(0.8, 0.46, 0.55) * mix(0.8, 1.05, grain) * (uAmbUp * 1.1 + uSunCol * max(uSunDir.y, 0.0) * 0.12);
          col = mix(col, pcol, clamp(pet, 0.0, 1.0) * petK);
        }

        // soft edge into the shore
        col = mix(under, col, smoothstep(0.0, 0.12, thick));

        col = sfAtmos(col, wp);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const geo = new THREE.PlaneGeometry(1400, 3900, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, (T_Z0 + T_Z1) / 2);
  mesh.layers.set(LAYER_WATER);
  mesh.frustumCulled = false;
  mesh.name = 'water';
  return { mesh, material: mat, uniforms };
}

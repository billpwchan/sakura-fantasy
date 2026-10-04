// Scanned props (Poly Haven, CC0): mossy rocks half-sunk at the waterline, in the shallows and on the banks;
// ferns in the shade; a few stumps and fallen trunks. From Sketchfab (CC BY 4.0, credited in the About sheet):
// a pair of komainu at the river gates and the jizo by the wayside shrine.
// Placement is deterministic and instanced per mesh, so a few thousand props cost a few dozen draws.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { patch, WIND_GLSL, ktx2 } from '../core/shared.js';
import { LEAF_VERT } from './trees.js';
import { rng, smoothstep, vnoise } from '../lib/math.js';
import { riverAt, terrainHeight, waterSd, forestAt, terrainNormal, LAKE, ISLAND, Z_START } from './layout.js';
import { LAYER_NOREFL } from '../core/pipeline.js';
import { blocked, SITES } from './sites.js';

const BASE = './assets/models/';
const FILES = ['rock_moss_set_01', 'rock_moss_set_02', 'fern_02', 'tree_stump_01', 'dead_tree_trunk', 'komainu_moss', 'komainu_stone', 'jizo'];
// pieces that stand together (a statue on its pedestal) share one origin instead of each centring on its own
const WHOLE = new Set(['komainu_moss', 'komainu_stone', 'jizo']);

// every mesh of a loaded scene baked into world space, in source order; a mirrored node turns its triangles
// inside out once baked, so its winding is restored
function bakeParts(scene) {
  scene.updateMatrixWorld(true);
  const parts = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const geo = floatAttributes(o.geometry.clone()).applyMatrix4(o.matrixWorld);
    if (o.matrixWorld.determinant() < 0 && geo.index) {
      const ix = geo.index.array;
      for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
      const tg = geo.attributes.tangent;
      if (tg) for (let i = 0; i < tg.count; i++) tg.setW(i, -tg.getW(i));
    }
    geo.computeBoundingBox();
    parts.push({ geo, mat: o.material });
  });
  return parts;
}

// meshopt stores quantised integers; baking a transform into them would clip, so they become floats first
function floatAttributes(geo) {
  for (const [k, a] of Object.entries(geo.attributes)) {
    if (!a.normalized && !a.isInterleavedBufferAttribute && a.array instanceof Float32Array) continue;
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c);
    geo.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize));
  }
  return geo;
}

// the quick tier: decimated meshes and 1K textures, enough to start the journey
export async function loadProps(onProgress) {
  const loader = new GLTFLoader();
  const out = {};
  let done = 0;
  await Promise.all(FILES.map(async (id) => {
    const parts = bakeParts((await loader.loadAsync(BASE + id + '.glb')).scene);
    const all = new THREE.Box3();
    for (const p of parts) all.union(p.geo.boundingBox);
    // each part stands on its own origin (centred, base at y = 0), or the whole set does
    for (const p of parts) {
      const b = WHOLE.has(id) ? all : p.geo.boundingBox;
      p.offset = new THREE.Vector3(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
      p.geo.translate(p.offset.x, p.offset.y, p.offset.z);
      p.geo.computeBoundingBox();
      p.geo.computeBoundingSphere();
      p.size = (WHOLE.has(id) ? all : p.geo.boundingBox).getSize(new THREE.Vector3());
    }
    out[id] = parts;
    onProgress && onProgress(++done / FILES.length);
  }));
  return out;
}

// the full tier, streamed once the journey is under way: the scans at their real detail with 2K GPU-compressed
// textures. Each part is moved by its quick twin's offset so the two tiers coincide exactly.
export async function loadPropsHi(renderer, lo) {
  const loader = new GLTFLoader().setKTX2Loader(ktx2(renderer)).setMeshoptDecoder(MeshoptDecoder);
  const out = {};
  await Promise.all(FILES.map(async (id) => {
    const hi = bakeParts((await loader.loadAsync(BASE + 'hi/' + id + '.glb')).scene);
    if (hi.length !== lo[id].length) throw new Error(`props: ${id} has ${hi.length} parts in the full tier, ${lo[id].length} in the quick one`);
    // the pipelines may order the parts differently: pair each with the quick part that sat in the same place
    const c = new THREE.Vector3(), d = new THREE.Vector3();
    out[id] = lo[id].map((q) => {
      q.geo.boundingBox.getCenter(c).sub(q.offset);
      let best = null, bd = Infinity;
      for (const h of hi) { const dd = h.geo.boundingBox.getCenter(d).distanceTo(c); if (dd < bd) { bd = dd; best = h; } }
      best.geo.translate(q.offset.x, q.offset.y, q.offset.z);
      best.geo.computeBoundingSphere();
      return best;
    });
  }));
  return out;
}

// The scans are ochre field stones; a Japanese river runs over grey andesite with moss on the tops. The scan
// keeps its shape and normals, the colour is regraded toward grey, moss grows on up-facing faces, a world-space
// lichen detail restores texel density up close, and a dark wet band with algae marks the waterline.
function rockMaterial(src, key, tex, wood) {
  const m = src.clone();
  m.roughness = 1;
  m.metalness = 0;
  patch(m, {
    key: 'prop-' + key, snow: 1, wet: 0.9,
    uniforms: { tDetail: { value: tex.lichen_rock_c } },
    fragHead: 'uniform sampler2D tDetail;',
    hooks: {
      preLight: wood ? /* glsl */ `
        {
          float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l) * vec3(1.05, 0.98, 0.9), 0.35);
          float moss = smoothstep(0.35, 0.85, sfNW.y + (sfNoise(vSfWP.xz * 2.1) - 0.5) * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.17, 0.05) * (0.7 + l * 1.5), moss * 0.75 * (1.0 - uSeason.w * 0.5));
        }` : /* glsl */ `
        {
          vec3 an = abs(sfNW); an /= an.x + an.y + an.z;
          vec3 dt = texture2D(tDetail, vSfWP.zy * 0.45).rgb * an.x + texture2D(tDetail, vSfWP.xz * 0.45).rgb * an.y + texture2D(tDetail, vSfWP.xy * 0.45).rgb * an.z;
          float dl = dot(dt, vec3(0.3, 0.59, 0.11));
          float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          vec3 stone = vec3(0.36, 0.37, 0.36) * (0.45 + l * 2.6) * (0.55 + dl * 1.6);
          stone *= mix(vec3(1.0), vec3(1.06, 1.0, 0.92), sfNoise(vSfWP.xz * 0.7));
          float n = sfNoise(vSfWP.xz * 1.7 + vSfWP.y) * 0.65 + sfNoise(vSfWP.xz * 6.3) * 0.35;
          // river moss is a deep, cool green, yellowing only at the sunlit tips; in patches, with the stone between
          float moss = smoothstep(0.5, 0.82, sfNW.y * 0.75 + n * 0.55 + l * 0.6 - 0.18);
          vec3 mossCol = mix(vec3(0.055, 0.09, 0.03), vec3(0.13, 0.16, 0.05), n * n) * (0.65 + dl * 1.0);
          mossCol = mix(mossCol, vec3(0.3, 0.22, 0.1) * (0.6 + dl), uSeason.z * 0.6);
          vec3 c = mix(stone, mossCol, moss * (1.0 - uSeason.w * 0.6));
          // wet band and slime just above and under the waterline
          float wl = vSfWP.y - 0.04 * sin(uTime * 0.9 + vSfWP.x * 1.3 + vSfWP.z);
          c *= mix(0.42, 1.0, smoothstep(-0.05, 0.32, wl));
          c = mix(c, vec3(0.1, 0.11, 0.05), smoothstep(0.05, -0.25, wl) * 0.6);
          diffuseColor.rgb = c;
          #ifdef STANDARD
            roughnessFactor = mix(0.45, 1.0, smoothstep(-0.05, 0.3, wl));
          #endif
        }`,
    },
  });
  return m;
}

// carved stone keeps its scanned colour; it takes the snow and the rain like everything else
// (the scans' colour is baked dark, the mossy one darkest; weathered granite is pale)
const SCAN_LIFT = { komainu_moss: 1.55, komainu_stone: 1.35, jizo: 1.15 };
function scanMaterial(src, key) {
  const m = src.clone();
  m.metalness = 0;
  m.color.setScalar(SCAN_LIFT[key]);
  patch(m, { key: 'prop-' + key, snow: 1, wet: 0.8 });
  return m;
}

// ferns sway with the same wind as the trees and turn with the seasons
function plantMaterial(src, key, stiff) {
  const m = src.clone();
  m.alphaTest = 0.5;
  m.alphaToCoverage = true;
  m.transparent = false;
  m.side = THREE.DoubleSide;
  m.roughness = 0.85;
  m.metalness = 0;
  patch(m, {
    key: 'prop-' + key, snow: 0.6, wet: 0.3, wrap: 0.5,
    vertexHead: `#define SF_STIFF ${stiff.toFixed(3)}\n${WIND_GLSL}\nvarying float vSeedP;`,
    fragHead: 'varying float vSeedP;',
    hooks: {
      vertex: LEAF_VERT + `
        #ifdef USE_INSTANCING
          vSeedP = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        #else
          vSeedP = 0.5;
        #endif`,
      map: /* glsl */ `
        {
          vec3 c = diffuseColor.rgb;
          float l = dot(c, vec3(0.3, 0.55, 0.15));
          vec3 su = c * vec3(0.85, 0.95, 0.8);
          vec3 au = vec3(l * 1.7, l * 1.15, l * 0.45);
          vec3 wi = vec3(l * 1.1, l * 0.95, l * 0.75);
          diffuseColor.rgb = c * uSeason.x + su * uSeason.y + au * uSeason.z + wi * uSeason.w;
          diffuseColor.rgb *= 0.85 + 0.3 * vSeedP;
        }`,
    },
  });
  return m;
}

export function createProps(props, tex) {
  const group = new THREE.Group();
  group.name = 'props';
  const R = rng(9001);
  const bins = new Map(); // `${id}:${part}` -> [matrices]
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  const nrm = [0, 1, 0];
  const add = (id, part, x, y, z, s, yaw, tiltX = 0, tiltZ = 0) => {
    e.set(tiltX, yaw, tiltZ, 'YXZ');
    q.setFromEuler(e);
    m4.compose(ps.set(x, y, z), q, sc.setScalar(s));
    // binned by 160 m of valley so whole stretches drop out of the frame when far away
    const k = id + ':' + part + ':' + Math.floor((Z_START - z) / 160);
    if (!bins.has(k)) bins.set(k, []);
    bins.get(k).push(m4.clone());
  };
  const free = (x, z, m = 2) => !blocked(x, z, m) && Math.hypot(x - ISLAND.x, z - ISLAND.z) > ISLAND.r + 3;
  const ROCKS = [['rock_moss_set_01', props.rock_moss_set_01.length], ['rock_moss_set_02', props.rock_moss_set_02.length]];
  // a rock settles into the ground: sunk by a share of its height, tipped with the slope
  // one standing in the water must still break the surface, or it is wasted under the reflection
  const rock = (x, z, s, sink, big = R.next() < 0.45) => {
    const [id, n] = ROCKS[big ? 0 : 1];
    const part = Math.floor(R.next() * n);
    const h = props[id][part].size.y * s;
    const ground = terrainHeight(x, z);
    if (ground + h * (1 - sink) < 0.25) return false;
    terrainNormal(x, z, 1.2, nrm);
    add(id, part, x, ground - h * sink, z, s, R.next() * Math.PI * 2, nrm[2] * 0.5 + R.range(-0.12, 0.12), -nrm[0] * 0.5 + R.range(-0.12, 0.12));
    return true;
  };

  // the waterline: clusters on both banks, thicker in the gorge, sparse past the village embankment
  for (let z = Z_START - 10; z > -2150; z -= R.range(7, 15)) {
    const r = riverAt(z);
    const gorge = z < -1200 && z > -1620;
    const embank = z < -790 && z > -1130;
    for (const side of [-1, 1]) {
      if (R.next() > (gorge ? 0.9 : embank ? 0.12 : 0.6)) continue;
      // find the shore line by stepping out from the centre
      let x = r.x + side * r.w * 0.7;
      for (let i = 0; i < 40 && waterSd(x, z) < 0; i++) x += side * 0.5;
      const zz = z + R.range(-3, 3);
      if (!free(x, zz, 3)) continue;
      const k = R.int(1, gorge ? 5 : 4);
      for (let i = 0; i < k; i++) {
        const xx = x + side * R.range(-2.6, 1.5), z2 = zz + R.range(-3, 3);
        if (Math.abs(xx - r.x) < Math.max(1.5, r.w * 0.55 - 2.5) + 2.2) continue;
        rock(xx, z2, i === 0 ? R.range(0.6, 1.25) : R.range(0.3, 0.75), R.range(0.25, 0.45), i === 0 && R.next() < 0.65);
      }
    }
  }
  // the lake shore
  for (let a = 0; a < Math.PI * 2; a += R.range(0.05, 0.12)) {
    if (R.next() < 0.45) continue;
    const rr = LAKE.r * (1 + 0.06 * Math.sin(a * 3 + 1.2) + 0.04 * Math.sin(a * 7 - 0.4)) + R.range(-2.5, 1.5);
    const x = LAKE.x + Math.cos(a) * rr, z = LAKE.z + Math.sin(a) * rr;
    if (z > -2160 || !free(x, z, 3)) continue;
    rock(x, z, R.range(0.35, 0.9), R.range(0.3, 0.5));
  }
  // banks and lower slopes: scattered boulders, ferns in the shade, the odd stump or fallen trunk
  const STEP = 4;
  for (let z = Z_START; z > -2300; z -= STEP) {
    const cx = riverAt(z).x;
    for (let dx = -95; dx <= 95; dx += STEP) {
      const x = cx + dx + R.range(-1.8, 1.8), zz = z + R.range(-1.8, 1.8);
      const sd = waterSd(x, zz);
      if (sd < 1.2 || sd > 85) continue;
      if (!free(x, zz, 1.5)) continue;
      const h = terrainHeight(x, zz);
      const f = forestAt(x, zz, h, sd);
      const gorge = zz < -1200 && zz > -1620;
      terrainNormal(x, zz, 1.0, nrm);
      const steep = 1 - nrm[1];
      const roll = R.next();
      const shade = Math.max(f, gorge ? 0.8 : 0);
      if (roll < 0.014 + steep * 0.05 + (gorge ? 0.03 : 0) + (sd < 10 ? 0.03 : 0)) { rock(x, zz, R.range(0.3, 1.0), R.range(0.35, 0.6)); continue; }
      // ferns gather in shade and along the gorge, in loose drifts
      if (roll < 0.03 + shade * 0.11 + (sd < 14 ? 0.05 : 0) && sd < 55 && nrm[1] > 0.55 && vnoise(x * 0.08, zz * 0.08) > 0.42) {
        const n = R.int(3, 7);
        for (let i = 0; i < n; i++) {
          const fx = x + R.range(-2.2, 2.2), fz = zz + R.range(-2.2, 2.2);
          if (waterSd(fx, fz) < 0.8) continue;
          add('fern_02', Math.floor(R.next() * props.fern_02.length), fx, terrainHeight(fx, fz) - 0.05, fz, R.range(1.3, 2.3), R.next() * 6.283, R.range(-0.1, 0.1), R.range(-0.1, 0.1));
        }
        continue;
      }
      if (roll > 0.9985 && sd > 4 && sd < 40 && nrm[1] > 0.85) {
        if (R.next() < 0.55) add('tree_stump_01', 0, x, h - 0.12, zz, R.range(0.7, 1.1), R.next() * 6.283);
        else {
          // a fallen trunk lies along the slope, half in the litter
          add('dead_tree_trunk', 0, x, h - 0.1, zz, R.range(1.2, 2.2), R.next() * 6.283, 0, -nrm[0] * 0.4);
        }
      }
    }
  }

  // the komainu face across the river and a little upstream, toward the boat coming up to the gates;
  // the jizo face the water. FACE turns each scan's own front onto +z
  const FACE = { komainu_moss: Math.PI / 2, komainu_stone: Math.PI / 2, jizo: 0 };
  for (const k of SITES.komainu) {
    const id = k.side < 0 ? 'komainu_moss' : 'komainu_stone';
    const s = 1.75 / props[id][0].size.y;
    const yaw = Math.atan2(-k.side, 0.55) + FACE[id];
    for (let i = 0; i < props[id].length; i++) add(id, i, k.x, k.y - 0.04, k.z, s, yaw);
  }
  for (const [i, j] of SITES.jizo.entries()) {
    const s = R.range(1.3, 1.55);
    const y = terrainHeight(j.x, j.z) - 0.03;
    for (let p = 0; p < props.jizo.length; p++) add('jizo', p, j.x, y, j.z, s, Math.PI / 2 + FACE.jizo + (i % 3 - 1) * 0.08);
  }

  const mats = {};
  const matFor = (id, part) => {
    const k = WHOLE.has(id) ? id + part : id;
    if (mats[k]) return mats[k];
    const src = props[id][part].mat;
    if (WHOLE.has(id)) mats[k] = scanMaterial(src, id);
    else if (id.startsWith('rock') || id === 'tree_stump_01' || id === 'dead_tree_trunk') mats[k] = rockMaterial(src, id, tex, !id.startsWith('rock'));
    else mats[k] = plantMaterial(src, id, 0.6);
    return mats[k];
  };
  let instances = 0, tris = 0;
  const lods = [];
  const binsOf = new Map(); // `${id}:${part}` -> bins of that part along the valley
  for (const [k, list] of bins) {
    const [id, part] = k.split(':');
    const p = props[id][+part];
    const im = new THREE.InstancedMesh(p.geo, matFor(id, +part), list.length);
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = true;
    im.receiveShadow = true;
    im.matrixAutoUpdate = false;
    im.name = k;
    const plant = id === 'fern_02';
    // small plants stay out of the mirror and fade from the frame beyond a couple of hundred metres
    if (plant) im.layers.set(LAYER_NOREFL);
    lods.push({ im, far: plant ? 230 : id.startsWith('rock') ? 700 : WHOLE.has(id) ? 220 : 300 });
    const pk = id + ':' + part;
    if (!binsOf.has(pk)) binsOf.set(pk, []);
    binsOf.get(pk).push({ im, list, pos: list.map((mm) => new THREE.Vector3().setFromMatrixPosition(mm)) });
    group.add(im);
    instances += list.length;
    tris += list.length * (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3;
  }
  // Near the camera every scan is drawn from the full tier once it has arrived; beyond, the quick tier carries on.
  // Instances inside the radius move out of their bin into a near pool, so each pass (view, shadow, mirror)
  // draws every prop exactly once. [radius m, most instances drawn at full detail]
  const NEAR = {
    rock_moss_set_01: [45, 160], rock_moss_set_02: [45, 160], fern_02: [26, 240], tree_stump_01: [70, 12],
    dead_tree_trunk: [70, 12], komainu_moss: [60, 2], komainu_stone: [60, 2], jizo: [45, 6],
  };
  const pools = [];
  const last = new THREE.Vector3(1e9, 0, 0);
  group.userData.upgrade = (hi, reflection, aniso) => {
    const old = new Set();
    for (const [pk, list] of binsOf) {
      const [id, part] = pk.split(':');
      const h = hi[id][+part];
      const mat = list[0].im.material;
      // the quick tier wears the full tier's textures from here on: same atlas, same slots, no recompile
      for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
        if (!mat[slot] || !h.mat[slot] || mat[slot] === h.mat[slot]) continue;
        old.add(mat[slot]);
        h.mat[slot].anisotropy = aniso;
        mat[slot] = h.mat[slot];
      }
      const [r, cap] = NEAR[id];
      const im = new THREE.InstancedMesh(h.geo, mat, cap);
      im.count = 0;
      im.castShadow = im.receiveShadow = true;
      im.matrixAutoUpdate = false;
      im.layers.mask = list[0].im.layers.mask;
      im.name = pk + ':near';
      group.add(im);
      pools.push({ im, r, r2: r * r, cap, bins: list });
      // the ripples break the reflection up; the quick mesh is plenty there
      reflection.lod.push([im, props[id][+part].geo]);
    }
    for (const t of old) t.dispose();
    last.set(1e9, 0, 0);
  };
  const restore = (b) => {
    b.list.forEach((mm, i) => b.im.setMatrixAt(i, mm));
    b.im.count = b.list.length;
    b.im.instanceMatrix.needsUpdate = true;
  };
  const refresh = (cp) => {
    for (const P of pools) {
      let n = 0;
      for (const b of P.bins) {
        // each bin keeps the sphere of all its instances from the build
        const bs = b.im.boundingSphere;
        if (bs.center.distanceTo(cp) - bs.radius > P.r) {
          if (b.im.count !== b.list.length) restore(b);
          continue;
        }
        let m = 0;
        for (let i = 0; i < b.list.length; i++) {
          if (n < P.cap && b.pos[i].distanceToSquared(cp) < P.r2) P.im.setMatrixAt(n++, b.list[i]);
          else b.im.setMatrixAt(m++, b.list[i]);
        }
        b.im.count = m;
        b.im.instanceMatrix.needsUpdate = true;
      }
      P.im.count = n;
      P.im.instanceMatrix.needsUpdate = true;
      if (n) P.im.computeBoundingSphere();
    }
  };
  const v = new THREE.Vector3();
  group.userData.update = (camera) => {
    for (const l of lods) {
      const bs = l.im.boundingSphere;
      l.im.visible = v.copy(bs.center).distanceTo(camera.position) - bs.radius < l.far;
    }
    // re-sort every metre and a half of travel
    if (pools.length && camera.position.distanceToSquared(last) > 2.25) {
      last.copy(camera.position);
      refresh(last);
    }
  };
  group.userData.stats = { draws: bins.size, instances, tris: Math.round(tris), by: Object.fromEntries([...bins].map(([k, l]) => [k, l.length])) };
  return group;
}

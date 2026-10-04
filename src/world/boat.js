// The tomabune: a long wooden river boat with a reed canopy, a bow lantern, a boatman sculling the ro at the
// stern and a passenger under a red wagasa. The boat is a built model (planks, nails, toma, cargo, ro, lantern);
// both people are sculpted, dressed and rigged figures (figures.js); everything is animated per frame.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Kit, archMaterials } from './architecture.js';
import { U, patch, ktx2 } from '../core/shared.js';
import { createPassenger, createWagasa, createBoatman, headLook } from './figures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- the boat model: the hull with its fittings, canopy and cargo in one node, the ro and the lantern on their own
const BOAT_URL = './assets/models/';
async function loadGLB(renderer, url, onProgress) {
  const g = await new GLTFLoader().setKTX2Loader(ktx2(renderer)).setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(url, (e) => { if (onProgress && e.total) onProgress(e.loaded / e.total); });
  return g.scene;
}
export const loadBoat = (renderer, onProgress) => loadGLB(renderer, BOAT_URL + 'boat.glb', onProgress);
// the same boat with 2K textures, streamed in after the first frame
export const loadBoatHi = (renderer) => loadGLB(renderer, BOAT_URL + 'hi/boat.glb');

// the river leaves its mark on the outside of the hull: below the surface the planks darken, green and stay wet
function boatMaterial(m) {
  m.aoMapIntensity = 0.75;
  patch(m, {
    key: 'boat-' + m.name,
    snow: m.name.includes('toma') || m.name.includes('straw') ? 1.2 : 1,
    wet: 0.8,
    hooks: {
      map: /* glsl */ `
        {
          vec3 nw = inverseTransformDirection(normalize(vNormal), viewMatrix);
          vec2 rt = vec2(cos(uBoat.z), -sin(uBoat.z));
          float out_ = max(step(0.3, dot(nw.xz, rt) * sign(dot(vSfWP.xz - uBoat.xy, rt))), step(0.5, -nw.y));
          float wl = smoothstep(0.09, -0.03, vSfWP.y) * out_;
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.4, 0.46, 0.36), wl);
          sfHullWet = wl;
        }`,
      normal: 'roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.4, sfHullWet);',
    },
    fragHead: 'float sfHullWet = 0.0;',
  });
  return m;
}

// lit washi: the flame glows through the paper, the mon and the ribs stand dark against it
function paperMaterial(m) {
  patch(m, {
    key: 'boat-paper',
    snow: 0.3,
    wet: 0.4,
    hooks: {
      preLight: /* glsl */ `
        {
          float tr = dot(diffuseColor.rgb, vec3(0.3333));
          float g = uLampOn * smoothstep(0.25, 0.7, tr);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.4, uLampOn * 0.6);
          totalEmissiveRadiance += vec3(1.0, 0.52, 0.2) * g * 2.6 * (0.88 + 0.12 * sin(uTime * 7.0 + vSfWP.x * 3.0));
        }`,
    },
  });
  return m;
}

const SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'];

// mino: the straw rain cape, three tiers of loose stalks over the shoulders and back, open at the front for the
// arms; put on when it rains or snows
const MINO = [0.5, 0.4, 0.24];
function mino(mats, seed = 5) {
  const kit = new Kit();
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const up = V(0, 1, 0), q = new THREE.Quaternion(), m = new THREE.Matrix4();
  const tiers = [[0.5, 0.15, 0.13, 0.3, 46], [0.3, -0.08, 0.22, 0.36, 54], [0.08, -0.42, 0.27, 0.42, 62]];
  for (const [y0, y1, r0, r1, n] of tiers) {
    for (let i = 0; i < n; i++) {
      // from the back (-z) round both sides; the front quarter stays open
      const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * Math.PI * 1.62 + (rnd() - 0.5) * 0.06;
      const len = (y0 - y1) * (0.9 + rnd() * 0.3);
      const top = V(Math.cos(a) * r0, y0, Math.sin(a) * r0 * 0.78);
      const bot = V(Math.cos(a) * r1 * (0.95 + rnd() * 0.12), y0 - len, Math.sin(a) * r1 * 0.78 * (0.95 + rnd() * 0.12));
      const d = bot.clone().sub(top);
      const L = d.length();
      q.setFromUnitVectors(up, d.normalize());
      const g = new THREE.BoxGeometry(0.03 + rnd() * 0.02, L, 0.008);
      const k = 0.8 + rnd() * 0.35;
      kit.add('thatch', g, [MINO[0] * k, MINO[1] * k, MINO[2] * k * (0.9 + rnd() * 0.2)], 0, false, m.compose(top.clone().add(bot).multiplyScalar(0.5), q, V(1, 1, 1)));
    }
  }
  // the woven yoke round the neck
  kit.add('thatch', new THREE.TorusGeometry(0.13, 0.03, 6, 18).rotateX(Math.PI / 2).scale(1, 1, 0.8), MINO, 0, false, m.makeTranslation(0, 0.49, 0));
  return kit.build(mats, 'mino');
}

export function createBoat(tex, src, figs) {
  const mats = archMaterials(tex);
  mats.wood.side = THREE.DoubleSide;
  mats.thatch.side = THREE.DoubleSide;
  mats.paint.side = THREE.DoubleSide;

  const root = new THREE.Group();
  root.name = 'boat';

  // ---- the boat model
  const ropeMats = [];
  src.traverse((o) => {
    if (!o.isMesh) return;
    o.userData.boatPart = true;
    if (o.material.userData.sfBoat) return;
    o.material.userData.sfBoat = true;
    if (o.material.name === 'paper') paperMaterial(o.material);
    else boatMaterial(o.material);
    if (o.material.name === 'rope') ropeMats.push(o.material);
  });
  const hullNode = src.getObjectByName('hull');
  const roNode = src.getObjectByName('ro');
  const lanternNode = src.getObjectByName('lantern');
  root.add(hullNode, lanternNode);

  // ---- the passenger, seiza on her zabuton forward of the canopy, a janome wagasa in her left hand resting back
  // against her shoulder
  const SEAT_Z = 1.8;
  const pas = createPassenger(figs.passenger);
  const seat = new THREE.Group();
  seat.position.set(0, -0.05, SEAT_Z);
  seat.add(pas.root);
  root.add(seat);
  const look = headLook(pas);
  const umbrella = new THREE.Group();
  umbrella.add(createWagasa(figs.wagasa));
  root.add(umbrella);
  // her fist, and the shaft's lean back over her shoulder; she holds it 12 cm above the end
  const HAND = V(0.14, 0.42, 0.24).add(seat.position);
  const SHAFT = V(0.04, 0.927, -0.374).normalize();
  const GRIP_AT = 0.12;

  // ---- the boatman sculls from the port side of the stern, facing the ro across his body; he stands on his waraji
  const man = createBoatman(figs.boatman);
  const rower = new THREE.Group();
  const ROWER = V(-0.03, -0.0355, -3.12);
  rower.position.copy(ROWER);
  rower.rotation.y = 1.25;
  rower.add(man.root);
  root.add(rower);
  // the mino goes on over his shoulders when it rains or snows
  const cape = mino(mats);
  cape.visible = false;
  man.attach(cape, 'spine_03', V(0, 0.84, 0));

  // the ro rides the thole pin at the stern quarter; its node keeps its own (dequantising) transform inside a pivot
  const oar = new THREE.Group();
  oar.add(roNode);
  oar.position.set(0.42, 0.62, -3.85);
  root.add(oar);
  const GRIP = V(0, 0.4, 0.93), LOOM = V(0, 0.28, 0.66);
  // the hayao: a rope from the grip down to the floor that the boatman leans against
  // a unit length of straw rope, stretched each frame from the floor eye to the grip
  const ropeMat = ropeMats[0].clone();
  for (const slot of SLOTS) {
    if (!ropeMat[slot]) continue;
    ropeMat[slot] = ropeMat[slot].clone();
    ropeMat[slot].offset.set(0, 0); ropeMat[slot].repeat.set(1, 1); ropeMat[slot].rotation = 0; ropeMat[slot].channel = 0;
  }
  ropeMat.aoMap = null;
  boatMaterial(ropeMat);
  ropeMat.customProgramCacheKey = () => 'boat-hayao';
  const rg = new THREE.CylinderGeometry(0.008, 0.008, 1, 7, 1, true).translate(0, 0.5, 0);
  const ruv = rg.attributes.uv;
  for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) * 0.45, ruv.getY(i) * 5);
  const rope = new THREE.Mesh(rg, ropeMat);
  rope.name = 'hayao';
  root.add(rope);
  const ROPE_FOOT = V(0.4, -0.04, -2.86);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.matrixAutoUpdate = true; } });

  const lamp = { x: 0, y: -999, z: 0, r: 7, k: 1, c: [2.2, 1.1, 0.4] };
  const inv = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  const tmp = new THREE.Vector3();
  const g = V(0, 0, 0), g2 = V(0, 0, 0), gw = V(0, 0, 0), gw2 = V(0, 0, 0), fwd = V(0, 0, 0);
  const qr = new THREE.Quaternion(), qHands = new THREE.Quaternion();
  const ax = V(0, 0, 0), qSpin = new THREE.Quaternion(), UP = V(0, 1, 0);
  let phase = 0;
  // where the ro meets the river, for the water: the loom's entry point and the blade below it (world xz), and the
  // eddies the blade sheds each time the sweep turns, left behind in the river (x, z, birth time, spin)
  const oarW = new THREE.Vector4(0, -99999, 0, -99999);
  const eddies = Array.from({ length: 8 }, () => new THREE.Vector4(0, -99999, -1e3, 0));
  const LOOM_TOP = V(0, 0, 0), LOOM_KNEE = V(0, -0.6, -1.7), LOOM_END = V(0, -1.25, -3.1), BLADE = V(0, -1.1, -2.8);
  const oa = V(0, 0, 0), oe = V(0, 0, 0);
  let lastTurn = 0, eddyI = 0;
  // the bow's track, for the wake: [0] is the bow now, then a point every WAKE_STEP metres run (x, z, time, odometer)
  const WAKE_STEP = 4.5, BOW_Z = 2.6;
  const wake = Array.from({ length: 16 }, () => new THREE.Vector4(0, -99999, -1e3, 0));
  let odo = 0;

  // pose: x, z, heading (radians, 0 = -z), speed m/s, lean (steering)
  function update(dt, t, pose) {
    dress();
    const stroke = 0.65 + Math.min(pose.speed, 8) * 0.12;
    phase += dt * stroke * 2.2;
    const bob = Math.sin(t * 1.3) * 0.025 + Math.sin(t * 2.1 + 1.0) * 0.012;
    root.position.set(pose.x, 0.02 + bob, pose.z);
    root.rotation.set(Math.sin(t * 1.1 + 0.6) * 0.012 - pose.speed * 0.002, pose.heading, Math.sin(t * 0.9) * 0.02 + pose.lean * 0.06, 'YXZ');

    // sculling: the loom sweeps across while the blade feathers; the boatman's hands ride the grip
    const sw = Math.sin(phase);
    oar.rotation.set(0.04 * Math.sin(phase * 2.0), 0.3 * sw, 0.28 * Math.cos(phase), 'YXZ');
    oar.updateMatrix();
    g.copy(GRIP).applyMatrix4(oar.matrix);
    g2.copy(LOOM).applyMatrix4(oar.matrix);
    // he leans in as he pushes and settles back as he draws, his feet where they stand; his hands ride the ro
    const f = rower.rotation.y;
    fwd.set(Math.sin(f), 0, Math.cos(f));
    const hipShift = 0.05 * sw;
    const ahead = (g.x - ROWER.x) * fwd.x + (g.z - ROWER.z) * fwd.z - hipShift;
    const lean = Math.min(0.35, Math.max(-0.12, (ahead - 0.49) * 0.9));
    root.updateMatrixWorld(true);
    root.localToWorld(gw.copy(g));
    root.localToWorld(gw2.copy(g2));
    root.getWorldQuaternion(qr);
    qHands.copy(qr).multiply(oar.quaternion).multiply(qr.invert());
    // he looks where the boat is going, glancing at the water now and then
    man.pose({
      shift: hipShift, dip: 0.015 * Math.abs(sw), lean, turn: 0.1 * sw, grips: [gw, gw2], hands: qHands,
      look: [-lean * 0.8 + 0.04 * Math.sin(t * 0.4), -0.95 + 0.25 * Math.sin(t * 0.13), 0],
    });
    tmp.subVectors(g, ROPE_FOOT);
    rope.position.copy(ROPE_FOOT);
    rope.scale.set(1, tmp.length(), 1);
    rope.quaternion.setFromUnitVectors(UP, tmp.normalize());

    // the passenger turns her head to the banks; the wagasa turns slowly in her hand
    look(0.06 * Math.sin(t * 0.23) - 0.03, 0.42 * Math.sin(t * 0.11) + 0.14 * Math.sin(t * 0.37), 0.04 * Math.sin(t * 0.17));
    ax.set(SHAFT.x + 0.025 * Math.sin(t * 0.5), SHAFT.y, SHAFT.z + 0.02 * Math.sin(t * 0.41 + 1)).normalize();
    umbrella.quaternion.setFromUnitVectors(UP, ax).multiply(qSpin.setFromAxisAngle(UP, Math.sin(t * 0.35) * 0.5));
    umbrella.position.copy(HAND).addScaledVector(ax, -GRIP_AT);
    root.updateMatrixWorld(true);

    // the loom bends at its knee; find the straight run that crosses the surface
    oa.copy(LOOM_TOP).applyMatrix4(oar.matrixWorld);
    oe.copy(LOOM_KNEE).applyMatrix4(oar.matrixWorld);
    if (oe.y > 0) { oa.copy(oe); oe.copy(LOOM_END).applyMatrix4(oar.matrixWorld); }
    const wet = oa.y / Math.max(oa.y - oe.y, 1e-3);
    oarW.x = oa.x + (oe.x - oa.x) * wet;
    oarW.y = oa.z + (oe.z - oa.z) * wet;
    oe.copy(BLADE).applyMatrix4(oar.matrixWorld);
    oarW.z = oe.x;
    oarW.w = oe.z;
    const turn = Math.sign(Math.cos(phase));
    if (turn !== lastTurn && lastTurn !== 0) {
      eddies[eddyI].set(oe.x, oe.z, t, lastTurn);
      eddyI = (eddyI + 1) % eddies.length;
    }
    lastTurn = turn;

    odo += pose.speed * dt;
    const bx = pose.x + Math.sin(pose.heading) * BOW_Z, bz = pose.z + Math.cos(pose.heading) * BOW_Z;
    if (Math.hypot(bx - wake[1].x, bz - wake[1].y) > WAKE_STEP * 4) {
      // a jump to another stretch of river leaves no track behind
      for (const w of wake) w.set(bx, bz, t - 1e3, odo);
    } else if (odo - wake[1].w >= WAKE_STEP) {
      for (let i = wake.length - 1; i > 1; i--) wake[i].copy(wake[i - 1]);
      wake[1].set(bx, bz, t, odo);
    }
    wake[0].set(bx, bz, t, odo);

    // the river reads the hull: wake, hull ring, discard inside
    m.makeRotationY(pose.heading).setPosition(pose.x, 0, pose.z);
    inv.copy(m).invert();
    U.uBoat.value.set(pose.x, pose.z, pose.heading, pose.speed / 4);
    tmp.set(0, 1.82, 4.18).applyMatrix4(root.matrixWorld);
    lamp.x = tmp.x; lamp.y = tmp.y; lamp.z = tmp.z;
  }

  // the seat camera sits where her eyes are
  function seatView(on) { pas.head.scale.setScalar(on ? 1e-4 : 1); }
  function dress() { cape.visible = U.uRain.value > 0.25 || U.uSnow.value > 0.25; }

  // the 2K set takes the same slots (and the quick set's UV transforms, which the quantised UVs depend on)
  function upgrade(hi, aniso) {
    const byName = new Map();
    hi.traverse((o) => { if (o.isMesh) byName.set(o.material.name, o.material); });
    const old = new Set();
    root.traverse((o) => {
      if (!o.isMesh || !o.userData.boatPart) return;
      const h = byName.get(o.material.name);
      if (!h) return;
      for (const slot of SLOTS) {
        const a = o.material[slot], b = h[slot];
        if (!a || !b || a === b) continue;
        b.offset.copy(a.offset); b.repeat.copy(a.repeat); b.rotation = a.rotation; b.center.copy(a.center);
        b.channel = a.channel;
        b.anisotropy = aniso;
        old.add(a);
        o.material[slot] = b;
      }
    });
    for (const t of old) t.dispose();
  }

  return { root, update, upgrade, inv, lamp, oarW, eddies, wake, seatView, seatZ: SEAT_Z, get phase() { return phase; } };
}

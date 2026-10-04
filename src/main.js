import * as THREE from 'three';
import { U } from './core/shared.js';
import { Pipeline, LAYER_NOREFL } from './core/pipeline.js';
import { loadTextures } from './core/assets.js';
import { Environment } from './env/environment.js';
import { createSky } from './world/sky.js';
import { createTerrain } from './world/terrain.js';
import { generateWorld } from './world/generate.js';
import { createGrass } from './world/grass.js';
import { createWater } from './world/water.js';
import './world/sites.js';
import { createFoliageTextures } from './world/foliage-tex.js';
import { createTrees, createSacredTree } from './world/trees.js';
import { loadProps, loadPropsHi, createProps } from './world/props.js';
import { createWaterfall } from './world/waterfall.js';
import { createArchitecture } from './world/architecture.js';
import { terrainHeight, ISLAND, PLACES } from './world/layout.js';
import { SITES } from './world/sites.js';
import { createBoat, loadBoat, loadBoatHi } from './world/boat.js';
import { loadFigures } from './world/figures.js';
import { Journey } from './journey/journey.js';
import { Director } from './journey/camera.js';
import { smoothstep } from './lib/math.js';
import { createFX } from './fx/fx.js';
import { UI } from './ui/ui.js';
import { Sound } from './audio/sound.js';

const params = new URLSearchParams(location.search);
const dbg = params.get('dbg') || '';
// any scene set in the URL goes straight in, without the loader and the opening
const direct = params.size > 0 && !params.has('intro');

async function boot() {
  const canvas = document.getElementById('c');
  const pipe = new Pipeline(canvas);
  const renderer = pipe.renderer;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.2, 6000);

  const ui = new UI();
  const sound = new Sound();
  const progress = (p) => ui.progress(p);
  const t0 = performance.now();
  let pT = 0, pG = 0, pP = 0, pB = 0, pF = 0;
  const report = () => progress(pT * 0.2 + pG * 0.46 + pP * 0.1 + pB * 0.08 + pF * 0.06);
  const [tex, world, propSrc, boatSrc, figSrc] = await Promise.all([
    loadTextures(renderer, (p) => { pT = p; report(); }),
    generateWorld((p) => { pG = p; report(); }),
    loadProps((p) => { pP = p; report(); }),
    loadBoat(renderer, (p) => { pB = p; report(); }),
    loadFigures(renderer, (p) => { pF = p; report(); }),
  ]);
  const tGen = performance.now();

  const env = new Environment();
  const sky = createSky();
  scene.add(sky.mesh);
  const terrain = createTerrain(world.terrain, tex);
  scene.add(terrain.group);
  const water = createWater(pipe.reflection);
  scene.add(water.mesh);
  const ftex = createFoliageTextures();
  ftex.blossomAtlas = tex.sakura_blossom;
  ftex.blossomAtlasN = tex.sakura_blossom_n;
  ftex.azaleaAtlas = tex.azalea_atlas;
  ftex.azaleaAtlasN = tex.azalea_atlas_n;
  ftex.coniferAtlas = tex.conifer_atlas;
  ftex.coniferAtlasN = tex.conifer_atlas_n;
  ftex.sakuraLeaf = tex.sakura_leaf;
  ftex.sakuraLeafN = tex.sakura_leaf_n;
  ftex.mapleAtlas = tex.maple_atlas;
  ftex.mapleAtlasN = tex.maple_atlas_n;
  ftex.broadAtlas = tex.broad_atlas;
  ftex.broadAtlasN = tex.broad_atlas_n;
  ftex.bambooAtlas = tex.bamboo_atlas;
  ftex.bambooAtlasN = tex.bamboo_atlas_n;
  ftex.flora = tex.ground_flora;
  ftex.floraN = tex.ground_flora_n;
  ftex.tall = tex.tall_flora;
  ftex.tallN = tex.tall_flora_n;
  const trees = createTrees(tex, ftex, world.trees);
  scene.add(trees);
  pipe.reflection.lod.push(...trees.userData.reflLod);
  const grass = createGrass(world.grass, ftex);
  scene.add(grass);
  const arch = createArchitecture(tex);
  scene.add(arch);
  const props = createProps(propSrc, tex);
  scene.add(props);
  scene.add(createWaterfall());
  const lamps = arch.userData.lamps;
  const sacredTree = createSacredTree(tex, ftex, ISLAND.x, terrainHeight(ISLAND.x, ISLAND.z), ISLAND.z);
  scene.add(sacredTree);
  console.log(`[sf] gen ${(tGen - t0).toFixed(0)}ms (${world.workers} workers) build ${(performance.now() - tGen).toFixed(0)}ms`, JSON.stringify(trees.userData.stats), JSON.stringify(grass.userData.stats), JSON.stringify(props.userData.stats));

  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 600;
  sc.layers.enable(LAYER_NOREFL);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, Math.PI);
  scene.add(hemi);

  const boat = createBoat(tex, boatSrc, figSrc);
  scene.add(boat.root);
  lamps.push(boat.lamp);
  const fx = createFX(scene);
  const journey = new Journey();
  const director = new Director(camera, canvas);

  // ------------------------------------------------------------ control state
  const ctl = {
    autoTime: !params.has('h'),
    autoWeather: !params.has('w'),
    season: parseInt(params.get('s') ?? '0'),
    staticCam: params.has('cam'),
    loopFade: 0,
    z: 0,
    capture: null,
    sound: false,
  };
  env.setSeason(ctl.season);
  if (params.has('h')) env.setHours(parseFloat(params.get('h')), true);
  if (params.has('w')) env.setWeather(params.get('w'));
  if (params.has('z')) journey.s = journey.sAtZ(parseFloat(params.get('z')));
  if (params.has('mode')) director.setMode(params.get('mode'));
  if (ctl.autoTime) env.setHours(journey.hourAt(), true);
  env.update(0, true);

  const camPos = new THREE.Vector3();
  const look = new THREE.Vector3();
  function placeCamera() {
    camPos.fromArray(params.get('cam').split(',').map(Number));
    look.fromArray((params.get('look') || '0,0,-100').split(',').map(Number));
    camera.position.copy(camPos);
    camera.lookAt(look);
  }
  if (ctl.staticCam) placeCamera();

  const resize = () => {
    pipe.resize();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  // ------------------------------------------------------------ input
  const keys = new Set();
  const app = {
    env, journey, director, ctl,
    setSeason(i) { ctl.season = ((i % 4) + 4) % 4; env.setSeason(ctl.season); },
    setHours(h) { ctl.autoTime = false; env.setHours(h); },
    setAutoTime(on) { ctl.autoTime = on; },
    setWeather(w) { ctl.autoWeather = false; env.setWeather(w); },
    setAutoWeather(on) { ctl.autoWeather = on; },
    togglePause() { journey.target = journey.target > 0 ? 0 : journey.cruise; },
    capture() { return new Promise((res) => { ctl.capture = res; }); },
    // the address of this moment: place and season always; the hour and weather only when chosen by hand, since
    // otherwise they follow from the place and a frozen hour would stop the recipient's day
    shareUrl() {
      const q = new URLSearchParams(location.search);
      for (const k of ['z', 's', 'h', 'w', 'mode', 'intro']) q.delete(k);
      q.set('z', String(Math.round(ctl.z)));
      q.set('s', String(ctl.season));
      if (!ctl.autoTime) q.set('h', env.hours.toFixed(1));
      if (!ctl.autoWeather) q.set('w', env.weather);
      if (director.mode === 'seat' || director.mode === 'cinema') q.set('mode', director.mode);
      return `${location.origin}${location.pathname}?${q}`;
    },
    toggleSound() {
      if (!sound.ctx) sound.start(); else sound.setOn(!sound.on);
      ctl.sound = sound.on;
    },
    async jumpTo(i) {
      if (ctl.turning) return;
      await ui.veil(true);
      journey.jump(journey.sAtZ(PLACES[i].z + 30));
      if (ctl.autoTime) env.setHours(journey.hourAt(), true);
      if (ctl.autoWeather) env.setWeather(journey.weatherAt(PLACES[i].z, ctl.season));
      env.update(0, true);
      director.first = true;
      await ui.veil(false);
    },
  };
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    keys.add(e.code);
    if (e.code === 'Space') { e.preventDefault(); app.togglePause(); }
    if (e.code === 'KeyM') app.toggleSound();
    if (e.code === 'KeyC') director.setMode({ follow: 'seat', seat: 'cinema', cinema: 'follow', photo: 'follow' }[director.mode]);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  const lampOrder = lamps.map((l, i) => i);
  const lampD = new Float32Array(lamps.length);
  function updateLamps(list, cam, on) {
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      lampD[i] = (l.x - cam.x) ** 2 + (l.z - cam.z) ** 2;
    }
    lampOrder.sort((a, b) => lampD[a] - lampD[b]);
    const P = U.uLampPos.value, Cc = U.uLampCol.value;
    for (let i = 0; i < P.length; i++) {
      const l = list[lampOrder[i]];
      if (!l || on < 0.01) { P[i].set(0, -999, 0, 1); Cc[i].set(0, 0, 0); continue; }
      const flick = 0.92 + 0.08 * Math.sin(clock.t * 9 + i * 1.7) * Math.sin(clock.t * 5.3 + i);
      P[i].set(l.x, l.y, l.z, l.r);
      Cc[i].set(l.c[0] * on * flick, l.c[1] * on * flick, l.c[2] * on * flick);
    }
  }

  // ------------------------------------------------------------ the voyage loops through the seasons
  // the scroll's page turns: paper fills the view, the next season's character inks in, and the boat sets off again at dawn
  journey.onLoopEnd = async () => {
    if (ctl.turning) return;
    ctl.turning = true;
    const next = (ctl.season + 1) % 4;
    await ui.paperIn(next);
    app.setSeason(next);
    journey.reset(journey.loop + 1);
    if (ctl.autoTime) env.setHours(journey.hourAt(0), true);
    env.update(0, true);
    director.first = true;
    await ui.paperOut();
    ctl.turning = false;
  };
  journey.onPlace = (place, idx) => {
    ui.chapter(place, idx, ctl.season);
    // the temple bell tolls three times as the boat passes the village
    if (place.id === 'village') {
      for (const at of [2.5, 12, 21.5]) {
        setTimeout(() => sound.event('bell', { dist: Math.hypot(camera.position.x - SITES.belfry.x, camera.position.z - SITES.belfry.z) }), at * 1000);
      }
    }
  };
  app.onBurst = (b) => {
    const d = Math.hypot(camera.position.x - b.x, camera.position.y - b.y, camera.position.z - b.z);
    sound.event('boom', { dist: d, delay: d / 343 });
  };
  env.onStrike = () => {
    const d = 300 + Math.random() * 1300;
    sound.event('thunder', { dist: d, delay: d / 343 });
  };
  document.addEventListener('visibilitychange', () => {
    if (!sound.ctx || !ctl.sound) return;
    sound.setOn(!document.hidden);
  });
  const soundState = { seasonW: env.seasonW, season: 0, hours: 12, z: 0, night: 0, daylight: 1, rain: 0, snow: 0, wind: 0, mist: 0, speed: 0, oarPhase: 0, lake: false };

  let last = performance.now();
  const clock = { t: 0 };
  function frame(now) {
    // a frame's timestamp is when it began, which can be before the clock read at the end of a long boot: never
    // let time run backwards (eased values would overshoot their bounds)
    const dtMs = Math.max(0, Math.min(100, now - last));
    last = now;
    const dt = dtMs / 1000;
    clock.t += dt;
    U.uTime.value = clock.t;

    // steering and speed from the keyboard
    journey.steer = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    journey.thrust = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const pose = journey.update(dt);
    ctl.z = pose.z;
    boat.update(dt, clock.t, pose);
    boat.seatView(director.mode === 'seat');
    water.uniforms.uBoatInv.value.copy(boat.inv);
    water.uniforms.uOar.value.copy(boat.oarW);
    for (let i = 0; i < boat.eddies.length; i++) water.uniforms.uEddy.value[i].copy(boat.eddies[i]);
    for (let i = 0; i < boat.wake.length; i++) water.uniforms.uWake.value[i].copy(boat.wake[i]);

    // the journey sets the hour and the weather unless the viewer has taken them
    if (ctl.autoTime) env.setHours(journey.hourAt());
    if (ctl.autoWeather) env.setWeather(journey.weatherAt(pose.z, ctl.season));
    env.update(dt);
    const lakeK = smoothstep(-1900, -2150, pose.z);
    U.uSpirit.value = env.night * (0.35 + 0.65 * lakeK);

    if (!ctl.staticCam) director.update(dt, pose);
    props.userData.update(camera);
    trees.userData.update(camera);
    grass.userData.update(camera);
    fx.update(dt, clock.t, { env, camera, onBurst: (b) => app.onBurst && app.onBurst(b) });

    sky.uniforms.uCloud.value = env.cloud;
    sky.uniforms.uCloudDark.value = env.dark;
    sky.uniforms.uSunVis.value = env.sunVis;

    // key light follows the camera so the shadow map covers what we see
    const k = U.uSunDir.value;
    sun.position.copy(camera.position).addScaledVector(k, 300);
    sun.target.position.copy(camera.position);
    sun.target.position.y = 0;
    const sc = U.uSunCol.value;
    const si = Math.max(sc.x, sc.y, sc.z);
    sun.intensity = si;
    if (si > 0) sun.color.setRGB(sc.x / si, sc.y / si, sc.z / si);
    hemi.color.setRGB(U.uAmbUp.value.x, U.uAmbUp.value.y, U.uAmbUp.value.z);
    hemi.groundColor.setRGB(U.uAmbDown.value.x, U.uAmbDown.value.y, U.uAmbDown.value.z);

    // lamps come on through dusk; feed the nearest ones to every material
    U.uLampOn.value = env.lampOn;
    updateLamps(lamps, camera.position, env.lampOn);

    const cu = pipe.post.composite.uniforms;
    cu.uExposure.value = env.exposure;
    cu.uTime.value = clock.t;
    cu.uNightK.value = env.night;
    cu.uShaftCol.value.copy(U.uFogSun.value);
    cu.uSunVeil.value = dbg.includes('noveil') ? 0 : env.sunVis * (1 - env.night) * 0.8;
    cu.uBloom.value = 0.045 + env.night * 0.05;

    camera.getWorldPosition(U.uViewPos.value);
    pipe.render(scene, camera, { water, sunDir: U.uTrueSun.value, shaftK: dbg.includes('noshaft') ? 0 : env.sunVis * (1 - env.night) * 0.55 });
    if (ctl.capture) {
      const res = ctl.capture;
      ctl.capture = null;
      // copied out in the frame it was drawn, before the drawing buffer is cleared
      ui.stamp(canvas).toBlob((b) => res(b), 'image/png');
    }
    pipe.govern(dtMs);

    if (sound.on) {
      const S = soundState;
      S.night = env.night; S.daylight = env.daylight;
      S.rain = env.w.rain; S.snow = env.w.snow; S.wind = env.w.wind;
      S.mist = Math.min(1, Math.max(0, (env.w.mist - 0.55) / 1.25));
      S.speed = pose.speed; S.oarPhase = boat.phase; S.lake = lakeK > 0.5;
      S.season = env.season; S.hours = env.hours; S.z = pose.z;
      sound.update(dt, S);
    }
    ui.update(now);
    requestAnimationFrame(frame);
  }

  window.__sf = { env, camera, pipe, scene, U, journey, director, boat, app, fx, ui, sound, terrainHeight, THREE };
  ui.attach(app);
  if (direct) {
    ui.skip();
  } else {
    // the world renders behind the loader so every shader is warm before the reveal; the boat waits at its mooring
    journey.target = 0;
    journey.speed = 0;
  }
  requestAnimationFrame(frame);
  // the scans at full detail stream in behind the opening and take over near the camera when they land; a phone's
  // screen gains nothing from them, so touch devices keep the quick tier (?tier=hi|lo overrides)
  const tier = params.get('tier') || (matchMedia('(pointer: coarse)').matches ? 'lo' : 'hi');
  if (tier === 'hi') {
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    // the boat first: it is in every frame
    loadBoatHi(renderer)
      .then((hi) => boat.upgrade(hi, aniso))
      .catch((e) => console.warn('[sf] full-detail boat unavailable', e))
      .then(() => loadPropsHi(renderer, propSrc))
      .then((hi) => props.userData.upgrade(hi, pipe.reflection, aniso))
      .catch((e) => console.warn('[sf] full-detail props unavailable', e));
  }
  if (!direct) {
    await ui.ready();
    sound.start();
    ctl.sound = true;
    journey.target = journey.cruise;
    await ui.open();
  }

}

boot().catch((e) => {
  console.error(e);
  const l = document.getElementById('load');
  if (l) l.insertAdjacentHTML('beforeend', '<div style="position:absolute;bottom:12vh;width:100%;text-align:center;font:15px serif;letter-spacing:.2em;color:#c8a">この端末では舟を出せません · WebGL2 is required</div>');
});

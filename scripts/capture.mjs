// Stills and frame-perfect video from the running app, for the README and for sharing.
// The page's clock is taken over: requestAnimationFrame and performance.now advance by exactly one frame per step,
// however long the frame took to render, so a clip plays back perfectly smoothly at any render cost.
// usage: node scripts/capture.mjs <config.json>
//   { "url": "http://127.0.0.1:5190/", "w": 1920, "h": 1080, "dpr": 2, "out": "captures",
//     "shots": [ { "name": "avenue", "s": 0, "h": 16.5, "w": "clear", "z": -380, "settle": 4,
//                  "cam": { "yaw": 200, "pitch": 8, "d": 14, "ly": 2, "lz": 0, "fov": 40 } } ],
//     "clips": [ { "name": "hero", "fps": 30, "seconds": 8, "s": 0, "h": 16.5, "z": -380,
//                  "cam": { ... }, "camTo": { ... } } ] }
// s: season 0-3 (spring..winter), h: hour 0-24, w: clear | mist | rain | storm | snow, z: journey position (m).
// cam orbits a point on the boat: yaw (deg, 0 = from ahead, 180 = from astern), pitch (deg), d (m), ly (m, height of
// the point looked at), lz (m along the boat), fov (deg). Or "world": { "pos": [x, y, z], "look": [x, y, z] }.
// camTo, when given, is eased to over the clip. Frames land in <out>/<clip>/%04d.png; encode them with ffmpeg.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const cfg = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = cfg.out || 'captures';
mkdirSync(out, { recursive: true });
const W = cfg.w || 1920, H = cfg.h || 1080;

const browser = await chromium.launch({
  headless: false,
  executablePath: cfg.chrome || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${W},${H + 90}`],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: cfg.dpr || 2 });
await ctx.addInitScript(() => {
  const raf = window.requestAnimationFrame.bind(window);
  const real = performance.now.bind(performance);
  let queue = [];
  let virt = null;
  window.__manual = false;
  window.requestAnimationFrame = (cb) => {
    if (!window.__manual) return raf(cb);
    queue.push(cb);
    return queue.length;
  };
  performance.now = () => (virt === null ? real() : virt);
  window.__tick = (n, ms) => {
    if (virt === null) virt = real();
    for (let i = 0; i < n; i++) {
      virt += ms;
      const cbs = queue;
      queue = [];
      for (const cb of cbs) cb(virt);
    }
  };
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
const first = cfg.shots?.[0] || cfg.clips?.[0] || {};
await page.goto(`${cfg.url || 'http://127.0.0.1:5190/'}?z=${first.z ?? -300}&s=${first.s ?? 0}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__sf, null, { timeout: 120000 });
await page.waitForTimeout((cfg.wait ?? 12) * 1000);
await page.keyboard.press('KeyH');
// hand the clock over once the frames already queued with the browser have drained into ours
await page.evaluate(() => { window.__manual = true; });
await page.waitForTimeout(300);

await page.evaluate(() => {
  const { director, camera, boat, pipe } = window.__sf;
  pipe.minScale = pipe.maxScale = 1;
  pipe.setScale(1);
  const upd = director.update.bind(director);
  director.update = (...a) => {
    upd(...a);
    const c = window.__cam;
    if (!c) return;
    if (c.world) {
      camera.position.fromArray(c.world.pos);
      camera.lookAt(...c.world.look);
    } else {
      const b = boat.root, h = b.rotation.y, fx = -Math.sin(h), fz = -Math.cos(h);
      const lx = b.position.x + fx * c.lz, lz = b.position.z + fz * c.lz;
      const y = (c.yaw * Math.PI) / 180 + h, p = (c.pitch * Math.PI) / 180;
      camera.position.set(lx - Math.sin(y) * Math.cos(p) * c.d, c.ly + Math.sin(p) * c.d, lz - Math.cos(y) * Math.cos(p) * c.d);
      camera.lookAt(lx, c.ly, lz);
    }
    if (c.fov && camera.fov !== c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
  };
});

const stage = (s) => page.evaluate((s) => {
  const { app, journey, env } = window.__sf;
  if (s.s !== undefined) app.setSeason(s.s);
  if (s.h !== undefined) { app.setHours(s.h); env.setHours(s.h, true); }
  if (s.w !== undefined) app.setWeather(s.w);
  if (s.z !== undefined) journey.s = journey.sAtZ(s.z);
  // season, hour, weather, snow cover and wet ground all jump to their targets instead of easing over a minute
  env.update(0, true);
  window.__cam = s.cam || null;
}, s);
const tick = (n, fps) => page.evaluate(([n, ms]) => window.__tick(n, ms), [n, 1000 / fps]);

for (const s of cfg.shots || []) {
  await stage(s);
  // let weather, light and the water's wake settle in simulated time, a few frames at a time
  const fps = 30, n = Math.round((s.settle ?? 4) * fps);
  for (let i = 0; i < n; i += 10) await tick(Math.min(10, n - i), fps);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(out, `${s.name}.png`) });
  console.log('shot', s.name);
}

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
for (const c of cfg.clips || []) {
  const dir = join(out, c.name);
  mkdirSync(dir, { recursive: true });
  await stage(c);
  const fps = c.fps || 30;
  await tick(Math.round((c.settle ?? 4) * fps), fps);
  const n = Math.round(c.seconds * fps);
  for (let i = 0; i < n; i++) {
    if (c.camTo) {
      const t = ease(i / (n - 1));
      await page.evaluate((cam) => { window.__cam = cam; }, Object.fromEntries(Object.keys(c.cam).map((k) => [k, typeof c.cam[k] === 'number' ? lerp(c.cam[k], c.camTo[k] ?? c.cam[k], t) : c.cam[k]])));
    }
    await tick(1, fps);
    await page.screenshot({ path: join(dir, `${String(i).padStart(4, '0')}.png`) });
  }
  console.log('clip', c.name, n, 'frames');
}
await browser.close();

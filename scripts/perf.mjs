// Headed frame-time measurement and screenshots at the real display setup (1920x1080 @2x by default).
// usage: node scripts/perf.mjs '<json>'
//   { "url": "...", "w": 1920, "h": 1080, "dpr": 2, "wait": 8,
//     "steps": [ { "eval": "js", "measure": 4, "shot": "name.png", "sleep": 2 } ], "out": "dir" }
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const cfg = JSON.parse(process.argv[2] || '{}');
const out = cfg.out || join(process.cwd(), '.cache', 'shots');
mkdirSync(out, { recursive: true });
// the installed Chrome on a throwaway profile by default: test runs elsewhere on this machine clear out stray
// "Google Chrome for Testing" processes, taking a run's GPU process with them ("chrome": "testing" to use it anyway)
const exe = cfg.chrome === 'testing'
  ? join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
  : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await chromium.launch({
  headless: false,
  executablePath: exe,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${cfg.w || 1920},${(cfg.h || 1080) + 90}`],
});
const ctx = await browser.newContext({ viewport: { width: cfg.w || 1920, height: cfg.h || 1080 }, deviceScaleFactor: cfg.dpr || 2 });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { const t = m.text(); if (/\[sf\]|rror|WARN|warn/.test(t)) logs.push(`${m.type()}: ${t}`.slice(0, 400)); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto(cfg.url || 'http://127.0.0.1:5190/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__sf, null, { timeout: 60000 });
await page.waitForTimeout((cfg.wait ?? 6) * 1000);

const results = [];
for (const s of cfg.steps || [{ measure: 5, shot: 'shot.png' }]) {
  if (s.eval) await page.evaluate(s.eval);
  if (s.click) await page.click(s.click);
  if (s.key) await page.keyboard.press(s.key);
  if (s.mouse) await page.mouse.move(...s.mouse);
  if (s.sleep) await page.waitForTimeout(s.sleep * 1000);
  if (s.measure) {
    const r = await page.evaluate(async (sec) => {
      const t = [];
      let last = performance.now();
      const end = last + sec * 1000;
      await new Promise((res) => {
        const f = (n) => { t.push(n - last); last = n; if (n < end) requestAnimationFrame(f); else res(); };
        requestAnimationFrame(f);
      });
      t.sort((a, b) => a - b);
      const q = (p) => +t[Math.min(t.length - 1, Math.floor(p * t.length))].toFixed(1);
      const sf = window.__sf;
      const info = sf.pipe.renderer.info;
      return { n: t.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1), over20: +((t.filter((x) => x > 20).length / t.length) * 100).toFixed(1), scale: +sf.pipe.scale.toFixed(2), W: sf.pipe.W, H: sf.pipe.H, calls: info.render.calls, tris: info.render.triangles, programs: info.programs.length };
    }, s.measure);
    results.push({ step: s.label || s.eval || 'measure', ...r });
  }
  if (s.shot) await page.screenshot({ path: join(out, s.shot) });
}
console.log(JSON.stringify({ results, logs: logs.slice(-15) }, null, 1));
await browser.close();

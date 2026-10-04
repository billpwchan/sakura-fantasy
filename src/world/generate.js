// Runs world generation across a pool of module workers and merges the results.
import { TERRAIN_CHUNKS, T_Z0, T_Z1 } from './terrain-gen.js';
import { SPECIES } from './place-trees.js';
import { KINDS } from './place-grass.js';

const concat = (parts) => {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

export async function generateWorld(onProgress) {
  const W = Math.max(2, Math.min(10, (navigator.hardwareConcurrency || 4) - 1));
  const workers = Array.from({ length: W }, () => new Worker(new URL('./gen.worker.js', import.meta.url), { type: 'module' }));
  const jobs = [];
  const ranges = (n, z0 = T_Z0, z1 = T_Z1) => Array.from({ length: n }, (_, i) => [z0 - ((z0 - z1) * i) / n, z0 - ((z0 - z1) * (i + 1)) / n]);
  // heavy jobs first so the pool drains evenly
  ranges(W * 3, 120, T_Z1).forEach(([a, b], i) => jobs.push({ job: 'grass', args: { zFrom: a, zTo: b, seed: 900 + i } }));
  ranges(W * 2).forEach(([a, b], i) => jobs.push({ job: 'trees', args: { zFrom: a, zTo: b, seed: 500 + i } }));
  const chunks = [...Array(TERRAIN_CHUNKS).keys()];
  for (let k = 0; k < W * 2; k++) {
    const list = chunks.filter((c) => c % (W * 2) === k);
    if (list.length) jobs.push({ job: 'terrain', args: { chunks: list } });
  }
  const total = jobs.length;
  let done = 0;
  const results = { terrain: [], trees: [], grass: [] };
  await new Promise((resolve, reject) => {
    let next = 0;
    const feed = (w) => {
      if (next >= jobs.length) return;
      const j = jobs[next++];
      w.onmessage = (e) => {
        results[j.job].push(e.data.result);
        done++;
        onProgress && onProgress(done / total);
        if (done === total) resolve();
        else feed(w);
      };
      w.onerror = (e) => reject(e);
      w.postMessage({ id: next, job: j.job, args: j.args });
    };
    workers.forEach(feed);
  });
  workers.forEach((w) => w.terminate());
  const terrain = results.terrain.flat().sort((a, b) => a.ci - b.ci);
  const trees = {};
  for (const k of SPECIES) trees[k] = concat(results.trees.map((r) => r[k]));
  const grass = {};
  for (const k of KINDS) grass[k] = concat(results.grass.map((r) => r[k]));
  return { terrain, trees, grass, workers: W };
}

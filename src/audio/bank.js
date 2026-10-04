// Recorded sounds: fetched and decoded on first use, dropped again when a long bed has gone unheard for a while
// (decoded audio is large, and a phone holds only so much of it). index.json is written by pipeline/audio/build.py.
const BASE = './assets/audio/';

export class Bank {
  constructor(ctx) {
    this.ctx = ctx;
    this.index = null;
    this.buffers = new Map();
    this.pending = new Map();
    this.used = new Map();
    this.ready = fetch(BASE + 'index.json')
      .then((r) => r.json())
      .then((j) => { this.index = j; return j; })
      .catch((e) => { console.warn('[sf] sound bank unavailable', e); return null; });
  }

  load(file) {
    if (!file) return Promise.resolve(null);
    if (!this.pending.has(file)) {
      const p = fetch(BASE + file)
        .then((r) => { if (!r.ok) throw new Error(r.status + ' ' + file); return r.arrayBuffer(); })
        .then((a) => this.ctx.decodeAudioData(a))
        .then((b) => { this.buffers.set(file, b); return b; })
        .catch((e) => { console.warn('[sf] sound unavailable', file, e); return null; });
      this.pending.set(file, p);
    }
    return this.pending.get(file);
  }

  // the buffer if it is decoded; otherwise null, and it starts loading so it is there next time
  get(file) {
    const b = this.buffers.get(file);
    this.used.set(file, this.ctx.currentTime);
    if (!b) this.load(file);
    return b || null;
  }

  // forget long buffers not touched for `idle` seconds; they reload on their next use
  sweep(idle = 90, minSec = 20) {
    const now = this.ctx.currentTime;
    for (const [file, b] of this.buffers) {
      if (b.duration >= minSec && now - (this.used.get(file) ?? now) > idle) {
        this.buffers.delete(file);
        this.pending.delete(file);
      }
    }
  }

  // one-shot through gain (and optional filter and pan) into dest; returns the nodes for further automation
  play(buf, when, dest, { rate = 1, gain = 1, pan = 0, offset = 0, dur, lp, hp } = {}) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    let node = s;
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.5; node.connect(f); node = f; }
    if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; f.Q.value = 0.5; node.connect(f); node = f; }
    const g = ctx.createGain();
    g.gain.value = gain;
    node.connect(g);
    let out = g;
    if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    out.connect(dest);
    s.start(when, offset);
    if (dur) s.stop(when + dur);
    return { src: s, gain: g };
  }
}

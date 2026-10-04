// Sound: the river, wind and rain synthesised as they change; Japan's own sounds recorded where they happen
// (temple bells, a garden's suikinkutsu and shishi-odoshi, shrine music, cicadas, crickets, the bush warbler,
// furin, the bamboo grove); and the score (score.js). Every recording is CC0, public domain or CC BY (CREDITS.md).
// Each place has its own soundscape, and season, hour and weather decide which of its sounds are heard.
import { clamp, smoothstep } from '../lib/math.js';
import { PLACES } from '../world/layout.js';
import { Bank } from './bank.js';
import { Score } from './score.js';

const R = (a, b) => a + Math.random() * (b - a);

function noiseBuffer(ctx, sec, pink = false) {
  const n = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (!pink) { d[i] = w; continue; }
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return b;
}

// An open valley: a few early reflections off the banks, then a diffuse tail whose highs die first (air and
// leaves absorb them), decorrelated between the ears.
function valleyIR(ctx, sec = 3.4) {
  const sr = ctx.sampleRate, n = Math.floor(sr * sec);
  const b = ctx.createBuffer(2, n, sr);
  const taps = [[0.019, 0.5], [0.037, 0.36], [0.058, 0.3], [0.083, 0.22], [0.121, 0.16]];
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      // one-pole lowpass whose cutoff falls from ~9 kHz to ~1.2 kHz over the tail
      const fc = 9000 * Math.exp(-t * 0.6) + 1200;
      const a = Math.exp((-2 * Math.PI * fc) / sr);
      lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
      const env = Math.exp(-t * (6.9 / sec)) * smoothstep(0.004, 0.03, t);
      d[i] = lp * env * 1.6;
    }
    for (const [t, g] of taps) {
      const i = Math.floor((t + (c ? 0.004 : 0)) * sr);
      d[i] += g * (c ? -1 : 1) * (0.8 + Math.random() * 0.4);
    }
  }
  return b;
}

// Where the boat is, as a weight per place: each place fades in and out over ~50 m around its bounds.
function placeWeights(z) {
  const w = {};
  for (let i = 0; i < PLACES.length; i++) {
    const a = PLACES[i].z, b = i + 1 < PLACES.length ? PLACES[i + 1].z : null;
    w[PLACES[i].id] = (i === 0 ? 1 : smoothstep(a + 25, a - 25, z)) * (b === null ? 1 : 1 - smoothstep(b + 25, b - 25, z));
  }
  return w;
}

function placeAt(z) {
  let idx = 0;
  for (let i = 0; i < PLACES.length; i++) if (z <= PLACES[i].z) idx = i;
  const p = PLACES[idx], next = PLACES[idx + 1];
  const t = next ? clamp((p.z - z) / (p.z - next.z), 0, 1) : 0.5;
  return { id: p.id, t };
}

// A recorded bed, looped by crossfading copies of itself; two copies half a loop apart, one each side, make a
// mono recording wide.
class Bed {
  constructor(sound, file, { width = 0.6, fade = 3, lp, hp } = {}) {
    this.s = sound;
    this.file = file;
    this.fade = fade;
    const ctx = sound.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    let node = this.out;
    if (lp) { this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = lp; node.connect(this.lp); node = this.lp; }
    if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
    node.connect(sound.amb);
    this.width = width;
    this.copies = [{ at: 0, pan: -width, phase: 0 }, { at: 0, pan: width, phase: 0.5 }];
    this.level = 0;
    this.quietSince = 0;
  }

  update(now, target) {
    this.out.gain.setTargetAtTime(target, now, 1.6);
    this.level += (target - this.level) * 0.02;
    if (target < 0.002 && this.level < 0.002) {
      if (!this.quietSince) this.quietSince = now;
      if (now - this.quietSince > 8) for (const c of this.copies) c.at = 0;
      return;
    }
    this.quietSince = 0;
    const buf = this.s.bank.get(this.file);
    if (!buf) return;
    const ctx = this.s.ctx, F = this.fade, len = buf.duration;
    for (const c of this.copies) {
      if (c.at && now < c.at - 0.6) continue;
      const first = !c.at;
      const start = first ? now + 0.05 : c.at;
      const offset = first ? len * c.phase : 0;
      const dur = len - offset;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain(), p = ctx.createStereoPanner();
      p.pan.value = c.pan;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.71, start + F);
      g.gain.setValueAtTime(0.71, start + dur - F);
      g.gain.linearRampToValueAtTime(0, start + dur);
      src.connect(g).connect(p).connect(this.out);
      src.start(start, offset);
      src.stop(start + dur + 0.05);
      c.at = start + dur - F;
    }
  }
}

export class Sound {
  constructor() {
    this.on = false;
    this.ctx = null;
    this.lastPhase = 0;
    this.next = {};
    this.place = { id: 'asagiri', t: 0 };
  }

  start() {
    if (this.ctx) { this.setOn(true); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let ctx;
    try { ctx = new AC({ latencyHint: 'playback', sampleRate: 44100 }); } catch { ctx = new AC({ latencyHint: 'playback' }); }
    this.ctx = ctx;

    // master: a fast limiter so bells and fireworks never clip. DynamicsCompressorNode adds its own makeup gain
    // (0.6 of the reduction at full scale, in WebKit, Blink and Gecko alike); the trim after it takes that back out
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.15;
    const trim = ctx.createGain();
    trim.gain.value = Math.pow(10, (-(4 - 4 / 20) * 0.6) / 20);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(lim).connect(trim).connect(ctx.destination);
    this.output = trim;

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = valleyIR(ctx);
    this.wet = ctx.createGain();
    this.wet.gain.value = 4.0;
    this.reverb.connect(this.wet).connect(this.master);

    // music ducks under the temple bell; ambience under music never does
    this.duck = ctx.createGain();
    this.duck.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 2.2;
    this.music.connect(this.duck);
    this.kotoBus = ctx.createGain(); this.kotoBus.gain.value = 1.0;
    this.kotoBus.connect(this.music); this.kotoBus.connect(this.send(0.22));
    this.shakuBus = ctx.createGain(); this.shakuBus.gain.value = 1.0;
    this.shakuBus.connect(this.music); this.shakuBus.connect(this.send(0.38));
    this.shakuFar = ctx.createGain(); this.shakuFar.gain.value = 0.55;
    this.shakuFar.connect(this.music); this.shakuFar.connect(this.send(0.9));
    this.amb = ctx.createGain(); this.amb.gain.value = 1.0;
    this.amb.connect(this.master); this.amb.connect(this.send(0.12));
    this.sfx = ctx.createGain(); this.sfx.gain.value = 1.0;
    this.sfx.connect(this.master); this.sfx.connect(this.send(0.45));

    const pink = noiseBuffer(ctx, 6, true), white = noiseBuffer(ctx, 4, false);
    this.white = white;
    const loop = (buf, filters, gain) => {
      const s = ctx.createBufferSource();
      s.buffer = buf; s.loop = true;
      let node = s;
      for (const f of filters) { node.connect(f); node = f; }
      const g = ctx.createGain();
      g.gain.value = gain;
      node.connect(g).connect(this.amb);
      s.start(0, Math.random() * 2);
      return g;
    };
    const bq = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    // the river: low rush plus a brighter babble that swells and falls
    this.riverLo = loop(pink, [bq('highpass', 70), bq('lowpass', 420)], 0.0);
    this.babbleF = bq('bandpass', 1400, 0.9);
    this.riverHi = loop(white, [this.babbleF, bq('highshelf', 3000)], 0.0);
    this.windF = bq('bandpass', 500, 0.6);
    this.wind = loop(pink, [this.windF], 0.0);
    this.rain = loop(white, [bq('highpass', 900), bq('lowpass', 7000)], 0.0);
    this.rainLo = loop(pink, [bq('lowpass', 260)], 0.0);
    this.leaves = loop(white, [bq('bandpass', 5200, 0.5)], 0.0);

    this.bank = new Bank(ctx);
    this.score = new Score(this);
    this.beds = {
      cicadas: new Bed(this, 'cicadas.mp3', { width: 0.7 }),
      insects: new Bed(this, 'insects.mp3', { width: 0.8, lp: 8000 }),
      suzumushi: new Bed(this, 'suzumushi.mp3', { width: 0.5 }),
      bamboo: new Bed(this, 'bamboo.mp3', { width: 0.75 }),
      gagaku: new Bed(this, 'gagaku.mp3', { width: 0.35, lp: 3800 }),
      chant: new Bed(this, 'chant.mp3', { width: 0.3, lp: 2600 }),
      festival: new Bed(this, 'festival.mp3', { width: 0.5, lp: 2200 }),
      garden: new Bed(this, 'suikinkutsu.mp3', { width: 0.25, fade: 2 }),
    };
    this.bank.ready.then((index) => index && this.score.init(index)).then(() => {
      // small one-shots next; long beds load when a place first asks for them
      for (const f of ['bonsho_0.mp3', 'keisu.mp3', 'furin_0.mp3', 'furin_1.mp3', 'shishiodoshi.mp3', 'mokugyo.mp3', 'suzu_0.mp3', 'suzu_1.mp3', 'suzu_2.mp3', 'uguisu_0.mp3', 'uguisu_1.mp3', 'uguisu_2.mp3', 'uguisu_3.mp3', 'frogs.mp3']) this.bank.load(f);
    });
    this.setOn(true);
  }

  // a reverb send at a given level, for a bus to connect to
  send(level) {
    const g = this.ctx.createGain();
    g.gain.value = level;
    g.connect(this.reverb);
    return g;
  }

  setOn(on) {
    this.on = on;
    if (!this.ctx) return;
    if (on && this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(on ? 1.0 : 0, t + (on ? 3.5 : 0.6));
  }

  ramp(g, v, k = 0.8) { g.gain.setTargetAtTime(v, this.ctx.currentTime, k); }

  // ------------------------------------------------------------ recordings
  oneShot(name, when, { gain = 1, pan = 0, rate = 1, lp, dest } = {}) {
    const list = this.bank.index && this.bank.index[name];
    if (!list) return null;
    const file = Array.isArray(list) ? list[Math.floor(Math.random() * list.length)] : list;
    const buf = this.bank.get(file);
    if (!buf) return null;
    return this.bank.play(buf, when, dest || this.amb, { gain, pan, rate, lp });
  }

  // the temple bell: struck once, it rings for half a minute; the music steps back while it does
  bell(when, dist = 60, which = 0) {
    const att = clamp(70 / Math.max(25, dist), 0.2, 1.3);
    const lp = clamp(9000 * (60 / Math.max(30, dist)), 1500, 9000);
    const list = this.bank.index && this.bank.index.bonsho;
    if (!list) return;
    const buf = this.bank.get(list[which % list.length]);
    if (!buf) return;
    this.bank.play(buf, when, this.sfx, { gain: 0.6 * att, lp, pan: 0.35 });
    const d = this.duck.gain;
    d.cancelScheduledValues(when);
    d.setTargetAtTime(0.62, when, 0.25);
    d.setTargetAtTime(1, when + 4, 4);
  }

  // muraiki: the burst of breath the shakuhachi player lets into a note
  breathNoise(when, dur, dest, strength = 0.5, pan = 0) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = R(1400, 2200); bp.Q.value = 0.8;
    const g = ctx.createGain();
    const peak = 0.03 + 0.09 * strength;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    n.connect(bp).connect(g).connect(p).connect(dest);
    n.start(when, Math.random() * 3); n.stop(when + dur + 0.05);
  }

  // ------------------------------------------------------------ synthesised effects
  boom(when, dist) {
    const ctx = this.ctx;
    const att = clamp(140 / Math.max(60, dist), 0.12, 1);
    const n = ctx.createBufferSource();
    n.buffer = this.white;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, when); lp.frequency.exponentialRampToValueAtTime(70, when + 1.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.9 * att, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, when + 2.4);
    n.connect(lp).connect(g).connect(this.sfx);
    n.start(when, Math.random()); n.stop(when + 2.5);
    // crackle as the stars burn
    for (let i = 0; i < 18; i++) {
      const t = when + 0.25 + Math.random() * 1.6;
      const c = ctx.createBufferSource();
      c.buffer = this.white;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2500;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.12 * att * Math.random(), t);
      cg.gain.exponentialRampToValueAtTime(0.0005, t + 0.04);
      c.connect(hp).connect(cg).connect(this.sfx);
      c.start(t, Math.random() * 3); c.stop(t + 0.05);
    }
  }

  thunder(when, dist = 900) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.white;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 160;
    const g = ctx.createGain();
    const a = clamp(900 / dist, 0.3, 1.2);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.9 * a, when + 0.25);
    g.gain.setTargetAtTime(0.4 * a, when + 0.4, 0.5);
    g.gain.setTargetAtTime(0, when + 1.6, 1.4);
    n.connect(lp).connect(g).connect(this.sfx);
    n.start(when); n.stop(when + 7);
  }

  creak(when) {
    // the ro working against its pin
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 18;
    bp.frequency.setValueAtTime(420 + Math.random() * 80, when);
    bp.frequency.linearRampToValueAtTime(620 + Math.random() * 120, when + 0.28);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.09, when + 0.06);
    g.gain.linearRampToValueAtTime(0, when + 0.3);
    n.connect(bp).connect(g).connect(this.amb);
    n.start(when, Math.random() * 3); n.stop(when + 0.32);
    // and the blade turning the water
    const s = ctx.createBufferSource();
    s.buffer = this.white;
    const lp = ctx.createBiquadFilter();
    lp.type = 'bandpass'; lp.frequency.value = 700; lp.Q.value = 0.8;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0, when + 0.1);
    sg.gain.linearRampToValueAtTime(0.05, when + 0.3);
    sg.gain.linearRampToValueAtTime(0, when + 0.8);
    s.connect(lp).connect(sg).connect(this.amb);
    s.start(when + 0.1, Math.random() * 3); s.stop(when + 0.85);
  }

  higurashi(when) {
    // the evening cicada, 'kana-kana-kana': buzzing pulses near 4.5 kHz that slow and sink through the call
    const ctx = this.ctx;
    const pan = R(-0.8, 0.8), n = 10 + Math.floor(R(0, 8)), far = R(0.35, 1);
    let t = when;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const len = 0.075 + u * 0.05;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = R(330, 380);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 7;
      bp.frequency.setValueAtTime(4900 - u * 700, t);
      bp.frequency.linearRampToValueAtTime(4500 - u * 700, t + len);
      const g = ctx.createGain();
      const v = 0.05 * far * Math.sin(Math.PI * Math.min(1, u * 1.3 + 0.15));
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.012);
      g.gain.setTargetAtTime(0, t + len * 0.5, len * 0.25);
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      o.connect(bp).connect(g).connect(p).connect(this.amb);
      o.start(t); o.stop(t + len + 0.1);
      t += len + 0.045 + u * 0.09;
    }
  }

  // ------------------------------------------------------------ the frame
  every(key, now, min, max) {
    if (now < (this.next[key] || 0)) return false;
    this.next[key] = now + R(min, max);
    return true;
  }

  update(dt, s) {
    if (!this.ctx || !this.on) return;
    const now = this.ctx.currentTime;
    const sw = s.seasonW;
    const season = s.season;
    const pw = placeWeights(s.z);
    this.place = s.lake ? { id: 'lake', t: 0.5 } : placeAt(s.z);
    const day = s.daylight * (1 - s.rain) * (1 - sw.w * 0.7);
    const h = s.hours;
    const dawn = smoothstep(4, 5, h) * (1 - smoothstep(6.8, 7.8, h));
    const dusk = smoothstep(16.3, 17.3, h) * (1 - smoothstep(19, 20, h));

    // the river, the wind, the rain; snow hushes everything
    const hush = 1 - s.snow * 0.45;
    this.ramp(this.riverLo, 0.06 * hush);
    this.ramp(this.riverHi, 0.04 * (1 + s.speed * 0.08) * hush);
    this.babbleF.frequency.setTargetAtTime(1200 + Math.sin(now * 0.37) * 300 + Math.sin(now * 1.3) * 120, now, 0.3);
    this.ramp(this.wind, (0.025 + s.wind * 0.13) * (1 - pw.gorge * 0.4));
    this.windF.frequency.setTargetAtTime(380 + s.wind * 300 + Math.sin(now * 0.2) * 120, now, 1.2);
    this.ramp(this.rain, s.rain * 0.3);
    this.ramp(this.rainLo, s.rain * 0.16);
    this.ramp(this.leaves, (0.015 + s.wind * 0.05) * (1 - sw.w * 0.8) * (1 - pw.gorge));

    if (s.oarPhase - this.lastPhase > Math.PI && s.speed > 0.4) {
      this.lastPhase = s.oarPhase;
      this.creak(now + 0.02);
    }

    // recorded beds, each where and when it belongs
    const B = this.beds, dry = 1 - s.rain * 0.85;
    // summer cicadas fill the day at shrines and among trees; a little at dawn in the mist
    B.cicadas.update(now, 0.22 * sw.y * smoothstep(0.25, 0.6, s.daylight) * dry * (pw.sakura * 0.7 + pw.village + pw.gorge * 0.6 + pw.torii + pw.lake * 0.5 + pw.bridge * 0.6 + pw.asagiri * 0.25 * (1 - dawn)));
    // crickets on late-summer and autumn nights; the bell cricket closest to the boat
    const nightInsects = smoothstep(0.3, 0.75, s.night) * dry * (1 - pw.gorge * 0.5);
    B.insects.update(now, 0.25 * (sw.z + sw.y * 0.4) * nightInsects);
    B.suzumushi.update(now, 0.2 * (sw.z + sw.y * 0.3) * nightInsects * (pw.asagiri + pw.sakura + pw.village + pw.lake));
    B.bamboo.update(now, 0.45 * pw.gorge * (0.7 + s.wind * 0.5) * (1 - s.snow * 0.5));
    // a wedding party's gagaku carries from the shrine by day
    B.gagaku.update(now, 0.25 * pw.torii * smoothstep(0.35, 0.7, s.daylight) * (1 - s.rain * 0.7));
    // the temple's morning and evening service
    B.chant.update(now, 0.3 * pw.village * Math.max(dawn, dusk));
    // a summer festival on the far shore, the night of the fireworks
    B.festival.update(now, 0.3 * pw.lake * sw.y * smoothstep(0.45, 0.8, s.night) * dry);
    // the temple garden's suikinkutsu, dripping under a stone
    B.garden.update(now, 0.35 * pw.village * (1 - s.rain * 0.6));

    // one-shots
    if (this.bank.index) {
      if (this.every('uguisu', now, 7, 20) && Math.random() < sw.x * day * (1 - pw.torii * 0.5)) {
        const far = R(0.3, 1);
        this.oneShot('uguisu', now + 0.1, { gain: 0.55 * far, pan: R(-0.85, 0.85), lp: 3000 + far * 6000 });
      }
      if (this.every('furin', now, 2.5, 7) && Math.random() < sw.y * pw.village * (0.25 + s.wind * 0.8)) {
        this.oneShot('furin', now + 0.05, { gain: R(0.12, 0.3), pan: R(0.1, 0.6), rate: R(0.97, 1.03) });
      }
      if (this.every('sozu', now, 22, 40) && pw.village > 0.3 && sw.w < 0.6) {
        this.oneShot('shishiodoshi', now + 0.1, { gain: 0.45 * pw.village, pan: 0.45, lp: 4000 });
      }
      if (this.every('suzu', now, 14, 32) && pw.torii > 0.4 && s.daylight > 0.3) {
        this.oneShot('suzu', now + 0.1, { gain: 0.3 * pw.torii, pan: R(-0.5, 0.5) });
      }
      if (this.every('frogs', now, 2.5, 7) && Math.random() < sw.y * smoothstep(0.35, 0.7, s.night) * (pw.asagiri + pw.lake) * dry) {
        this.oneShot('frogs', now + 0.05, { gain: R(0.2, 0.45), pan: R(-0.9, 0.9), rate: R(0.92, 1.08) });
      }
      // the sutra at dawn and dusk is paced by the keisu, the priest's bowl bell
      if (this.every('keisu', now, 14, 32) && Math.random() < pw.village * Math.max(dawn, dusk)) {
        this.oneShot('keisu', now + 0.1, { gain: 0.3 * pw.village, pan: 0.35, lp: 6000 });
      }
      // bamboo culms knocking together in the wind
      if (this.every('knock', now, 1.5, 6) && Math.random() < pw.gorge * (0.25 + s.wind * 0.7)) {
        const pan = R(-0.8, 0.8), r = R(0.55, 0.9);
        this.oneShot('mokugyo', now + 0.05, { gain: R(0.1, 0.22), pan, rate: r, lp: 1800 });
        if (Math.random() < 0.5) this.oneShot('mokugyo', now + R(0.15, 0.3), { gain: R(0.06, 0.14), pan, rate: r * R(0.92, 1.08), lp: 1800 });
      }
      // New Year's Eve: on winter nights the village bell keeps tolling
      if (this.every('joya', now, 28, 42) && sw.w > 0.6 && s.night > 0.6 && pw.village > 0.4) this.bell(now + 0.1, 90, 1);
    }
    if (this.every('higurashi', now, 3, 9) && Math.random() < sw.y * Math.max(dawn, dusk) * dry * 0.8) this.higurashi(now + 0.05);

    // the score
    this.score.update(now, {
      place: this.place.id, t: this.place.t, season, night: s.night, daylight: s.daylight,
      rain: s.rain, snow: s.snow, mist: s.mist,
    });
    if (this.every('sweep', now, 10, 12)) this.bank.sweep();
  }

  event(kind, data) {
    if (!this.ctx || !this.on) return;
    const now = this.ctx.currentTime;
    if (kind === 'bell') this.bell(now + 0.05, data.dist, data.which || 0);
    if (kind === 'boom') this.boom(now + data.delay, data.dist);
    if (kind === 'thunder') this.thunder(now + data.delay, data.dist);
  }
}

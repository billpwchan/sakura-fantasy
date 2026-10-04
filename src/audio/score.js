// The score, composed as it plays. Every place keeps its own music: the shakuhachi alone in the dawn mist, the koto
// under the cherries, a danmono that quickens as the boat nears the bridge, the shō's held chords at the shrine
// gates. The phrasing follows the rules the music is made by, not chance:
// - the koto is thirteen strings tuned to a mode, played in its own gestures (ten-ton-shan, kororin, nagashi,
//   pressed notes and ato-oshi bends);
// - the shakuhachi plays one breath per phrase, rising into each note from below and shaking it as it is held;
// - silence (ma) runs at least as long as the sound;
// - each place rises and falls in jo-ha-kyū.
// Instruments are recordings (pipeline/audio): a Dan Tranh voiced toward the koto, a real shō and a real
// shakuhachi note.
import { clamp, smoothstep } from '../lib/math.js';

// Strings 1-13 laid out as hirajōshi (1 on D4, 2 the lowest), then bent to each mode: hira for spring, the
// brighter yō for summer and for dawn, kumoi for autumn, winter and night.
export const MODES = {
  yo: { koto: [62, 55, 57, 59, 62, 64, 67, 69, 71, 74, 76, 79, 81], shaku: [62, 64, 67, 69, 71, 74, 76], pcs: [2, 4, 7, 9, 11] },
  hira: { koto: [62, 55, 57, 58, 62, 63, 67, 69, 70, 74, 75, 79, 81], shaku: [62, 63, 67, 69, 70, 74, 75], pcs: [2, 3, 7, 9, 10] },
  kumoi: { koto: [62, 55, 56, 60, 62, 63, 67, 68, 72, 74, 75, 79, 80], shaku: [62, 63, 67, 68, 72, 74, 75], pcs: [0, 2, 3, 7, 8] },
};

// How much of each voice a place calls for: koto, shakuhachi, shō drone, and the koto's register (lowest string)
const PLACE = {
  asagiri: { koto: 0.2, shaku: 1.0, sho: 0.85, low: 1 },
  sakura: { koto: 1.0, shaku: 0.45, sho: 0, low: 3 },
  bridge: { koto: 1.0, shaku: 0.25, sho: 0, low: 3 },
  village: { koto: 0.55, shaku: 0.35, sho: 0, low: 1 },
  gorge: { koto: 0.35, shaku: 1.0, sho: 0, low: 1 },
  torii: { koto: 0.35, shaku: 0.3, sho: 1.0, low: 4 },
  lake: { koto: 0.7, shaku: 0.6, sho: 0.55, low: 4 },
};

const R = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function weighted(list) {
  let sum = 0;
  for (const [w] of list) sum += w;
  let r = Math.random() * sum;
  for (const [w, v] of list) { if ((r -= w) <= 0) return v; }
  return list[list.length - 1][1];
}

export class Score {
  constructor(sound) {
    this.s = sound;
    this.ctx = sound.ctx;
    this.bank = sound.bank;
    this.mode = 'hira';
    this.place = null;
    this.visit = { kyu: false, sakura: false };
    this.next = { koto: 0, shaku: 0 };
    this.floorUntil = 0; // the koto and the shakuhachi take turns; this is when the current phrase ends
    this.lastVoice = '';
    this.sho = { gain: null, until: 0, chord: -1, level: 0 };
    this.koto = { mf: [], f: [] };
    this.shaku = null;
    this.danmonoUntil = 0;
    this.ready = false;

    const ctx = this.ctx;
    this.shoBus = ctx.createGain();
    this.shoBus.gain.value = 0;
    this.shoBus.connect(sound.music);
    this.shoBus.connect(sound.send(0.55));
  }

  // instruments from the bank index, decoded up front: they are small and must play the moment they are asked for
  init(index) {
    for (const k of index.koto) this.koto[k.layer].push(k);
    for (const l of ['mf', 'f']) this.koto[l].sort((a, b) => a.midi - b.midi);
    this.shaku = index.shakuhachi;
    this.shoChords = index.sho;
    const files = [...index.koto.map((k) => k.file), index.shakuhachi.file, ...index.sho.map((c) => c.file)];
    return Promise.all(files.map((f) => this.bank.load(f))).then(() => { this.ready = true; });
  }

  // ------------------------------------------------------------ voices
  // a koto string: nearest recorded pitch, repitched; press = semitones already pressed before the pluck
  // (oshide: duller, shorter); bend = { at, to, dur, back } for ato-oshi after the pluck; yuri = vibrato
  pluck(midi, when, { vel = 0.75, pan = 0, press = 0, bend = null, yuri = 0, dull = false } = {}) {
    const layer = vel > 0.72 ? 'f' : 'mf';
    const set = this.koto[layer];
    if (!set.length) return;
    let best = set[0];
    for (const k of set) if (Math.abs(k.midi - midi) < Math.abs(best.midi - midi)) best = k;
    const buf = this.bank.get(best.file);
    if (!buf) return;
    const ctx = this.ctx;
    const rate = Math.pow(2, (midi - best.midi + R(-0.04, 0.04)) / 12);
    const lp = dull || press ? 2600 : 7000 + vel * 4000;
    // the recorded mf layer sits ~11 dB under f; most of that is lifted back so soft notes keep their colour, not lose their voice
    const { src, gain } = this.bank.play(buf, when, this.s.kotoBus, { rate, gain: 0.95 * Math.pow(vel, 1.3) * (layer === 'mf' ? 2.8 : 1), pan, lp });
    const p = src.playbackRate;
    if (press) gain.gain.setTargetAtTime(0, when + 0.6, 0.5);
    if (bend) {
      p.setValueAtTime(rate, when + bend.at);
      p.linearRampToValueAtTime(rate * Math.pow(2, bend.to / 12), when + bend.at + bend.dur);
      if (bend.back) {
        p.setValueAtTime(rate * Math.pow(2, bend.to / 12), when + bend.at + bend.dur + bend.back);
        p.linearRampToValueAtTime(rate, when + bend.at + bend.dur + bend.back + 0.25);
      }
    }
    if (yuri) {
      const lfo = ctx.createOscillator(), d = ctx.createGain();
      lfo.frequency.value = R(4.6, 5.8);
      d.gain.setValueAtTime(0, when);
      d.gain.linearRampToValueAtTime(rate * (Math.pow(2, yuri / 1200) - 1), when + 0.9);
      lfo.connect(d).connect(p);
      lfo.start(when + 0.35); lfo.stop(when + 0.35 + buf.duration / rate);
    }
  }

  // the string's pan: the koto lies across the player, string 1 on the far side
  str(i, when, opts = {}) {
    const k = MODES[this.mode].koto;
    i = clamp(i, 0, 12);
    this.pluck(k[i] + (opts.press || 0), when, { pan: -0.32 + (i / 12) * 0.64, ...opts });
  }

  // semitones from string i up to the next pitch of the mode (the press that lands on a scale note)
  stepUp(i) {
    const k = MODES[this.mode].koto, pcs = MODES[this.mode].pcs;
    for (let d = 1; d <= 3; d++) if (pcs.includes((k[i] + d) % 12)) return d;
    return 2;
  }

  // one breath of shakuhachi: notes rise in from below (meri to kari), swell, shake (yuri) and fall away
  breath(notes, when, { far = false, muraiki = 0, pan = -0.18 } = {}) {
    const buf = this.shaku && this.bank.get(this.shaku.file);
    if (!buf) return 0;
    const ctx = this.ctx;
    let t = when;
    const dest = far ? this.s.shakuFar : this.s.shakuBus;
    notes.forEach(([midi, dur], k) => {
      const rate = Math.pow(2, (midi - this.shaku.midi) / 12);
      const first = k === 0, last = k === notes.length - 1;
      const offset = first ? 0 : 0.35;
      dur = Math.min(dur, (buf.duration - offset) / rate - 0.4);
      const { src, gain } = this.bank.play(buf, t, dest, { rate, gain: 0, pan: pan + R(-0.05, 0.05), offset, lp: far ? 2400 : 5200 });
      const g = gain.gain, p = src.playbackRate;
      const peak = (far ? 0.15 : 0.22) * R(0.85, 1.05) * (midi > 72 ? 0.85 : 1);
      const att = first ? R(0.35, 0.7) : 0.12;
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(peak * 0.75, t + att);
      g.linearRampToValueAtTime(peak, t + dur * 0.55);
      g.linearRampToValueAtTime(last ? 0 : peak * 0.7, t + dur + (last ? 0 : 0.1));
      // in from below; the breath's last note sinks as the air runs out
      const from = first ? R(0.5, 1.0) : R(0.15, 0.4);
      p.setValueAtTime(rate * Math.pow(2, -from / 12), t);
      p.exponentialRampToValueAtTime(rate, t + (first ? 0.45 : 0.18));
      if (last) {
        p.setValueAtTime(rate, t + dur - 0.5);
        p.linearRampToValueAtTime(rate * Math.pow(2, -0.3 / 12), t + dur);
      }
      if (dur > 1.6) {
        const lfo = ctx.createOscillator(), d = ctx.createGain();
        lfo.frequency.value = R(4.2, 5.4);
        d.gain.setValueAtTime(0, t);
        d.gain.setValueAtTime(0, t + dur * 0.45);
        d.gain.linearRampToValueAtTime(rate * (Math.pow(2, R(14, 26) / 1200) - 1), t + dur * 0.9);
        lfo.connect(d).connect(p);
        lfo.start(t); lfo.stop(t + dur + 0.2);
      }
      src.stop(t + dur + 0.25);
      if (first || muraiki > 0.5) this.s.breathNoise(t, first ? 0.5 : 0.25, dest, muraiki, pan);
      t += dur + (last ? 0 : 0.02);
    });
    return t - when;
  }

  // shō: a held aitake, refitted to the mode and handed over to the next with a long crossfade
  shoChord(when) {
    const pcs = MODES[this.mode].pcs;
    const fits = [];
    this.shoChords.forEach((c, ci) => {
      for (let t = -5; t <= 5; t++) {
        const foreign = c.pcs.filter((p) => !pcs.includes((p + t + 12) % 12)).length;
        if (foreign === 0 || (foreign === 1 && this.mode === 'yo' && t === 0)) fits.push({ ci, t, w: 1 / (1 + Math.abs(t)) });
      }
    });
    if (!fits.length) return when + 4;
    const options = fits.filter((f) => f.ci !== this.sho.chord || fits.length === 1);
    const f = weighted(options.map((o) => [o.w, o]));
    this.sho.chord = f.ci;
    const c = this.shoChords[f.ci];
    const buf = this.bank.get(c.file);
    if (!buf) return when + 1;
    const rate = Math.pow(2, (f.t * 100 - c.cents) / 1200);
    const len = buf.duration / rate;
    const { gain } = this.bank.play(buf, when, this.shoBus, { rate, gain: 0, pan: R(-0.15, 0.15) });
    // the player's breath: a slow swell through the chord
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(0.55, when + 2.5);
    gain.gain.linearRampToValueAtTime(0.75, when + len * 0.6);
    gain.gain.linearRampToValueAtTime(0, when + len);
    return when + len - 3.2;
  }

  // ------------------------------------------------------------ koto gestures (each returns its length)
  tenTonShan(t0) {
    this.str(0, t0, { vel: 0.8 });
    this.str(4, t0 + 0.62, { vel: 0.72 });
    this.str(4, t0 + 1.3, { vel: 0.85 });
    this.str(9, t0 + 1.3, { vel: 0.75 });
    return 3.2;
  }

  kororin(t0, top) {
    const v = [0.7, 0.58, 0.82];
    for (let k = 0; k < 3; k++) this.str(top - k, t0 + [0, 0.13, 0.25][k], { vel: v[k] });
    return 1.6;
  }

  sararin(t0, from, n) {
    for (let k = 0; k < n; k++) this.str(from + k, t0 + k * R(0.032, 0.042), { vel: k === n - 1 ? 0.85 : 0.5 + k * 0.04 });
    return 1.8;
  }

  nagashi(t0, from, to) {
    let t = t0;
    for (let i = from; i >= to; i--) { this.str(i, t, { vel: i === to ? 0.82 : 0.45 + (i - to) * 0.02 }); t += R(0.04, 0.055); }
    return t - t0 + 1.4;
  }

  awase(t0, low) {
    const i = clamp(low + Math.floor(R(0, 4)), 1, 7);
    this.str(i, t0, { vel: 0.8 });
    this.str(i + 5, t0 + 0.012, { vel: 0.66 });
    return 2.2;
  }

  // a melodic line: a walk over neighbouring strings that slows at the start and the end (jo-ha-kyū in small)
  line(t0, low, n) {
    let i = clamp(low + 3 + Math.floor(R(0, 5)), low, 12);
    let t = t0;
    for (let k = 0; k < n; k++) {
      const lastNote = k === n - 1;
      const step = weighted([[3, -1], [2, 1], [1.4, -2], [1, 2], [0.5, 0], [0.4, -5], [0.3, 5]]);
      if (k) i = clamp(i + step, low, 12);
      const opts = { vel: R(0.55, 0.85) };
      if (lastNote && Math.random() < 0.6) opts.bend = { at: R(0.35, 0.6), to: this.stepUp(i), dur: R(0.18, 0.3), back: Math.random() < 0.5 ? R(0.3, 0.6) : 0 };
      else if (lastNote) opts.yuri = R(10, 18);
      else if (Math.random() < 0.12) { opts.press = this.stepUp(i); }
      this.str(i, t, opts);
      if (!lastNote && Math.random() < 0.12) this.str(i, t + 0.16, { vel: opts.vel * 0.6, dull: true }); // sukui
      const u = k / Math.max(1, n - 1);
      t += lastNote ? 0 : 0.95 - 0.55 * Math.sin(u * Math.PI) + R(-0.08, 0.12);
    }
    return t - t0 + 2.6;
  }

  sakura(t0) {
    // the opening of Sakura Sakura, in hirajōshi as the koto plays it
    const tune = [[6, 1], [6, 1], [7, 2], [6, 1], [6, 1], [7, 2], [6, 1], [7, 1], [8, 1], [7, 1], [6, 1], [7, 0.5], [6, 0.5], [5, 2.5]];
    const beat = 0.62;
    let t = t0;
    tune.forEach(([i, b], k) => {
      this.str(i, t, { vel: k % 3 === 0 ? 0.78 : 0.64, yuri: b >= 2 ? 14 : 0 });
      t += b * beat;
    });
    return t - t0 + 2;
  }

  // the bridge: two-beat bars that quicken toward the arch and broaden on the last bars
  danmono(t0) {
    const bars = 14;
    const cells = ['n-n-', 'd-d-', 'n-nn', 'nnn-', 'd-n-', 'k-n-', 'n-d-', 'nn-n'];
    let t = t0, i = 9, dir = -1;
    for (let b = 0; b < bars; b++) {
      const u = b / (bars - 1);
      const bpm = b < bars - 2 ? 62 + 34 * smoothstep(0, 0.85, u) : 74 - (b - (bars - 3)) * 8;
      const e = 30 / bpm; // an eighth
      const cell = b === 0 ? 'd---' : b === bars - 1 ? 'd---' : pick(cells);
      for (const c of cell) {
        if (c === 'n') this.str(i, t, { vel: R(0.6, 0.8) });
        if (c === 'd') { this.str(clamp(i - 5, 1, 7), t, { vel: 0.85 }); this.str(clamp(i - 5, 1, 7) + 5, t + 0.01, { vel: 0.7 }); }
        if (c === 'k') { this.kororin(t, clamp(i + 1, 3, 12)); }
        if (c !== '-') {
          i += dir * (Math.random() < 0.7 ? 1 : 2);
          if (i <= 4) dir = 1;
          if (i >= 11) dir = -1;
          i = clamp(i, 3, 12);
        }
        t += e;
      }
    }
    return t - t0 + 3;
  }

  // the torii: a short cell repeated and slowly displaced, the way the gates repeat
  gates(t0, low) {
    const base = clamp(low + 2 + Math.floor(R(0, 3)), 3, 9);
    const cell = [base + 3, base + 1, base + 2, base];
    let t = t0;
    const n = 2 + Math.floor(R(0, 2));
    for (let r = 0; r < n; r++) {
      cell.forEach((i, k) => this.str(i + (r === n - 1 && k === 3 ? -1 : 0), t + k * 0.42 + r * 0.03, { vel: 0.5 + (k === 0 ? 0.15 : 0) }));
      t += 4 * 0.42 + R(0.5, 0.9);
    }
    return t - t0 + 2;
  }

  // ------------------------------------------------------------ phrases
  kotoPhrase(t0, ctxs) {
    const p = PLACE[ctxs.place] || PLACE.sakura;
    const low = ctxs.season === 3 ? 1 : p.low;
    if (ctxs.place === 'sakura' && ctxs.season === 0 && !this.visit.sakura && ctxs.t > 0.35) {
      this.visit.sakura = true;
      return this.sakura(t0);
    }
    if (ctxs.place === 'torii' && Math.random() < 0.6) return this.gates(t0, low);
    if (!this.visit.kyu && ctxs.t > 0.72 && ctxs.t < 0.95) {
      this.visit.kyu = true;
      return Math.random() < 0.5 ? this.nagashi(t0, 12, low + 1) : this.sararin(t0, low + 2, 6) + this.line(t0 + 1.4, low, 3);
    }
    return weighted([
      [5, () => this.line(t0, low, 3 + Math.floor(R(0, 4)))],
      [1.4, () => this.kororin(t0, clamp(low + 5 + Math.floor(R(0, 4)), 3, 12)) + this.line(t0 + 1.6, low, 2)],
      [1.5, () => this.awase(t0, low) + (Math.random() < 0.6 ? this.line(t0 + 1.8, low, 2 + Math.floor(R(0, 2))) : 0)],
      [0.6, () => this.sararin(t0, low + 1 + Math.floor(R(0, 3)), 4 + Math.floor(R(0, 3)))],
    ])();
  }

  // honkyoku cells, as steps through the mode's shakuhachi notes; most end on a long tone
  shakuPhrase(t0, ctxs, far = false) {
    const set = MODES[this.mode].shaku;
    const cells = [[0], [3], [3, 2], [4, 3], [2, 3], [1, 0], [3, 4, 3], [4, 2, 3], [5, 4], [0, 1, 0], [2, 1, 0], [5, 3]];
    const cell = pick(cells);
    const slow = 1 + ctxs.night * 0.3 + (ctxs.season === 3 ? 0.3 : 0);
    const notes = cell.map((d, k) => [set[clamp(d, 0, set.length - 1)], (k === cell.length - 1 ? R(2.6, 4.6) : R(1.0, 2.2)) * slow]);
    const muraiki = ctxs.place === 'gorge' ? R(0.6, 1) : Math.random() < 0.15 ? 0.6 : 0;
    const len = this.breath(notes, t0, { far, muraiki, pan: far ? 0.42 : -0.2 });
    // autumn: a second flute answers from across the water (Shika no Tōne's two deer)
    if (!far && ctxs.season === 2 && Math.random() < 0.55) {
      const ans = cell.map((d, k) => [set[clamp(d + (Math.random() < 0.5 ? 1 : 0), 0, set.length - 1)], (k === cell.length - 1 ? R(2.4, 3.8) : R(1.0, 1.8)) * slow]);
      return len + R(0.8, 1.8) + this.breath(ans, t0 + len + R(0.8, 1.8), { far: true, muraiki: 0, pan: 0.45 });
    }
    return len;
  }

  // ------------------------------------------------------------ the conductor
  modeFor(c) {
    const base = ['hira', 'yo', 'kumoi', 'kumoi'][c.season];
    if (c.place === 'asagiri' && c.season < 2) return 'yo';
    if (c.place === 'torii' && c.season !== 3) return 'yo';
    if (c.place === 'lake' && c.night > 0.5) return 'kumoi';
    return base;
  }

  arrive(place, now, c) {
    this.place = place;
    this.visit = { kyu: false, sakura: false };
    this.mode = this.modeFor({ ...c, place });
    const t = now + 1.4;
    let len = 0;
    if (place === 'asagiri') len = this.breath([[62, 5.5]], t, { muraiki: 0.4 });
    if (place === 'sakura') len = this.tenTonShan(t);
    if (place === 'bridge') { len = this.danmono(t + 2); this.danmonoUntil = t + 2 + len; }
    if (place === 'village') len = 0;
    if (place === 'gorge') len = this.breath([[67, 2], [62, 4.5]], t, { muraiki: 0.9 });
    if (place === 'torii') { this.s.oneShot('suzu', t, { gain: 0.5, pan: 0.3 }); len = 3; }
    if (place === 'lake') len = this.sararin(t, 6, 6) + this.line(t + 1.8, 5, 3);
    this.floorUntil = Math.max(this.floorUntil, t + len);
    this.next.koto = Math.max(this.next.koto, t + len + R(2, 5));
    this.next.shaku = Math.max(this.next.shaku, t + len + R(3, 7));
  }

  update(now, c) {
    if (!this.ready) return;
    if (c.place !== this.place) this.arrive(c.place, now, c);
    const p = PLACE[c.place] || PLACE.sakura;
    // jo-ha-kyū over the place: quiet on arrival, fuller through the middle, thinning before the next
    const arc = (0.55 + 0.45 * smoothstep(0.04, 0.55, c.t)) * (1 - 0.35 * smoothstep(0.86, 1, c.t));
    const hush = (1 - c.rain * 0.3) * (c.season === 3 ? 0.65 : 1) * (1 - c.snow * 0.2);
    const kotoW = p.koto * arc * hush * (1 - c.night * 0.45);
    const shakuW = p.shaku * arc * hush * (0.75 + c.night * 0.5 + c.mist * 0.3 + c.rain * 0.3);

    // the shō holds through its places; its chords change when one ends
    const shoTarget = p.sho * (0.75 + 0.25 * (1 - c.daylight)) * (c.season === 3 ? 0.8 : 1);
    this.shoBus.gain.setTargetAtTime(shoTarget * 0.32, now, 3);
    if (shoTarget > 0.05 && now > this.sho.until - 0.5) this.sho.until = this.shoChord(Math.max(now + 0.05, this.sho.until));

    if (now > this.danmonoUntil) {
      if (now > this.next.koto && kotoW > 0.05) {
        const t0 = Math.max(now + 0.1, this.floorUntil + (this.lastVoice === 'shaku' ? R(0.4, 1.4) : 0));
        if (t0 - now < 4) {
          this.mode = this.modeFor(c);
          const len = Math.random() < kotoW ? this.kotoPhrase(t0, c) : 0;
          this.floorUntil = t0 + len;
          this.lastVoice = len ? 'koto' : this.lastVoice;
          this.next.koto = t0 + len + (len * R(0.4, 1.1) + R(2.5, 5)) / Math.max(0.25, kotoW);
        }
      }
      if (now > this.next.shaku && shakuW > 0.05) {
        // the flute answers the koto, or speaks into the silence after it
        const t0 = Math.max(now + 0.2, this.floorUntil + R(0.5, 1.6));
        if (t0 - now < 5) {
          this.mode = this.modeFor(c);
          const len = Math.random() < Math.min(1, shakuW * 1.4) ? this.shakuPhrase(t0, c) : 0;
          this.floorUntil = Math.max(this.floorUntil, t0 + len);
          this.lastVoice = len ? 'shaku' : this.lastVoice;
          this.next.shaku = t0 + len + (len * R(0.8, 2.0) + R(4, 9)) / Math.max(0.25, shakuW);
        }
      }
    }
  }
}

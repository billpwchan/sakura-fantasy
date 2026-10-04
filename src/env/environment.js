// Time of day, season and weather: targets set by the journey or the viewer, eased into the shared uniforms.
import * as THREE from 'three';
import { U } from '../core/shared.js';
import { clamp, lerp, smoothstep } from '../lib/math.js';

// sky keyframes by sun elevation (sine of altitude); colours are linear HDR
const KF = [
  { e: -0.4, zen: [0.0035, 0.0065, 0.016], hor: [0.010, 0.016, 0.03], sun: [0, 0, 0], fs: [0.016, 0.022, 0.04], fa: [0.010, 0.016, 0.03], up: [0.020, 0.030, 0.055], dn: [0.004, 0.005, 0.008], exp: 3.4 },
  { e: -0.14, zen: [0.012, 0.02, 0.055], hor: [0.07, 0.06, 0.1], sun: [0, 0, 0], fs: [0.14, 0.08, 0.1], fa: [0.035, 0.045, 0.08], up: [0.035, 0.045, 0.08], dn: [0.008, 0.008, 0.012], exp: 2.6 },
  { e: -0.03, zen: [0.045, 0.07, 0.17], hor: [0.62, 0.3, 0.2], sun: [1.2, 0.4, 0.15], fs: [0.75, 0.36, 0.2], fa: [0.13, 0.15, 0.22], up: [0.1, 0.12, 0.2], dn: [0.03, 0.025, 0.03], exp: 1.7 },
  { e: 0.06, zen: [0.085, 0.15, 0.33], hor: [1.05, 0.56, 0.27], sun: [5.4, 2.7, 1.1], fs: [1.3, 0.72, 0.34], fa: [0.3, 0.33, 0.42], up: [0.26, 0.29, 0.4], dn: [0.12, 0.08, 0.05], exp: 1.15 },
  { e: 0.2, zen: [0.09, 0.2, 0.46], hor: [0.85, 0.7, 0.55], sun: [6.2, 4.5, 2.8], fs: [1.15, 0.86, 0.56], fa: [0.38, 0.46, 0.58], up: [0.36, 0.44, 0.6], dn: [0.16, 0.13, 0.09], exp: 0.95 },
  { e: 0.5, zen: [0.08, 0.24, 0.6], hor: [0.62, 0.74, 0.88], sun: [6.6, 6.0, 5.3], fs: [0.9, 0.9, 0.86], fa: [0.5, 0.62, 0.78], up: [0.45, 0.56, 0.75], dn: [0.17, 0.15, 0.11], exp: 0.85 },
  { e: 1.01, zen: [0.07, 0.22, 0.58], hor: [0.6, 0.73, 0.88], sun: [6.8, 6.3, 5.7], fs: [0.9, 0.92, 0.9], fa: [0.5, 0.62, 0.8], up: [0.46, 0.58, 0.78], dn: [0.18, 0.16, 0.12], exp: 0.82 },
];

export const WEATHERS = {
  clear: { cloud: 0.42, dark: 0, fog: 1, mist: 0.55, rain: 0, wet: 0, snow: 0, sun: 1, flash: 0, wind: 0.45 },
  mist: { cloud: 0.5, dark: 0.12, fog: 3.2, mist: 1.8, rain: 0, wet: 0.25, snow: 0, sun: 0.55, flash: 0, wind: 0.2 },
  rain: { cloud: 0.86, dark: 0.42, fog: 2.1, mist: 1.0, rain: 0.6, wet: 1, snow: 0, sun: 0.22, flash: 0, wind: 0.7 },
  storm: { cloud: 1.0, dark: 0.7, fog: 2.6, mist: 1.2, rain: 1, wet: 1, snow: 0, sun: 0.06, flash: 1, wind: 1.15 },
  snow: { cloud: 0.86, dark: 0.28, fog: 2.6, mist: 0.6, rain: 0, wet: 0, snow: 1, sun: 0.35, flash: 0, wind: 0.35 },
};
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

const mix3 = (out, a, b, t) => out.set(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));

const E = new THREE.Vector3(-0.62, 0, 0.78).normalize(); // sunrise azimuth (behind-left); sets ahead-right
const S = new THREE.Vector3(0.78, 0, 0.62).normalize(); // noon tilt toward the right bank

export function sunDirAt(hours, out = new THREE.Vector3()) {
  const a = ((hours - 6) / 12) * Math.PI;
  out.copy(E).multiplyScalar(Math.cos(a));
  out.addScaledVector(S, Math.sin(a) * 0.5);
  out.y = Math.sin(a) * 0.86;
  return out.normalize();
}

export class Environment {
  constructor() {
    this.hours = 17.2;
    this.hoursTarget = 17.2;
    this.season = 0; // index into SEASONS
    this.seasonW = new THREE.Vector4(1, 0, 0, 0);
    this.weather = 'clear';
    this._tint = new THREE.Vector3();
    this._moonCol = new THREE.Vector3();
    this.w = { ...WEATHERS.clear };
    this.exposure = 1;
    this.snowGround = 0; // settled snow, accumulates slowly
    this.lightning = { next: 4, flash: 0, strikes: [] };
    this.sunVis = 1;
    this.daylight = 1;
    this.lampOn = 0;
    this.cloud = 0.3;
    this.dark = 0;
    this.c = { zen: new THREE.Vector3(), hor: new THREE.Vector3(), sun: new THREE.Vector3(), fs: new THREE.Vector3(), fa: new THREE.Vector3(), up: new THREE.Vector3(), dn: new THREE.Vector3() };
    this._sun = new THREE.Vector3();
    this._moon = new THREE.Vector3();
    this.onStrike = null;
    this.update(0, true);
  }

  setSeason(i) { this.season = ((i % 4) + 4) % 4; }
  setWeather(name) { if (WEATHERS[name]) this.weather = name; }

  // shortest way round the clock, so 23h -> 1h moves forward
  setHours(h, snap = false) {
    this.hoursTarget = ((h % 24) + 24) % 24;
    if (snap) this.hours = this.hoursTarget;
  }

  update(dt, snap = false) {
    // ease time toward its target along the shorter arc
    let dh = this.hoursTarget - this.hours;
    if (dh > 12) dh -= 24;
    if (dh < -12) dh += 24;
    const maxRate = 1.6; // hours per second at most, so a dial spin still reads as a sweep
    this.hours += snap ? dh : clamp(dh * Math.min(1, dt * 1.8), -maxRate * dt, maxRate * dt);
    this.hours = ((this.hours % 24) + 24) % 24;

    // weather and season ease
    const k = snap ? 1 : 1 - Math.exp(-dt * 0.45);
    const tw = WEATHERS[this.weather];
    for (const key in tw) this.w[key] = lerp(this.w[key], tw[key], k);
    const ks = snap ? 1 : 1 - Math.exp(-dt * 0.9);
    const target = [0, 0, 0, 0];
    target[this.season] = 1;
    this.seasonW.set(lerp(this.seasonW.x, target[0], ks), lerp(this.seasonW.y, target[1], ks), lerp(this.seasonW.z, target[2], ks), lerp(this.seasonW.w, target[3], ks));
    U.uSeason.value.copy(this.seasonW);

    // snow settles in winter or under falling snow, melts otherwise
    const snowTarget = Math.max(this.seasonW.w * 0.9, this.w.snow * 0.95);
    this.snowGround = snap ? snowTarget : lerp(this.snowGround, snowTarget, 1 - Math.exp(-dt * (snowTarget > this.snowGround ? 0.25 : 0.4)));
    U.uSnow.value = this.snowGround;

    // sun and moon
    const sun = sunDirAt(this.hours, this._sun);
    const moon = sunDirAt(this.hours + 12.6, this._moon);
    moon.y = Math.max(moon.y, 0.12) * 0.9 + 0.08;
    moon.normalize();
    U.uTrueSun.value.copy(sun);
    U.uMoonDir.value.copy(moon);

    // palette at this sun elevation
    const e = sun.y;
    let i = 0;
    while (i < KF.length - 2 && KF[i + 1].e < e) i++;
    const a = KF[i], b = KF[i + 1];
    const t = smoothstep(a.e, b.e, e);
    const c = this.c;
    for (const key of ['zen', 'hor', 'sun', 'fs', 'fa', 'up', 'dn']) mix3(c[key], a[key], b[key], t);
    this.exposure = lerp(a.exp, b.exp, t);

    // weather darkens, greys and flattens the light
    const w = this.w;
    const dark = w.dark, grey = clamp(w.cloud * 1.1 - 0.35, 0, 1);
    const lum = (v) => v.x * 0.3 + v.y * 0.55 + v.z * 0.15;
    const desat = (v, amt, mul) => {
      const l = lum(v);
      v.set(lerp(v.x, l, amt), lerp(v.y, l * 1.02, amt), lerp(v.z, l * 1.08, amt)).multiplyScalar(mul);
    };
    desat(c.zen, grey * 0.8, 1 - dark * 0.55);
    desat(c.hor, grey * 0.75, 1 - dark * 0.5);
    desat(c.fs, grey * 0.7, 1 - dark * 0.45);
    desat(c.fa, grey * 0.6, 1 - dark * 0.45);
    desat(c.up, grey * 0.5, 1 - dark * 0.35);
    c.sun.multiplyScalar(w.sun);
    // winter air is colder and paler
    const wint = this.seasonW.w;
    c.fa.lerp(this._tint.set(c.fa.x * 0.92, c.fa.y * 1.0, c.fa.z * 1.1), wint);
    this.exposure *= 1 + dark * 0.35;

    // the moon takes over below the horizon
    const night = smoothstep(0.02, -0.16, e);
    this.night = night;
    U.uNight.value = night;
    const moonCol = this._moonCol.set(0.13, 0.17, 0.28).multiplyScalar((1 - w.dark * 0.8) * 1.0);
    const dominantSun = e > -0.06;
    // fade the key light through the swap so shadows never jump
    const swap = dominantSun ? smoothstep(-0.06, 0.0, e) : smoothstep(-0.06, -0.14, e);
    if (dominantSun) {
      U.uSunDir.value.copy(sun);
      U.uSunCol.value.copy(c.sun).multiplyScalar(swap);
    } else {
      U.uSunDir.value.copy(moon);
      U.uSunCol.value.copy(moonCol).multiplyScalar(swap);
    }
    this.keyIsSun = dominantSun;
    this.daylight = smoothstep(-0.1, 0.15, e);
    this.lampOn = smoothstep(0.12, -0.04, e) * 0.85 + smoothstep(0.05, -0.1, e) * 0.15;

    U.uSkyZen.value.copy(c.zen);
    U.uSkyHor.value.copy(c.hor);
    U.uFogSun.value.copy(c.fs);
    U.uFogAway.value.copy(c.fa);
    U.uAmbUp.value.copy(c.up);
    U.uAmbDown.value.copy(c.dn);

    const fogMul = w.fog * (1 + 0.6 * smoothstep(0.25, -0.05, e) * (this.weather === 'clear' ? 0.6 : 0));
    U.uFogParams.value.set(0.00007 * fogMul, 0.001 * fogMul, 0.011, 0);
    // dawn and dusk mist is thicker
    const lowSun = 1 - smoothstep(0.05, 0.35, Math.abs(e - 0.02));
    U.uMist.value = w.mist * (1 + 0.8 * lowSun + 0.6 * night);
    U.uRain.value = w.rain;
    U.uWet.value = lerp(U.uWet.value, Math.max(w.wet, w.rain), snap ? 1 : 1 - Math.exp(-dt * (w.wet > U.uWet.value ? 0.5 : 0.08)));
    U.uWind.value.z = w.wind;
    this.cloud = w.cloud;
    this.dark = dark;
    this.sunVis = w.sun;

    // lightning: a strike every few seconds at full storm
    const L = this.lightning;
    L.flash = Math.max(0, L.flash - dt * 6);
    if (w.flash > 0.5 && !snap) {
      L.next -= dt;
      if (L.next <= 0) {
        L.next = 3 + Math.random() * 9;
        L.flash = 1;
        L.pulses = [0, 0.09 + Math.random() * 0.08, 0.25 + Math.random() * 0.2];
        L.t = 0;
        if (this.onStrike) this.onStrike();
      }
    }
    if (L.pulses) {
      L.t += dt;
      let f = 0;
      for (const p of L.pulses) f = Math.max(f, Math.exp(-Math.max(0, L.t - p) * 14) * (L.t >= p ? 1 : 0));
      U.uFlash.value = f * 2.2 * w.flash;
      if (L.t > 1.2) L.pulses = null;
    } else U.uFlash.value = 0;
  }
}

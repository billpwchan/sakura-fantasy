// The interface: an ink-circle loader, the opening title, chapter cards that ink themselves in with the place's
// haiku and the poet's seal, the scroll of the journey, a kanji dock for season, hour, weather, camera and sound,
// the page-turn between seasons, and a photo mode.
import './ui.css';
import { PLACES } from '../world/layout.js';
import { HAIKU, POETS, SEASON_CARDS } from '../journey/haiku.js';

const $ = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const chars = (s, delay0 = 0, step = 0.09) => [...s].map((c, i) => `<span class="ch" style="animation-delay:${(delay0 + i * step).toFixed(2)}s">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const BRANCH = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const NUM = ['一', '二', '三', '四', '五', '六', '七'];
const GLYPH = { asagiri: '朝', sakura: '桜', bridge: '橋', village: '塔', gorge: '竹', torii: '鳥', lake: '湖' };
const SEASON_BTN = [['春', 'Spring'], ['夏', 'Summer'], ['秋', 'Autumn'], ['冬', 'Winter']];
const WEATHER_BTN = [['clear', '晴', 'Clear'], ['mist', '霧', 'Mist'], ['rain', '雨', 'Rain'], ['storm', '嵐', 'Storm'], ['snow', '雪', 'Snow']];
const CAM_BTN = [['follow', '随', 'Follow'], ['seat', '座', 'Passenger'], ['cinema', '映', 'Cinematic']];

// washi fibre, drawn once as an SVG noise tile
const FIBRE = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='0.012' numOctaves='3' seed='4' result='c'/><feTurbulence type='fractalNoise' baseFrequency='0.55 0.11' numOctaves='2' seed='9' result='h'/><feComposite in='h' in2='c' operator='arithmetic' k2='0.35' k3='0.65'/><feColorMatrix values='0 0 0 0 0.6  0 0 0 0 0.54  0 0 0 0 0.46  0 0 0 0.32 0'/></filter><rect width='100%' height='100%' filter='url(#f)'/></svg>`)}")`;

export class UI {
  constructor() {
    document.documentElement.style.setProperty('--fibre', FIBRE);
    this.root = $('div', 'pre');
    this.root.id = 'ui';
    document.body.appendChild(this.root);
    this.buildLoader();
    this.lastUpdate = 0;
    this.cardTimer = null;
    this.dragging = false;
    this.pending = null;
  }

  attach(app) {
    this.app = app;
    this.buildChrome();
    this.bindIdle();
  }

  // with a mouse, the chrome steps back after a few still seconds and returns on the slightest movement
  bindIdle() {
    let timer = 0;
    const canHover = window.matchMedia('(hover: hover)').matches;
    const wake = (e) => {
      this.root.classList.remove('idle');
      clearTimeout(timer);
      if (!canHover || (e.pointerType && e.pointerType !== 'mouse')) return;
      timer = setTimeout(() => this.root.classList.add('idle'), 4500);
    };
    this.wake = wake;
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
  }

  // straight into the world, for links that set the scene in the URL
  skip() {
    this.loader.classList.add('done');
    this.root.classList.remove('pre');
  }

  // ------------------------------------------------------------ loader
  buildLoader() {
    const L = document.getElementById('load');
    L.innerHTML = '';
    const stage = $('div', 'stage');
    stage.appendChild(this.ensoSvg());
    this.loadTitle = $('div', 'title', '<span>桜</span><span>幻</span><span>想</span>');
    stage.appendChild(this.loadTitle);
    const foot = $('div', 'foot');
    foot.innerHTML = '<div class="sub">Sakura Fantasy</div><div class="motto">一舟　四季　千灯</div>';
    this.go = $('button', 'go', '<span class="seal">出舟</span><span class="lbl"><b>舟を出す</b><i>Set sail</i></span>');
    foot.appendChild(this.go);
    stage.appendChild(foot);
    L.appendChild(stage);
    for (let i = 0; i < 14; i++) {
      const p = $('div', 'petal');
      p.style.left = `${10 + Math.random() * 100}vw`;
      p.style.animationDuration = `${9 + Math.random() * 9}s`;
      p.style.animationDelay = `${-Math.random() * 14}s`;
      p.style.transform = `scale(${0.6 + Math.random()})`;
      L.appendChild(p);
    }
    this.loader = L;
    this.shown = 0;
  }

  // an ensō as one loaded brush: a heavy press at the start, bristles that run dry and split toward the tail
  ensoSvg() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    svg.setAttribute('class', 'enso');
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const N = 260, a0 = (118 * Math.PI) / 180, sweep = (336 * Math.PI) / 180;
    const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const centre = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = a0 + t * sweep;
      const r = 72 + 2.2 * Math.sin(a * 3 + 1.1) + 1.3 * Math.sin(a * 5 + 0.3) - 3 * ss(0.85, 1, t);
      centre.push([100 + Math.cos(a) * r, 100 + Math.sin(a) * r, Math.cos(a), Math.sin(a)]);
    }
    const width = (t) => 15 * (1 + 0.45 * Math.exp(-t * 26)) * (1 - 0.62 * ss(0.45, 1, t)) * (0.92 + 0.08 * Math.sin(t * 19));
    let d = '';
    const K = 15;
    for (let k = 0; k < K; k++) {
      const o = (k + 0.5) / K - 0.5;
      const edge = Math.abs(o) * 2;
      const tEnd = 1 - edge * edge * (0.18 + rnd() * 0.22) - rnd() * 0.04;
      // the outer hairs touch down a moment after the centre: a rounded, pressed head
      const tStart = 0.028 * (1 - Math.sqrt(Math.max(0, 1 - edge * edge))) + rnd() * 0.003;
      const gap0 = edge > 0.5 && rnd() < 0.6 ? 0.55 + rnd() * 0.3 : 2;
      const gapL = 0.02 + rnd() * 0.05;
      const left = [], right = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        if (t > tEnd) break;
        if (t < tStart) continue;
        const [x, y, nx, ny] = centre[i];
        const w = width(t);
        let hw = (w / K) * 0.95 * (0.35 + 0.65 * ss(tStart, tStart + 0.012, t)) * (1 - ss(tEnd - 0.06, tEnd, t));
        if (t > gap0 && t < gap0 + gapL) hw *= 0.08;
        const off = o * w + Math.sin(t * 40 + k) * 0.25;
        left.push(`${(x + nx * (off - hw)).toFixed(2)} ${(y + ny * (off - hw)).toFixed(2)}`);
        right.push(`${(x + nx * (off + hw)).toFixed(2)} ${(y + ny * (off + hw)).toFixed(2)}`);
      }
      if (left.length > 2) d += `M${left.join('L')}L${right.reverse().join('L')}Z`;
    }
    const line = centre.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L');
    svg.innerHTML = `
      <defs>
        <filter id="ink" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="5" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.4"/>
        </filter>
        <mask id="draw" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
          <path class="pen" d="M${line}" fill="none" stroke="#fff" stroke-width="40" stroke-linecap="round"/>
        </mask>
      </defs>
      <g mask="url(#draw)"><path class="ink" d="${d}" filter="url(#ink)"/></g>`;
    this.pen = svg.querySelector('.pen');
    this.penLen = 0;
    return svg;
  }

  // loading can finish in a blink; the brush still takes its time
  progress(p) {
    this.target = Math.max(this.target || 0, Math.min(1, p));
    if (this.drawing) return;
    this.drawing = true;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.shown = Math.min(this.target, this.shown + dt / 2.6);
      if (!this.penLen) {
        this.penLen = this.pen.getTotalLength();
        this.pen.style.strokeDasharray = `${this.penLen} ${this.penLen}`;
      }
      // a brush slows into the press and out at the tail
      const k = this.shown, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.pen.style.strokeDashoffset = `${this.penLen * (1 - e)}`;
      this.loadTitle.querySelectorAll('span').forEach((s, i) => s.classList.toggle('in', k > 0.25 + i * 0.22));
      if (this.shown >= 1 && this.onDrawn) { this.onDrawn(); this.onDrawn = null; }
      if (this.shown < this.target) requestAnimationFrame(step);
      else this.drawing = false;
    };
    requestAnimationFrame(step);
  }

  async ready() {
    if (this.shown < 1) await new Promise((r) => { this.onDrawn = r; this.progress(1); });
    await wait(500);
    this.go.classList.add('on');
    return new Promise((res) => {
      const start = () => { window.removeEventListener('keydown', key); res(); };
      const key = (e) => { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); start(); } };
      this.go.addEventListener('click', start, { once: true });
      window.addEventListener('keydown', key);
    });
  }

  async open() {
    this.go.classList.remove('on');
    this.loader.classList.add('reveal');
    await wait(1500);
    this.title();
    await wait(2200);
    this.loader.classList.add('done');
  }

  // ------------------------------------------------------------ the opening title
  async title() {
    const t = $('div', 'titlecard chrome-free');
    t.innerHTML = `<div class="wrap"><div class="big">${chars('桜幻想', 0.2, 0.32)}</div><div class="small"><span class="a">${chars('一舟　四季　千灯', 1.3, 0.07)}</span><span class="b">${chars('Sakura Fantasy', 1.9, 0.045)}</span></div></div>`;
    this.root.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    await wait(7200);
    t.querySelectorAll('.ch').forEach((c, i) => { c.style.animationDelay = `${(i * 0.035).toFixed(2)}s`; });
    t.classList.remove('in');
    t.classList.add('out');
    await wait(2600);
    t.remove();
    this.root.classList.remove('pre');
    this.wake && this.wake({});
    if (this.pending) { this.chapter(...this.pending); this.pending = null; }
    this.hints.classList.add('on');
    setTimeout(() => this.hints.classList.remove('on'), 9000);
  }

  // ------------------------------------------------------------ chapter cards
  chapter(place, idx, season) {
    if (this.root.classList.contains('pre')) { this.pending = [place, idx, season]; return; }
    const h = HAIKU[place.id]?.[season];
    if (!h) return;
    const poet = POETS[h.by];
    if (this.card) this.card.remove();
    clearTimeout(this.cardTimer);
    const c = $('div', 'chapter');
    const strokeLen = 1000;
    c.innerHTML = `<div class="col">
      <svg class="stroke" viewBox="0 0 22 1000" preserveAspectRatio="none"><path d="M 11 6 C 13 220 9 520 12 760 C 12.5 860 11 930 11 994" style="stroke-dasharray:${strokeLen};stroke-dashoffset:${strokeLen}"/></svg>
      <div class="name">${chars(place.jp, 0.35, 0.16)}</div>
      <div class="kana">${chars(place.kana, 0.9, 0.04)}</div>
      <div class="num">${chars('第' + NUM[idx] + '景', 0.6, 0.08)}</div>
      <div class="haiku">${h.jp.map((l, i) => `<div class="line">${chars(l, 1.7 + i * 0.75, 0.07)}</div>`).join('')}<div class="poet"><div class="who">${chars(poet.jp, 4.0, 0.1)}</div><div class="seal" style="animation-delay:4.5s">${poet.seal}</div></div></div></div>
      <div class="en"><div class="place mask" style="animation-delay:1.2s">${place.en}</div><div class="verse mask" style="animation-delay:3.4s">${h.en.join('<br>')}</div><div class="by mask" style="animation-delay:4.6s">— ${poet.en}</div></div>`;
    this.root.appendChild(c);
    this.card = c;
    this.scrimR.classList.add('on');
    const path = c.querySelector('.stroke path');
    requestAnimationFrame(() => {
      c.classList.add('in');
      path.style.transition = 'stroke-dashoffset 2.6s cubic-bezier(0.22, 0.8, 0.2, 1)';
      path.style.strokeDashoffset = '0';
    });
    this.cardTimer = setTimeout(() => {
      c.classList.add('out');
      this.scrimR.classList.remove('on');
      setTimeout(() => c.remove(), 2300);
    }, 14500);
  }

  // ------------------------------------------------------------ the page turn between seasons
  async paperIn(season) {
    const s = SEASON_CARDS[season];
    this.paperGlyph.textContent = s.jp;
    this.paperCap.innerHTML = `<span class="s"></span><span class="k">${s.kana}</span><span class="e">${s.en}</span>`;
    this.paper.style.transition = 'opacity 2.4s ease';
    this.paper.style.opacity = '1';
    if (this.card) { this.card.classList.add('out'); this.scrimR.classList.remove('on'); }
    await wait(2400);
    this.paperGlyph.classList.remove('in');
    void this.paperGlyph.offsetWidth;
    this.paperGlyph.classList.add('in');
    this.paper.classList.add('on');
  }

  async paperOut() {
    await wait(3600);
    this.paper.classList.remove('on');
    this.paper.style.transition = 'opacity 3.2s ease';
    this.paper.style.opacity = '0';
    await wait(1400);
  }

  async veil(on) {
    this.veilEl.style.opacity = on ? '1' : '0';
    await wait(on ? 700 : 900);
  }

  // ------------------------------------------------------------ chrome: scroll, dock, photo, about
  buildChrome() {
    const R = this.root;
    R.appendChild($('div', 'scrim bottom chrome'));
    this.scrimR = $('div', 'scrim right');
    R.appendChild(this.scrimR);

    // journey scroll
    const sc = $('div', 'scroll chrome');
    sc.innerHTML = `<div class="brand">桜幻想<small>Sakura Fantasy</small></div><div class="rail"></div><div class="done"></div>`;
    this.railDone = sc.querySelector('.done');
    const j = this.app.journey;
    this.nodes = PLACES.map((p, i) => {
      const n = $('button', 'node', `<span class="pip"></span><span class="g">${GLYPH[p.id]}</span><span class="tip"><b>${p.jp}</b><i>${p.en}</i></span>`);
      n.setAttribute('aria-label', `${p.jp} — ${p.en}`);
      n.style.top = `${(j.sAtZ(p.z) / j.total) * 100}%`;
      n.addEventListener('click', () => this.app.jumpTo(i));
      sc.appendChild(n);
      return n;
    });
    sc.appendChild($('div', 'end'));
    this.boatDot = $('div', 'boat');
    sc.appendChild(this.boatDot);
    R.appendChild(sc);

    // dock
    const d = $('div', 'dock chrome');
    const grp = (cat, cls = '') => {
      const g = $('div', 'grp ' + cls);
      const c = $('button', 'cat', cat);
      c.addEventListener('click', () => {
        const open = g.classList.contains('open');
        d.querySelectorAll('.grp.open').forEach((x) => x.classList.remove('open'));
        if (!open) g.classList.add('open');
      });
      g.appendChild(c);
      const row = $('div', 'row');
      g.appendChild(row);
      d.appendChild(g);
      return row;
    };
    const btn = (row, glyph, tip, fn, cls = '') => {
      const b = $('button', 'b ' + cls, `${glyph}<span class="tip">${tip}</span>`);
      b.setAttribute('aria-label', tip);
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      row.appendChild(b);
      return b;
    };
    const sep = () => d.appendChild($('div', 'sep'));

    const rs = grp('季');
    this.seasonBtns = SEASON_BTN.map(([g, t], i) => btn(rs, g, t, () => this.app.setSeason(i)));
    sep();
    const rt = grp('時');
    const time = $('div', 'time');
    this.slider = $('input');
    Object.assign(this.slider, { type: 'range', min: 0, max: 24, step: 0.05 });
    this.slider.setAttribute('aria-label', 'Hour of day');
    this.slider.addEventListener('input', () => { this.dragging = true; this.app.setHours(parseFloat(this.slider.value)); });
    this.slider.addEventListener('change', () => { this.dragging = false; });
    this.clock = $('div', 'clock', '<b></b><i></i>');
    time.appendChild(this.slider);
    time.appendChild(this.clock);
    rt.appendChild(time);
    this.autoTime = btn(rt, '自', 'Follow the journey', () => this.app.setAutoTime(!this.app.ctl.autoTime), 'auto');
    sep();
    const rw = grp('天');
    this.weatherBtns = WEATHER_BTN.map(([k, g, t]) => [k, btn(rw, g, t, () => this.app.setWeather(k))]);
    this.autoWeather = btn(rw, '自', 'Weather of each place', () => this.app.setAutoWeather(!this.app.ctl.autoWeather), 'auto');
    sep();
    const rc = grp('視');
    this.camBtns = CAM_BTN.map(([k, g, t]) => [k, btn(rc, g, t, () => this.app.director.setMode(k))]);
    sep();
    const ro = grp('', 'solo');
    this.sailBtn = btn(ro, '止', 'Moor', () => this.app.togglePause());
    this.soundBtn = btn(ro, '音', 'Sound', () => this.app.toggleSound());
    btn(ro, '写', 'Photograph', () => this.photo(true));
    btn(ro, '記', 'About', () => this.about.classList.add('on'));
    R.appendChild(d);
    document.addEventListener('pointerdown', (e) => { if (!d.contains(e.target)) d.querySelectorAll('.grp.open').forEach((x) => x.classList.remove('open')); });

    this.hints = $('div', 'hints', '<span><kbd>W S</kbd>速さ</span><span><kbd>A D</kbd>舵</span><span><kbd>Drag</kbd>見回す</span><span><kbd>Wheel</kbd>寄る</span><span><kbd>C</kbd>視点</span><span><kbd>Space</kbd>止まる</span>');
    R.appendChild(this.hints);

    // page of the scroll, veil, flash
    this.paper = $('div', 'paper');
    this.paperGlyph = $('div', 'glyph');
    this.paperCap = $('div', 'cap');
    // ink bleeding into the fibres at the glyph's edges
    this.paper.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute"><filter id="bleed" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`);
    const gw = $('div', 'glyph-wrap');
    gw.appendChild(this.paperGlyph);
    this.paper.appendChild(gw);
    this.paper.appendChild(this.paperCap);
    R.appendChild(this.paper);
    this.veilEl = $('div', 'veil');
    Object.assign(this.veilEl.style, { position: 'fixed', inset: '0', background: '#050407', opacity: '0', transition: 'opacity 0.7s ease', pointerEvents: 'none' });
    R.appendChild(this.veilEl);
    this.flash = $('div', 'flash');
    R.appendChild(this.flash);

    // photo mode
    this.photoEl = $('div', 'photo');
    this.photoEl.innerHTML = `<div class="frame"></div><div class="note">Drag to frame · Wheel to zoom</div>
      <div class="bar"><button class="side" data-k="exit">戻<i>Back</i></button><button class="shutter" aria-label="Take photograph">撮</button><button class="side" data-k="hold">止<i>Hold</i></button></div>`;
    this.photoEl.querySelector('.shutter').addEventListener('click', () => this.shoot());
    this.photoEl.querySelector('[data-k=exit]').addEventListener('click', () => this.photo(false));
    this.holdBtn = this.photoEl.querySelector('[data-k=hold]');
    this.holdBtn.addEventListener('click', () => this.app.togglePause());
    R.appendChild(this.photoEl);

    // about
    this.about = $('div', 'about');
    this.about.innerHTML = `<div class="sheet"><button class="x" aria-label="Close">✕</button>
      <h2>桜幻想<small>Sakura Fantasy</small></h2>
      <p>A boat journey down one river, through four seasons and a thousand lights — from the morning mist, under the cherry avenue and the vermilion bridge, past the village of the five-storey pagoda and through the bamboo gorge, beneath a thousand gates to the lake of the sacred tree. Each voyage turns the season.</p>
      <p>Inspired by Meng To’s <a href="https://x.com/MengTo/status/2102760783344189761" target="_blank" rel="noopener">Sakura River Valley</a>. Built from scratch with three.js; the <a href="https://github.com/billpwchan/sakura-fantasy" target="_blank" rel="noopener">source is on GitHub</a>. Haiku by Bashō, Buson, Issa, Shiki, Bonchō, Ryōkan and Chiyo-ni; English versions written for this piece.</p>
      <div class="keys"><b>W / S</b><span>faster, slower</span><b>A / D</b><span>steer</span><b>Drag · Wheel</b><span>look around, come closer</span><b>C</b><span>follow, passenger, cinematic</span><b>Space</b><span>moor or set off</span><b>M</b><span>sound on or off</span><b>P · H</b><span>photograph, hide the interface</span></div>
      <div class="colophon"><p class="credits">Textures and scanned rocks, ferns and logs from <a href="https://polyhaven.com" target="_blank" rel="noopener">Poly Haven</a> (CC0). Trees, flowers and grasses rendered from <a href="https://sketchfab.com/ffishAsia-and-floraZia" target="_blank" rel="noopener">ffish.asia / floraZia</a> plant scans (CC0). <a href="https://sketchfab.com/3d-models/komainu-statue-a5d4791ae95d4a9d9becedab6d2c7fc2" target="_blank" rel="noopener">Komainu Statue</a> by <a href="https://sketchfab.com/Z-gon" target="_blank" rel="noopener">Zgon</a> and <a href="https://sketchfab.com/3d-models/jizo-statue-in-kyoto-mtsu-animation-08f07b04c4384f8fa9b75e8203d9f26f" target="_blank" rel="noopener">Jizo statue in Kyoto</a> by <a href="https://sketchfab.com/fusion" target="_blank" rel="noopener">MTSU Animation Virtual Production</a>, from Sketchfab under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>, simplified and regraded. Temple bells by Echograin (Zōjō-ji) and LG (Raigō-in, Ōhara), keisu by milivolt, fūrin by Taira Komori and sutra chant by calebjay, from <a href="https://freesound.org" target="_blank" rel="noopener">Freesound</a> under CC BY 4.0; bell crickets by Cory, Wikimedia Commons, CC BY 2.1 JP. Koto from the <a href="https://github.com/sgossner/VCSL" target="_blank" rel="noopener">VCSL</a> Đàn tranh; shō, shakuhachi, Kyoto gardens and field recordings CC0 or public domain. <a href="https://github.com/billpwchan/sakura-fantasy/blob/main/CREDITS.md" target="_blank" rel="noopener">All sources</a>.</p><div class="seal">桜幻</div></div></div>`;
    this.about.addEventListener('click', (e) => { if (e.target === this.about || e.target.classList.contains('x')) this.about.classList.remove('on'); });
    R.appendChild(this.about);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyH') this.root.classList.toggle('hidden');
      if (e.code === 'KeyP') this.photo(!this.photoOn);
      if (e.code === 'Escape') { this.about.classList.remove('on'); if (this.photoOn) this.photo(false); }
    });
  }

  photo(on) {
    this.photoOn = on;
    this.root.classList.toggle('hidden', on);
    this.photoEl.classList.toggle('on', on);
    if (on) {
      this.prevMode = this.app.director.mode;
      this.app.director.setMode('photo');
    } else {
      this.app.director.setMode(this.prevMode && this.prevMode !== 'photo' ? this.prevMode : 'follow');
    }
  }

  async shoot() {
    this.photoEl.classList.remove('on');
    await new Promise((r) => requestAnimationFrame(r));
    const blob = await this.app.capture();
    this.flash.classList.remove('go');
    void this.flash.offsetWidth;
    this.flash.classList.add('go');
    this.photoEl.classList.add('on');
    if (!blob) return;
    const a = document.createElement('a');
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    a.href = URL.createObjectURL(blob);
    a.download = `sakura-fantasy-${stamp}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ------------------------------------------------------------ per-frame state (throttled)
  update(now) {
    if (now - this.lastUpdate < 120) return;
    this.lastUpdate = now;
    const { journey: j, env, ctl, director } = this.app;
    const f = j.progress;
    this.railDone.style.height = `${f * 100}%`;
    this.boatDot.style.top = `${f * 100}%`;
    this.nodes.forEach((n, i) => n.classList.toggle('past', i <= j.placeIdx));
    const h = env.hours;
    if (!this.dragging) this.slider.value = h.toFixed(2);
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    this.clock.firstChild.textContent = `${BRANCH[Math.floor(((h + 1) % 24) / 2)]}の刻`;
    this.clock.lastChild.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.seasonBtns.forEach((b, i) => b.classList.toggle('on', i === ctl.season));
    this.weatherBtns.forEach(([k, b]) => b.classList.toggle('on', k === env.weather));
    this.autoTime.classList.toggle('on', ctl.autoTime);
    this.autoWeather.classList.toggle('on', ctl.autoWeather);
    this.camBtns.forEach(([k, b]) => b.classList.toggle('on', k === director.mode));
    const moored = j.target === 0;
    this.sailBtn.firstChild.textContent = moored ? '行' : '止';
    this.sailBtn.querySelector('.tip').textContent = moored ? 'Set off' : 'Moor';
    this.sailBtn.classList.toggle('on', moored);
    this.holdBtn.firstChild.textContent = moored ? '行' : '止';
    this.soundBtn.classList.toggle('on', !!ctl.sound);
  }
}

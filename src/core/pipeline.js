// Frame orchestration: shadow -> reflection -> opaque (MSAA) -> depth/colour copy -> water + effects -> post.
// Owns the render scale and the frame-time governor.
import * as THREE from 'three';
import { Post } from './post.js';
import { Reflection, LAYER_WATER } from '../world/water.js';

export const LAYER_FX = 2; // transparent effects, drawn after the water, not reflected
export const LAYER_NOREFL = 3; // opaque but skipped by the mirror pass (grass, small props)

export class Pipeline {
  constructor(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true, alpha: false, preserveDrawingBuffer: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.autoClear = false;
    renderer.info.autoReset = false;
    renderer.setPixelRatio(1);
    this.renderer = renderer;
    this.canvas = canvas;

    const depthA = new THREE.DepthTexture(4, 4);
    depthA.type = THREE.UnsignedIntType;
    this.rtOpaque = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true, depthTexture: depthA, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    const depthB = new THREE.DepthTexture(4, 4);
    depthB.type = THREE.UnsignedIntType;
    this.rtMain = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, depthTexture: depthB, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.reflection = new Reflection();
    this.post = new Post(renderer);

    this.copyMat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tDepth: { value: null } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `precision highp float; uniform sampler2D tColor, tDepth; varying vec2 vUv;
        void main(){ gl_FragColor = texture2D(tColor, vUv); gl_FragDepth = texture2D(tDepth, vUv).x; }`,
      depthTest: true,
      depthWrite: true,
      depthFunc: THREE.AlwaysDepth,
    });

    this.scale = 1; // fraction of device pixels
    this.maxScale = 1;
    this.minScale = 0.5;
    this.reflScale = 0.5;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    // on a high-density screen a pixel is too small for 4x and 2x coverage to differ, while the GPU time 4x costs is
    // what keeps the frame from full resolution, and resolution is what reads as sharpness
    this.rtOpaque.samples = this.dpr >= 1.5 ? 2 : 4;
    this.frameTimes = new Float32Array(90);
    this.ftIdx = 0;
    this.ftCount = 0;
    this.cooldown = 2;
    this.lockScale = false;
    this.probeWait = 2; // seconds of clean frames before trying a higher scale; grows when a probe fails
    this.clean = 0;
    this.lastProbe = -1e9;
    this.lastEase = -1e9;
    this.preProbe = 1;
    this.probing = false;
    this.step = 1.1; // how far the next probe reaches; halves after each failure
    this.stallRate = 0;
    this.settle = 0;
    this.settleRun = 0;
    this.clock = 0;
    this._sorted = new Float32Array(90);
    this.shadowEvery = 1;
    this.frame = 0;
    this.sunUv = new THREE.Vector2();
    this._v = new THREE.Vector3();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.cssW = w; this.cssH = h;
    this.renderer.setSize(Math.round(w * this.dpr), Math.round(h * this.dpr), false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.applyScale();
  }

  applyScale() {
    const W = Math.max(2, Math.round(this.cssW * this.dpr * this.scale));
    const H = Math.max(2, Math.round(this.cssH * this.dpr * this.scale));
    this.W = W; this.H = H;
    this.rtOpaque.setSize(W, H);
    this.rtMain.setSize(W, H);
    this.reflection.setSize(Math.round(W * this.reflScale), Math.round(H * this.reflScale));
    this.post.setSize(W, H);
    this.post.composite.uniforms.uSharpen.value = 0.12 + 0.4 * (1 - this.scale);
  }

  // frame-time governor. Under vsync every frame reads as the refresh interval however much headroom the GPU has,
  // so the scale steps down on missed frames and, after a run of clean ones, probes back up; a probe that
  // costs frames doubles the wait before the next one.
  govern(dtMs) {
    if (this.lockScale) return;
    this.clock += dtMs / 1000;
    // a lone long frame is a stall (a shader compiling, a texture or a world chunk uploading), not the GPU's steady
    // load: it is left out unless such frames keep coming, which is what an overloaded device looks like
    const long = dtMs > 45;
    this.stallRate += ((long ? 1 : 0) - this.stallRate) * 0.03;
    if (long && this.stallRate < 0.15) return;
    // Apple GPUs take seconds to raise their clocks, and the first frames compile and upload: nothing is judged
    // until the frame has run a while
    if (this.clock < 6) return;
    // reallocating the targets stalls a few frames; those say nothing about the new scale, so they are not counted.
    // Counting starts after a run of clean frames. A probe that cannot produce that run within its settle time has
    // already failed; any other change just starts counting when the time runs out
    if (this.settle > 0) {
      this.settle -= dtMs / 1000;
      this.settleRun = dtMs < 19.5 ? this.settleRun + 1 : 0;
      if (this.settleRun < 15) {
        if (this.settle <= 0 && this.probing) this.probeFailed();
        return;
      }
      this.settle = 0;
    }
    this.frameTimes[this.ftIdx] = dtMs;
    this.ftIdx = (this.ftIdx + 1) % this.frameTimes.length;
    this.ftCount = Math.min(this.ftCount + 1, this.frameTimes.length);
    this.cooldown -= dtMs / 1000;
    // a full 1.5 s window: two late frames in a short one read as overload and cost the whole frame its sharpness
    if (this.ftCount < this.frameTimes.length) return;
    const n = this.ftCount;
    // the unfilled tail sorts to the end, so the first n are the window in order
    const arr = this._sorted;
    for (let i = 0; i < arr.length; i++) arr[i] = i < n ? this.frameTimes[i] : Infinity;
    arr.sort();
    const p90 = arr[Math.floor(n * 0.9)];
    // a steady trickle of dropped frames reads as stutter even when most frames are on time
    let misses = 0;
    for (let i = n - 1; i >= 0 && arr[i] > 21; i--) misses++;
    // the target is 60 fps whatever the display; rAF timestamps jitter by a couple of ms around 16.7
    const over = p90 > 19.5 || misses > n * 0.03;
    this.clean = dtMs > 21 ? 0 : this.clean + dtMs / 1000;
    if (this.cooldown > 0) return;
    if (this.probing) {
      // the first full window after a probe decides it
      if (over) return this.probeFailed();
      this.probing = false;
      this.step = 1.1;
    } else if (over) {
      // a few late frames mean the scale is just past what the GPU holds, and a small step finds it; a full step
      // there drops below it and the next probe climbs straight back into the misses
      this.setScale(this.scale * (p90 > 19.5 ? 0.88 : 0.95));
    } else if (this.scale < this.maxScale && this.clean > this.probeWait && this.step > 1.015) {
      this.preProbe = this.scale;
      if (this.setScale(this.scale * this.step)) {
        this.probing = true;
        this.lastProbe = this.clock;
      }
    } else if (this.clock - this.lastProbe > 30 && this.clock - this.lastEase > 15) {
      // long enough at this scale that conditions may have changed: ease the wait, then allow full-size probes again
      this.lastEase = this.clock;
      this.probeWait = Math.max(2, this.probeWait * 0.7);
      if (this.step < 1.1 && this.clock - this.lastProbe > 60) { this.step = 1.1; this.lastProbe = this.clock; }
    }
  }

  // back to where the probe came from; the next try waits twice as long and reaches half as far
  probeFailed() {
    this.probing = false;
    this.probeWait = Math.min(60, this.probeWait * 2);
    this.step = 1 + (this.step - 1) * 0.5;
    this.setScale(this.preProbe);
  }

  setScale(s) {
    const next = Math.min(this.maxScale, Math.max(this.minScale, s));
    if (Math.abs(next - this.scale) <= 0.005) return false;
    const down = next < this.scale;
    this.scale = next;
    this.applyScale();
    this.ftCount = 0;
    this.ftIdx = 0;
    this.clean = 0;
    this.settleRun = 0;
    this.settle = down ? 2.5 : 1.0;
    this.cooldown = down ? 1.0 : 1.5;
    return true;
  }

  render(scene, camera, opts) {
    const r = this.renderer;
    r.info.reset();
    this.frame++;
    if (this.frame % this.shadowEvery === 0) r.shadowMap.needsUpdate = true;

    // mirror pass
    if (opts.reflect !== false) {
      const camY = camera.position.y;
      if (camY > 0.05) this.reflection.render(r, scene, camera, 1 << 0);
    }

    // opaque world, multisampled
    camera.layers.mask = (1 << 0) | (1 << LAYER_NOREFL);
    r.setRenderTarget(this.rtOpaque);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    r.render(scene, camera);

    // copy into the single-sample target with its depth, then water and effects on top
    this.copyMat.uniforms.tColor.value = this.rtOpaque.texture;
    this.copyMat.uniforms.tDepth.value = this.rtOpaque.depthTexture;
    r.setRenderTarget(this.rtMain);
    r.clear(true, true, false);
    this.post.fs.render(r, this.copyMat, this.rtMain);

    if (opts.water) {
      const u = opts.water.uniforms;
      u.tScene.value = this.rtOpaque.texture;
      u.tDepth.value = this.rtOpaque.depthTexture;
      u.uRes.value.set(this.W, this.H);
      u.uNearFar.value.set(camera.near, camera.far);
    }
    camera.layers.mask = (1 << LAYER_WATER) | (1 << LAYER_FX);
    r.setRenderTarget(this.rtMain);
    r.render(scene, camera);
    camera.layers.mask = 1;

    // post
    const post = this.post;
    const bloom = post.bloom(this.rtMain);
    // sun position on screen for shafts and veil
    const sp = this._v.copy(opts.sunDir).multiplyScalar(1000).add(camera.position).project(camera);
    const sunUv = this.sunUv.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
    const facing = sp.z < 1 && opts.sunDir.dot(camera.getWorldDirection(this._v)) > 0;
    let shaftTex = post.mips[this.post.levels - 1].texture;
    const cu = post.composite.uniforms;
    if (facing && opts.shaftK > 0.01) {
      shaftTex = post.shafts(this.rtMain.texture, this.rtMain.depthTexture, sunUv, this.W / this.H);
      cu.uShaft.value = opts.shaftK;
    } else cu.uShaft.value = 0;
    if (facing) cu.uSunUv.value.copy(sunUv); else cu.uSunUv.value.set(-9, -9);
    cu.uAspect.value = this.W / this.H;
    post.final(this.rtMain.texture, bloom, shaftTex);
  }
}

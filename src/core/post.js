// HDR post chain: physically based bloom (13-tap down / tent up), sun shafts at quarter resolution,
// then one composite pass to the canvas: tone map, white balance, split grade, vignette, grain, sharpen upscale.
import * as THREE from 'three';

const FS_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class FullScreen {
  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.mesh = new THREE.Mesh(geo, null);
    this.mesh.frustumCulled = false;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  render(renderer, material, target) {
    this.mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.mesh, this.camera);
  }
}

const mk = (frag, uniforms) =>
  new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });

const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.fs = new FullScreen();
    this.mips = [];
    this.levels = 6;
    for (let i = 0; i < this.levels; i++) this.mips.push(new THREE.WebGLRenderTarget(4, 4, rtOpts));
    this.shaftA = new THREE.WebGLRenderTarget(4, 4, rtOpts);
    this.shaftB = new THREE.WebGLRenderTarget(4, 4, rtOpts);

    this.down = mk(
      /* glsl */ `
      precision highp float;
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uFirst;
      varying vec2 vUv;
      vec3 s(vec2 o){ return texture2D(tSrc, vUv + o * uTexel).rgb; }
      float lw(vec3 c){ return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722)) * 0.25); }
      void main(){
        vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2));
        vec3 d = s(vec2(-2, 0)), e = s(vec2(0, 0)), f = s(vec2(2, 0));
        vec3 g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2));
        vec3 j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
        vec3 r;
        if (uFirst > 0.5) {
          // Karis average on the first step keeps single bright pixels (glints, stars) from flickering
          vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25, g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;
          float w0 = lw(g0), w1 = lw(g1), w2 = lw(g2), w3 = lw(g3), w4 = lw(g4);
          r = (g0 * w0 * 0.125 + g1 * w1 * 0.125 + g2 * w2 * 0.125 + g3 * w3 * 0.125 + g4 * w4 * 0.5) / (w0 * 0.125 + w1 * 0.125 + w2 * 0.125 + w3 * 0.125 + w4 * 0.5);
        } else {
          r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
        }
        gl_FragColor = vec4(max(r, 0.0), 1.0);
      }`,
      { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } }
    );
    this.up = mk(
      /* glsl */ `
      precision highp float;
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uRadius;
      varying vec2 vUv;
      void main(){
        vec2 o = uTexel * uRadius;
        vec3 r = texture2D(tSrc, vUv).rgb * 4.0;
        r += (texture2D(tSrc, vUv + vec2(-o.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(o.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, -o.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, o.y)).rgb) * 2.0;
        r += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb;
        gl_FragColor = vec4(r / 16.0, 1.0);
      }`,
      { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } }
    );
    this.up.blending = THREE.AdditiveBlending;
    this.up.transparent = true;

    // sun shafts: occlusion mask from depth, radially blurred toward the sun in two passes
    this.shaftMask = mk(
      /* glsl */ `
      precision highp float;
      uniform sampler2D tScene; uniform sampler2D tDepth; uniform vec2 uSun; uniform float uAspect;
      uniform float cameraNear, cameraFar;
      varying vec2 vUv;
      void main(){
        float d = texture2D(tDepth, vUv).x;
        float sky = step(0.99999, d);
        vec2 dv = vUv - uSun; dv.x *= uAspect;
        float r = length(dv);
        vec3 c = texture2D(tScene, vUv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        gl_FragColor = vec4(c * sky * smoothstep(0.55, 0.0, r) / (1.0 + l * 0.15), 1.0);
      }`,
      { tScene: { value: null }, tDepth: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 }, cameraNear: { value: 0.1 }, cameraFar: { value: 1 } }
    );
    this.shaftBlur = mk(
      /* glsl */ `
      precision highp float;
      uniform sampler2D tSrc; uniform vec2 uSun; uniform float uStep;
      varying vec2 vUv;
      void main(){
        vec2 dir = (uSun - vUv) * uStep;
        vec3 acc = vec3(0.0); float w = 1.0, tw = 0.0;
        vec2 uv = vUv;
        float j = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
        uv += dir * j;
        for (int i = 0; i < 12; i++){ acc += texture2D(tSrc, uv).rgb * w; tw += w; w *= 0.93; uv += dir; }
        gl_FragColor = vec4(acc / tw, 1.0);
      }`,
      { tSrc: { value: null }, uSun: { value: new THREE.Vector2() }, uStep: { value: 0.04 } }
    );

    this.composite = mk(
      /* glsl */ `
      precision highp float;
      uniform sampler2D tScene, tBloom, tShaft;
      uniform vec2 uSrcTexel;
      uniform float uExposure, uBloom, uShaft, uTime, uSharpen, uVignette, uSat, uFade, uChroma;
      uniform vec3 uWB, uFadeCol, uShaftCol, uLift;
      uniform vec2 uSunUv; uniform float uSunVeil, uAspect, uNightK;
      varying vec2 vUv;

      vec3 aces(vec3 x){
        const mat3 m1 = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
        const mat3 m2 = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
        vec3 v = m1 * x;
        vec3 a = v * (v + 0.0245786) - 0.000090537;
        vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
        return clamp(m2 * (a / b), 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

      // Catmull-Rom upscale in five bilinear taps (the four corner taps weigh almost nothing and are dropped).
      // Below full scale this keeps the edges a bilinear stretch would smear; at full scale it returns the texel.
      vec3 catmullRom(vec2 uv){
        vec2 pos = uv / uSrcTexel;
        vec2 c = floor(pos - 0.5) + 0.5;
        vec2 f = pos - c;
        vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
        vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
        vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
        vec2 w3 = f * f * (-0.5 + 0.5 * f);
        vec2 w12 = w1 + w2;
        vec2 t0 = (c - 1.0) * uSrcTexel, t3 = (c + 2.0) * uSrcTexel, t12 = (c + w2 / w12) * uSrcTexel;
        vec3 r = texture2D(tScene, vec2(t12.x, t0.y)).rgb * (w12.x * w0.y)
               + texture2D(tScene, vec2(t0.x, t12.y)).rgb * (w0.x * w12.y)
               + texture2D(tScene, t12).rgb * (w12.x * w12.y)
               + texture2D(tScene, vec2(t3.x, t12.y)).rgb * (w3.x * w12.y)
               + texture2D(tScene, vec2(t12.x, t3.y)).rgb * (w12.x * w3.y);
        return r / (w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y);
      }

      void main(){
        vec3 n0 = texture2D(tScene, vUv + vec2(0.0, uSrcTexel.y)).rgb, n1 = texture2D(tScene, vUv - vec2(0.0, uSrcTexel.y)).rgb;
        vec3 n2 = texture2D(tScene, vUv + vec2(uSrcTexel.x, 0.0)).rgb, n3 = texture2D(tScene, vUv - vec2(uSrcTexel.x, 0.0)).rgb;
        // the cubic's negative lobes ring around HDR highlights (sun glints on the water): keep it inside the neighbours
        vec3 c = clamp(catmullRom(vUv), min(min(n0, n1), min(n2, n3)), max(max(n0, n1), max(n2, n3)));
        vec2 cuv = vUv - 0.5;
        if (uChroma > 0.0) {
          // slight chromatic fringe toward the frame edges
          vec2 off = cuv * dot(cuv, cuv) * uChroma;
          c.r = texture2D(tScene, vUv - off).r;
          c.b = texture2D(tScene, vUv + off).b;
        }
        // unsharp mask, stronger the further below full scale the frame is drawn, adaptive to local contrast
        vec3 hp = c - (n0 + n1 + n2 + n3) * 0.25;
        float lc = dot(c, vec3(0.3, 0.59, 0.11));
        c += hp * uSharpen / (1.0 + lc * 2.0);
        c = max(c, 0.0);

        vec3 bloom = texture2D(tBloom, vUv).rgb;
        c = mix(c, bloom, uBloom);
        c += texture2D(tShaft, vUv).rgb * uShaftCol * uShaft;

        // warm veil around the sun when it is near the frame
        vec2 sv = vUv - uSunUv; sv.x *= uAspect;
        c += uShaftCol * uSunVeil * exp(-length(sv) * 4.0) * 0.12;

        c *= uExposure * uWB;
        // night: dim areas lose colour and drift blue (lamplight stays warm)
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float scot = uNightK * smoothstep(0.25, 0.0, lum);
        c = mix(c, vec3(lum * 0.75, lum * 0.9, lum * 1.35), scot * 0.6);

        vec3 t = aces(c * 1.05);
        // painterly grade: teal in the shadows, amber in the highlights
        float l = dot(t, vec3(0.2126, 0.7152, 0.0722));
        vec3 shadowTint = vec3(0.94, 1.0, 1.04), hiTint = vec3(1.04, 1.0, 0.93);
        t *= mix(shadowTint, hiTint, smoothstep(0.1, 0.75, l));
        t = mix(vec3(l), t, uSat);
        // tonal depth: shadows settle a little deeper, mids and highlights untouched
        t *= mix(0.86, 1.0, smoothstep(0.0, 0.3, l));
        t = t + uLift * (1.0 - t);

        // vignette
        float v = 1.0 - dot(cuv * vec2(1.0, 0.85), cuv * vec2(1.0, 0.85)) * uVignette;
        t *= v;

        t = mix(t, uFadeCol, uFade);
        vec3 o = toSRGB(clamp(t, 0.0, 1.0));
        // film grain + dither
        float g = fract(sin(dot(vUv * 1000.0 + uTime * 7.13, vec2(12.9898, 78.233))) * 43758.5453);
        float g2 = fract(sin(dot(vUv * 1000.0 - uTime * 3.71, vec2(39.346, 11.135))) * 24634.6345);
        o += (g + g2 - 1.0) * (0.018 + uNightK * 0.012);
        gl_FragColor = vec4(o, 1.0);
      }`,
      {
        tScene: { value: null }, tBloom: { value: null }, tShaft: { value: null },
        uSrcTexel: { value: new THREE.Vector2() },
        uExposure: { value: 1 }, uBloom: { value: 0.05 }, uShaft: { value: 0 }, uTime: { value: 0 },
        uSharpen: { value: 0.12 }, uVignette: { value: 0.55 }, uSat: { value: 1.06 }, uFade: { value: 0 }, uChroma: { value: 0.0015 },
        uWB: { value: new THREE.Vector3(1, 1, 1) }, uFadeCol: { value: new THREE.Vector3(0, 0, 0) },
        uShaftCol: { value: new THREE.Vector3(1, 0.7, 0.4) }, uLift: { value: new THREE.Vector3(0.01, 0.012, 0.016) },
        uSunUv: { value: new THREE.Vector2(-9, -9) }, uSunVeil: { value: 0 }, uAspect: { value: 1 }, uNightK: { value: 0 },
      }
    );
  }

  setSize(w, h) {
    // bloom chain starts at half the scene resolution
    let mw = Math.max(1, w >> 1), mh = Math.max(1, h >> 1);
    for (let i = 0; i < this.levels; i++) {
      this.mips[i].setSize(mw, mh);
      mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
    }
    this.shaftA.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.shaftB.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.srcW = w; this.srcH = h;
  }

  bloom(src) {
    const r = this.renderer;
    let input = src;
    for (let i = 0; i < this.levels; i++) {
      const t = this.mips[i];
      this.down.uniforms.tSrc.value = input.texture;
      this.down.uniforms.uTexel.value.set(1 / input.width, 1 / input.height);
      this.down.uniforms.uFirst.value = i === 0 ? 1 : 0;
      this.fs.render(r, this.down, t);
      input = t;
    }
    for (let i = this.levels - 1; i > 0; i--) {
      const s = this.mips[i], t = this.mips[i - 1];
      this.up.uniforms.tSrc.value = s.texture;
      this.up.uniforms.uTexel.value.set(1 / s.width, 1 / s.height);
      this.fs.render(r, this.up, t);
    }
    return this.mips[0].texture;
  }

  shafts(sceneTex, depthTex, sunUv, aspect) {
    const r = this.renderer;
    this.shaftMask.uniforms.tScene.value = sceneTex;
    this.shaftMask.uniforms.tDepth.value = depthTex;
    this.shaftMask.uniforms.uSun.value.copy(sunUv);
    this.shaftMask.uniforms.uAspect.value = aspect;
    this.fs.render(r, this.shaftMask, this.shaftA);
    this.shaftBlur.uniforms.uSun.value.copy(sunUv);
    this.shaftBlur.uniforms.tSrc.value = this.shaftA.texture;
    this.shaftBlur.uniforms.uStep.value = 0.055;
    this.fs.render(r, this.shaftBlur, this.shaftB);
    this.shaftBlur.uniforms.tSrc.value = this.shaftB.texture;
    this.shaftBlur.uniforms.uStep.value = 0.018;
    this.fs.render(r, this.shaftBlur, this.shaftA);
    return this.shaftA.texture;
  }

  final(sceneTex, bloomTex, shaftTex) {
    const u = this.composite.uniforms;
    u.tScene.value = sceneTex;
    u.tBloom.value = bloomTex;
    u.tShaft.value = shaftTex;
    u.uSrcTexel.value.set(1 / this.srcW, 1 / this.srcH);
    this.fs.render(this.renderer, this.composite, null);
  }
}

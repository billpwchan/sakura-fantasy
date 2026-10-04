// One set of uniforms drives every material, so light, air, season and weather stay consistent everywhere.
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const v4 = (x = 0, y = 0, z = 0, w = 0) => new THREE.Vector4(x, y, z, w);

export const MAX_LAMPS = 10;

// one KTX2 transcoder for every model: each loader starts its own pool of workers and its own copy of the wasm
let ktx = null;
export function ktx2(renderer) {
  if (!ktx) ktx = new KTX2Loader().setTranscoderPath('./assets/basis/').detectSupport(renderer);
  return ktx;
}

export const U = {
  uTime: { value: 0 },
  uSunDir: { value: v3(0.3, 0.2, -0.9).normalize() }, // toward the dominant light (sun, or moon at night)
  uTrueSun: { value: v3(0.3, 0.2, -0.9).normalize() },
  uMoonDir: { value: v3(-0.3, 0.5, -0.8).normalize() },
  uSunCol: { value: v3(4, 3, 2) },
  uFogSun: { value: v3(1, 0.7, 0.4) },
  uFogAway: { value: v3(0.4, 0.5, 0.6) },
  uFogParams: { value: v4(0.00035, 0.012, 0.035, 0) }, // haze/m, height fog k, height falloff, -
  uMist: { value: 0.6 },
  uWind: { value: v4(0.6, -0.8, 0.5, 0) }, // dir xz, strength, gust phase
  uSeason: { value: v4(1, 0, 0, 0) }, // spring, summer, autumn, winter weights
  uSnow: { value: 0 },
  uWet: { value: 0 },
  uRain: { value: 0 },
  uNight: { value: 0 },
  uFlash: { value: 0 },
  uFlashDir: { value: v3(0, 0.6, -0.8).normalize() },
  // fireworks: the summed light of the live bursts as one directional flash, and each burst as a point for the
  // water's glints (xyz, intensity; colour and radius)
  uFwCol: { value: v3() },
  uFwDir: { value: v3(0, 0.5, -0.8).normalize() },
  uFwL: { value: Array.from({ length: 3 }, () => v4(0, -999, 0, 0)) },
  uFwC: { value: Array.from({ length: 3 }, () => v4()) }, // rgb, radius of the burst (m)
  uSkyZen: { value: v3(0.1, 0.2, 0.4) },
  uSkyHor: { value: v3(0.5, 0.55, 0.6) },
  uAmbUp: { value: v3(0.3, 0.35, 0.45) },
  uAmbDown: { value: v3(0.12, 0.1, 0.08) },
  uLampPos: { value: Array.from({ length: MAX_LAMPS }, () => v4(0, -999, 0, 1)) },
  uLampCol: { value: Array.from({ length: MAX_LAMPS }, () => v3()) },
  uBoat: { value: v4(0, 0, 0, 0) }, // x, z, heading, speed
  uSpirit: { value: 0 }, // night fantasy layer intensity
  uLampOn: { value: 0 }, // lanterns and windows lit, dusk to dawn
  // the view camera's position, for distance effects that must agree between the view and the shadow pass (where
  // cameraPosition is the light's)
  uViewPos: { value: v3() },
};

export const NOISE = /* glsl */ `
float sfHash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float sfHash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float sfNoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(sfHash12(i), sfHash12(i+vec2(1,0)), u.x), mix(sfHash12(i+vec2(0,1)), sfHash12(i+vec2(1,1)), u.x), u.y); }
float sfFbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * sfNoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
float sfFbm3(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ s += a * sfNoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
// fallen petals: rotated ovals in jittered cells over two scales; dens 0..1 keeps that share of cells.
// px = fwidth of p in metres per pixel (from the caller, so this stays legal in vertex shaders); once a petal
// falls under a pixel it is replaced by its mean coverage instead of shimmering
float sfPetals(vec2 p, float dens, float px){
  float acc = 0.0;
  for (int l = 0; l < 2; l++) {
    float fl = float(l);
    vec2 q = p * (7.0 + fl * 4.3) + fl * 17.3;
    vec2 c = floor(q), f = fract(q) - 0.5;
    float h = sfHash12(c + fl * 31.0);
    if (fract(h * 91.7) < dens) {
      vec2 d = f - (vec2(h, fract(h * 37.1)) - 0.5) * 0.45;
      float a = h * 6.283;
      d = mat2(cos(a), -sin(a), sin(a), cos(a)) * d;
      acc = max(acc, smoothstep(0.17, 0.1, length(d * vec2(1.0, 1.7))));
    }
  }
  return mix(acc, dens * 0.09, smoothstep(0.012, 0.04, px));
}
`;

export const UNIFORMS_GLSL = /* glsl */ `
uniform float uTime, uMist, uSnow, uWet, uRain, uNight, uFlash, uSpirit, uLampOn;
uniform vec3 uSunDir, uTrueSun, uMoonDir, uSunCol, uFogSun, uFogAway, uFlashDir, uSkyZen, uSkyHor, uAmbUp, uAmbDown, uViewPos, uFwCol, uFwDir;
uniform vec4 uFogParams, uWind, uSeason, uBoat;
uniform vec4 uLampPos[${MAX_LAMPS}];
uniform vec3 uLampCol[${MAX_LAMPS}];
`;

// Aerial perspective: uniform haze + exponential height fog + a thin drifting mist layer over the water,
// in-scattering warm toward the sun and cool away from it. Used by every surface, the sky and the water.
export const ATMOS = /* glsl */ `
float sfExpLayer(float k, float b, float y0, float dy, float dist){
  float h0 = k * exp(-b * y0);
  return abs(dy) > 0.01 ? h0 * (1.0 - exp(-b * dy)) / (b * dy / dist) : h0 * dist;
}
float sfOptical(vec3 ro, vec3 rd, float dist){
  float dy = rd.y * dist;
  float od = uFogParams.x * dist + sfExpLayer(uFogParams.y, uFogParams.z, ro.y, dy, dist);
  // mist hugging the water, broken into slow drifting banks
  float near = min(dist, 220.0);
  vec3 mp = ro + rd * near * 0.55;
  float bank = sfNoise(mp.xz * 0.018 + uTime * vec2(0.011, -0.017)) * 0.75 + sfNoise(mp.xz * 0.05 - uTime * 0.02) * 0.5;
  float mist = sfExpLayer(0.009 * uMist, 0.38, max(ro.y, 0.0), clamp(dy, -12.0, 400.0), dist);
  return od + mist * (0.2 + 1.1 * bank * bank);
}
vec3 sfFogColor(vec3 rd){
  float s = max(dot(rd, uTrueSun), 0.0);
  float glow = pow(s, 5.0) * 0.75 + pow(s, 40.0) * 0.6;
  vec3 c = mix(uFogAway, uFogSun, glow);
  // lightning lights the haze from inside
  c += uFlash * vec3(0.55, 0.6, 0.8) * (0.4 + 0.6 * max(dot(rd, uFlashDir), 0.0));
  // and a firework's burst lights the haze and its own smoke, most of all around it
  c += uFwCol * (0.035 + 0.25 * pow(max(dot(rd, uFwDir), 0.0), 8.0));
  return c;
}
vec3 sfAtmos(vec3 col, vec3 wp){
  vec3 v = wp - cameraPosition; float dist = length(v); vec3 rd = v / max(dist, 1e-4);
  float T = exp(-sfOptical(cameraPosition, rd, dist));
  return col * T + sfFogColor(rd) * (1.0 - T);
}
`;

// extra lights: lanterns (custom loop, constant count so the programs never recompile), lightning
const LAMPS = /* glsl */ `
vec3 sfLamps(vec3 wp, vec3 nW, float wrap){
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${MAX_LAMPS}; i++){
    vec4 lp = uLampPos[i];
    vec3 L = lp.xyz - wp;
    float d2 = dot(L, L);
    float r2 = lp.w * lp.w;
    if (d2 > r2 * 16.0) continue;
    float d = sqrt(d2);
    float att = 1.0 / (1.0 + d2 / r2) * smoothstep(4.0 * lp.w, 2.0 * lp.w, d);
    float ndl = (dot(nW, L / d) + wrap) / (1.0 + wrap);
    acc += uLampCol[i] * att * max(ndl, 0.0);
  }
  return acc;
}
`;

const VERT_HEAD = /* glsl */ `
varying vec3 vSfWP;
${UNIFORMS_GLSL}
${NOISE}
`;

// wind for plants: bend grows with height above the instance origin (h in metres) times stiffness
export const WIND_GLSL = /* glsl */ `
// gust fronts: bands of stronger wind, long across the wind and short along it, rolling downwind
float sfGust(vec2 xz){
  vec2 wd = normalize(uWind.xy);
  vec2 q = vec2(dot(xz, wd), dot(xz, vec2(-wd.y, wd.x)));
  vec2 g = vec2((q.x - uTime * (3.0 + uWind.z * 5.0)) * 0.045, q.y * 0.014);
  return smoothstep(0.35, 0.8, sfNoise(g) * 0.65 + sfNoise(g * 2.3 + 7.1) * 0.35);
}
vec3 sfWindOffset(vec3 wpRoot, float h, float stiff){
  vec2 wd = normalize(uWind.xy);
  float gust = 0.15 + 0.85 * sfGust(wpRoot.xz);
  float s = uWind.z * (0.6 + gust) * stiff;
  float bend = h * h * 0.02;
  float flutter = sin(uTime * 2.7 + wpRoot.x * 0.7 + wpRoot.z * 0.9) * 0.25 + sin(uTime * 4.9 + wpRoot.z * 1.3) * 0.12;
  return vec3(wd.x, 0.0, wd.y) * bend * s * (1.0 + flutter) + vec3(0.0, -bend * s * 0.15, 0.0);
}
`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vSfWP;
${UNIFORMS_GLSL}
${NOISE}
${ATMOS}
${LAMPS}
`;

const WP_VERT = /* glsl */ `
  {
    vec4 sfWP4 = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
      sfWP4 = batchingMatrix * sfWP4;
    #endif
    #ifdef USE_INSTANCING
      sfWP4 = instanceMatrix * sfWP4;
    #endif
    vSfWP = (modelMatrix * sfWP4).xyz;
  }
`;

/**
 * Patch a built-in material (Standard or Lambert) with the shared world: fog/mist, lamps, lightning, snow, wetness.
 * opts: { snow: 0..1 how much snow can settle, wet: 0..1 porous darkening, hooks: {vertexPre, vertexPost, fragMap, fragLight} }
 */
export function patch(mat, opts = {}) {
  const snow = opts.snow ?? 1;
  const wet = opts.wet ?? 1;
  const hooks = opts.hooks || {};
  const extraUniforms = opts.uniforms || {};
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, extraUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}\n${opts.vertexHead || ''}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${hooks.beginNormal || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${hooks.vertex || ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WP_VERT}\n${hooks.vertexPost || ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}\n${opts.fragHead || ''}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${hooks.map || ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${hooks.normal || ''}`)
      .replace('#include <alphatest_fragment>', `${hooks.alpha || ''}\n#include <alphatest_fragment>`)
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        vec3 sfNW = inverseTransformDirection(normal, viewMatrix);
        ${hooks.preLight || ''}
        {
          // settled snow on upward faces, broken up by noise; wet surfaces darken and gloss
          float sfSnowK = ${snow.toFixed(3)} * uSnow;
          if (sfSnowK > 0.001) {
            float sn = sfNoise(vSfWP.xz * 0.9) * 0.5 + sfNoise(vSfWP.xz * 0.13) * 0.5;
            float cover = smoothstep(0.55 - 0.35 * sfSnowK, 0.85 - 0.25 * sfSnowK, sfNW.y + (sn - 0.5) * 0.5) * smoothstep(0.0, 0.35, sfSnowK + sn * 0.3 - 0.15);
            cover *= smoothstep(-0.05, 0.25, vSfWP.y);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.96), cover);
            #ifdef STANDARD
              roughnessFactor = mix(roughnessFactor, 0.55, cover);
            #endif
          }
          float sfWetK = ${wet.toFixed(3)} * uWet;
          diffuseColor.rgb *= 1.0 - 0.38 * sfWetK;
          #ifdef STANDARD
            roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.35, sfWetK);
          #endif
        }`
      )
      .replace(
        '#include <lights_fragment_end>',
        /* glsl */ `#include <lights_fragment_end>
        float sfShadow = 1.0;
        #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
          sfShadow = getShadow(directionalShadowMap[0], directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowIntensity, directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius, vDirectionalShadowCoord[0]);
        #endif
        reflectedLight.directDiffuse += BRDF_Lambert(material.diffuseColor) * (sfLamps(vSfWP, sfNW, ${(opts.wrap ?? 0).toFixed(2)}) + uFlash * vec3(1.1, 1.2, 1.5) * max(dot(sfNW, uFlashDir) * 0.6 + 0.4, 0.0) + uFwCol * max(dot(sfNW, uFwDir) * 0.7 + 0.3, 0.0));
        ${hooks.light || ''}`
      )
      .replace('#include <fog_fragment>', `gl_FragColor.rgb = mix(sfAtmos(gl_FragColor.rgb, vSfWP), gl_FragColor.rgb, smoothstep(0.0, -0.35, vSfWP.y));\n${hooks.post || ''}`);
    if (opts.onShader) opts.onShader(sh);
  };
  mat.customProgramCacheKey = () => 'sf:' + (opts.key || mat.type) + ':' + snow + ':' + wet;
  return mat;
}

// Valley terrain: chunks along the river, columns dense at the water and stretching out to the ridges.
// Shading: riverbed pebbles, wet shore, seasonal meadow, forest floor, triplanar rock, settled snow.
import * as THREE from 'three';
import { patch } from '../core/shared.js';


function indexFor(nc, nr) {
  const idx = new Uint32Array((nc - 1) * (nr - 1) * 6);
  let k = 0;
  for (let j = 0; j < nr - 1; j++) {
    for (let i = 0; i < nc - 1; i++) {
      const a = j * nc + i, b = a + 1, c = a + nc, d = c + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = c;
      idx[k++] = b; idx[k++] = d; idx[k++] = c;
    }
  }
  return idx;
}

export function createTerrain(data, tex) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const S = (id) => tex[id];
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  const uniforms = {
    tGrassC: { value: S('leafy_grass_c') }, tGrassN: { value: S('leafy_grass_n') },
    tTurfC: { value: S('turf_c') }, tTurfN: { value: S('turf_n') },
    tGroundC: { value: S('forrest_ground_01_c') }, tGroundN: { value: S('forrest_ground_01_n') },
    tRockC: { value: S('rock_face_c') }, tRockN: { value: S('rock_face_n') },
    tPebC: { value: S('ganges_river_pebbles_c') }, tPebN: { value: S('ganges_river_pebbles_n') },
    tLeafC: { value: S('forest_leaves_02_c') },
    tSnowC: { value: S('snow_02_c') }, tSnowN: { value: S('snow_02_n') },
  };
  patch(mat, {
    key: 'terrain',
    snow: 0, // terrain handles its own snow with the snow texture
    wet: 0.6,
    uniforms,
    vertexHead: /* glsl */ `attribute vec2 aAux; varying vec2 vAux; varying vec3 vGN;`,
    fragHead: /* glsl */ `
      varying vec2 vAux; varying vec3 vGN;
      uniform sampler2D tGrassC, tGrassN, tTurfC, tTurfN, tGroundC, tGroundN, tRockC, tRockN, tPebC, tPebN, tLeafC, tSnowC, tSnowN;
      vec3 sfTerrN; float sfTerrRough;
      vec3 unpackN(vec4 t){ return t.xyz * 2.0 - 1.0; }
    `,
    hooks: {
      vertexPost: /* glsl */ `vAux = aAux; vGN = normalize(mat3(modelMatrix) * objectNormal);`,
      map: /* glsl */ `
      {
        vec3 wp = vSfWP;
        vec3 gN = normalize(vGN);
        float dist = distance(wp, cameraPosition);
        float slope = 1.0 - gN.y;
        float nA = sfNoise(wp.xz * 0.045), nB = sfNoise(wp.xz * 0.23), nC = sfNoise(wp.xz * 0.008);
        float forest = vAux.x;
        float sd = vAux.y;
        float sp = uSeason.x, su = uSeason.y, au = uSeason.z, wi = uSeason.w;

        // weights
        float rockW = smoothstep(0.30, 0.52, slope + (nA - 0.5) * 0.22);
        // the gorge walls are held by bamboo roots: leaf litter and moss, bare rock only where it breaks through
        float gorgeK = smoothstep(-1170.0, -1240.0, wp.z) * smoothstep(-1650.0, -1580.0, wp.z);
        rockW *= mix(1.0, smoothstep(0.58, 0.78, nA + (nB - 0.5) * 0.35), gorgeK);
        float bedW = smoothstep(0.12, -0.3, wp.y + (nB - 0.5) * 0.3);
        float shoreW = (1.0 - bedW) * smoothstep(3.6, 0.6, sd + (nB - 0.5) * 2.2) * (1.0 - rockW);
        float groundW = max(clamp(forest * 1.6 - 0.1 + (nA - 0.5) * 0.4, 0.0, 1.0), gorgeK * smoothstep(0.12, 0.3, slope)) * (1.0 - rockW) * (1.0 - bedW) * (1.0 - shoreW);
        float grassW = max(0.0, 1.0 - rockW - bedW - shoreW - groundW);

        vec2 uv = wp.xz;
        float petPx = length(fwidth(wp.xz));
        float detail = smoothstep(420.0, 240.0, dist);
        vec3 alb = vec3(0.0);
        vec3 tn = vec3(0.0, 0.0, 1.0);
        float rough = 0.9;

        // far albedo: flat colours so distance costs nothing
        vec3 farGrass = mix(vec3(0.075, 0.1, 0.035), vec3(0.06, 0.085, 0.03), su);
        farGrass = mix(farGrass, vec3(0.16, 0.12, 0.05), au);
        farGrass = mix(farGrass, vec3(0.11, 0.1, 0.075), wi);
        vec3 decid = mix(vec3(0.045, 0.07, 0.03), vec3(0.03, 0.06, 0.022), su);
        decid = mix(decid, mix(vec3(0.2, 0.06, 0.02), vec3(0.2, 0.12, 0.02), nC), au);
        decid = mix(decid, vec3(0.06, 0.055, 0.05), wi);
        vec3 farForest = mix(vec3(0.022, 0.042, 0.026), decid, smoothstep(0.35, 0.75, nC) * 0.8);
        // a canopy from afar: crowns as soft blobs with darker gaps
        float crowns = sfNoise(wp.xz * 0.33) * 0.6 + sfNoise(wp.xz * 0.9 + 3.0) * 0.4;
        farForest *= 0.45 + 1.05 * smoothstep(0.3, 0.75, crowns);
        vec3 farRock = vec3(0.13, 0.13, 0.12) * (0.8 + 0.4 * nA);
        vec3 farCol = farGrass * grassW + farForest * groundW + farRock * rockW + vec3(0.1, 0.09, 0.07) * (bedW + shoreW);
        farCol *= 0.8 + 0.4 * nB;

        if (detail > 0.0) {
          vec2 dx = dFdx(uv), dy = dFdy(uv);
          vec3 c = vec3(0.0); vec3 n = vec3(0.0);
          if (grassW > 0.01) {
            vec2 u1 = uv / 3.4;
            vec3 g = textureGrad(tGrassC, u1, dx / 3.4, dy / 3.4).rgb;
            vec3 g2 = textureGrad(tGrassC, uv / 13.0 + 0.37, dx / 13.0, dy / 13.0).rgb;
            g = mix(g, g2, 0.35);
            // open banks are a living sward (rendered from the same grass as the clumps standing on it), the leafy
            // litter only toward the woods; two scales of the turf so its 2 m tile never shows
            float turfW = smoothstep(0.75, 0.3, forest + (nA - 0.5) * 0.3) * smoothstep(70.0, 30.0, sd);
            vec2 u4 = uv / 2.0, u5 = mat2(0.8, -0.6, 0.6, 0.8) * uv / 6.1 + 0.21;
            // (lifted so that, through the meadow's shading below, the sward matches the clumps standing on it)
            vec3 tf = textureGrad(tTurfC, u4, dx / 2.0, dy / 2.0).rgb * mix(0.85, 1.15, textureGrad(tTurfC, u5, dx / 6.1, dy / 6.1).g * 3.0) * 2.1;
            g = mix(g, tf, turfW);
            // season: fresh spring green, deep summer, straw-gold autumn, dull winter
            float lum = dot(g, vec3(0.3, 0.55, 0.15));
            vec3 gs = g * vec3(1.02, 1.08, 0.8);
            gs = mix(gs, g * vec3(0.82, 0.98, 0.7), su);
            gs = mix(gs, vec3(lum * 1.55, lum * 1.15, lum * 0.5), au);
            gs = mix(gs, vec3(lum * 1.2, lum * 1.08, lum * 0.82), wi);
            // the meadow is never one colour: cool mossy patches, warmer dry ones, bare soil and litter in hollows
            float pn = sfNoise(wp.xz * 0.11 + 5.0) * 0.6 + nB * 0.4;
            float pd = sfNoise(wp.xz * 0.06 - 9.0) * 0.7 + sfNoise(wp.xz * 0.5) * 0.3;
            gs *= mix(vec3(0.62, 0.8, 0.78), vec3(1.0, 0.97, 0.88), smoothstep(0.32, 0.72, pn));
            vec3 soil = textureGrad(tGroundC, uv / 4.0, dx / 4.0, dy / 4.0).rgb * vec3(0.78, 0.7, 0.58);
            gs = mix(gs, soil, smoothstep(0.64, 0.84, pd) * mix(0.75, 0.5, turfW));
            c += gs * (0.46 + 0.3 * nA) * grassW;
            n += mix(unpackN(textureGrad(tGrassN, u1, dx / 3.4, dy / 3.4)), unpackN(textureGrad(tTurfN, u4, dx / 2.0, dy / 2.0)), turfW) * grassW;
          }
          if (groundW > 0.01) {
            vec2 u2 = uv / 4.0;
            vec3 g = textureGrad(tGroundC, u2, dx / 4.0, dy / 4.0).rgb;
            vec3 lf = textureGrad(tLeafC, uv / 3.0 + 0.5, dx / 3.0, dy / 3.0).rgb;
            g = mix(g, lf * vec3(1.15, 0.9, 0.7), au * 0.75);
            // moss under the bamboo
            g = mix(g, g * vec3(0.62, 0.92, 0.42) + vec3(0.0, 0.012, 0.0), gorgeK * smoothstep(0.35, 0.7, nB) * (1.0 - wi) * 0.85);
            // a Japanese wood's floor is under kumazasa, ferns and moss, not bare litter: the litter shows through in
            // clearings and more of it in autumn; beyond a few tens of metres the undergrowth is all one sees of it
            float under = clamp(0.35 + 0.45 * smoothstep(12.0, 70.0, dist) + (sfNoise(wp.xz * 0.18 + 4.0) - 0.5) * 0.9, 0.0, 0.92);
            under *= 1.0 - 0.45 * au - 0.5 * wi;
            vec3 ug = mix(vec3(0.05, 0.075, 0.03), vec3(0.075, 0.095, 0.035), nB);
            ug = mix(ug, vec3(0.07, 0.065, 0.035), au * 0.5);
            g = mix(g * vec3(0.72, 0.66, 0.58), ug, under);
            c += g * (0.6 + 0.3 * nA) * groundW;
            n += unpackN(textureGrad(tGroundN, u2, dx / 4.0, dy / 4.0)) * groundW;
          }
          if (bedW + shoreW > 0.01) {
            vec2 u3 = uv / 2.6;
            vec3 g = textureGrad(tPebC, u3, dx / 2.6, dy / 2.6).rgb;
            // the shore is darker and muddier near the waterline, mossy just under it
            vec3 mud = vec3(0.09, 0.075, 0.055) * (0.8 + 0.4 * nB);
            vec3 shore = mix(g, mud, smoothstep(1.4, 0.2, sd) * 0.45);
            vec3 bed = mix(g * vec3(0.8, 0.9, 0.75), vec3(0.05, 0.07, 0.04), smoothstep(-0.2, -1.4, wp.y) * 0.45);
            c += shore * shoreW + bed * bedW;
            n += unpackN(textureGrad(tPebN, u3, dx / 2.6, dy / 2.6)) * (shoreW + bedW);
            rough = mix(rough, 0.55, smoothstep(1.2, 0.0, sd) * shoreW);
          }
          if (rockW > 0.01) {
            // triplanar, skipping projections that barely contribute
            vec3 bw = pow(abs(gN), vec3(4.0)); bw /= dot(bw, vec3(1.0));
            vec3 rc = vec3(0.0); vec3 rn = vec3(0.0);
            float s = 1.0 / 7.0;
            if (bw.x > 0.05) { vec2 t = wp.zy * s; rc += textureGrad(tRockC, t, dFdx(t), dFdy(t)).rgb * bw.x; vec3 q = unpackN(textureGrad(tRockN, t, dFdx(t), dFdy(t))); rn += vec3(0.0, q.y, q.x) * sign(gN.x) * bw.x; }
            if (bw.y > 0.05) { vec2 t = wp.xz * s; rc += textureGrad(tRockC, t, dFdx(t), dFdy(t)).rgb * bw.y; vec3 q = unpackN(textureGrad(tRockN, t, dFdx(t), dFdy(t))); rn += vec3(q.x, 0.0, q.y) * bw.y; }
            if (bw.z > 0.05) { vec2 t = wp.xy * s; rc += textureGrad(tRockC, t, dFdx(t), dFdy(t)).rgb * bw.z; vec3 q = unpackN(textureGrad(tRockN, t, dFdx(t), dFdy(t))); rn += vec3(q.x, q.y, 0.0) * bw.z; }
            // the scanned rock is dark: lift it to a plausible albedo, a little moss in the cracks
            rc *= 1.5;
            // the scan is a warm sandstone; the valley's rock is grey andesite, greener in the damp gorge
            float rl = dot(rc, vec3(0.3, 0.59, 0.11));
            rc = mix(rc, vec3(rl) * vec3(0.96, 1.0, 0.97), 0.45 + 0.35 * gorgeK);
            rc = mix(rc, vec3(0.06, 0.08, 0.035), smoothstep(0.5, 0.8, nB) * (0.35 + 0.4 * gorgeK) * (1.0 - wi));
            c += rc * rockW;
            sfTerrN = rn;
          }
          // fallen petals carpet the cherry avenue in spring, drifting into the hollows: a pink cast where they lie
          // thick, single petals scattered elsewhere
          float avenue = smoothstep(-205.0, -245.0, wp.z) * smoothstep(-675.0, -630.0, wp.z) * smoothstep(24.0, 7.0, sd) * smoothstep(-0.05, 0.25, wp.y);
          float petK = avenue * sp * (1.0 - rockW);
          if (petK > 0.01) {
            float drift = smoothstep(0.3, 0.8, sfNoise(wp.xz * 0.4 + 2.0) * 0.6 + sfNoise(wp.xz * 1.7) * 0.4);
            vec3 pcol = vec3(0.86, 0.62, 0.68);
            float pet = sfPetals(wp.xz, 0.14 + 0.7 * drift * drift, petPx);
            c = mix(c, pcol * 0.8, drift * drift * 0.22 * petK);
            c = mix(c, pcol, pet * petK);
          }
          // the rock the waterfall runs over is soaked dark, with slick moss at its edges
          float wfK = smoothstep(9.0, 4.0, abs(wp.z + 1405.0)) * smoothstep(-34.0, -38.0, wp.x) * smoothstep(80.0, 60.0, wp.y);
          c = mix(c, c * vec3(0.4, 0.46, 0.42), wfK);
          rough = mix(rough, 0.25, wfK);
          alb = mix(farCol, c, detail);
          tn = normalize(vec3(n.xy * detail, 1.0));
        } else {
          alb = farCol;
        }

        // snow: covers flat ground first, rock last; the bed stays clear
        float snowK = uSnow * (1.0 - bedW);
        if (snowK > 0.001) {
          float cov = smoothstep(0.62 - 0.4 * snowK, 0.9 - 0.3 * snowK, gN.y + (nB - 0.5) * 0.35) * smoothstep(0.0, 0.4, snowK + nA * 0.4 - 0.2);
          cov *= smoothstep(0.05, 0.6, wp.y);
          vec3 sc = vec3(0.82, 0.86, 0.93);
          if (detail > 0.0) sc = mix(sc, textureGrad(tSnowC, uv / 4.0, dFdx(uv) / 4.0, dFdy(uv) / 4.0).rgb * 1.05, detail);
          alb = mix(alb, sc, cov);
          tn = normalize(mix(tn, vec3(0.0, 0.0, 1.0), cov * 0.6));
          rough = mix(rough, 0.6, cov);
        }
        // the waterline: wet dark band
        float wetLine = smoothstep(0.55, 0.0, wp.y) * (1.0 - bedW);
        alb *= 1.0 - 0.35 * wetLine;
        rough = mix(rough, 0.3, wetLine * 0.8);

        diffuseColor.rgb = alb;
        sfTerrRough = rough;
        // world normal from the planar tangent frame
        vec3 T = normalize(vec3(1.0, 0.0, 0.0) - gN * gN.x);
        vec3 B = normalize(vec3(0.0, 0.0, 1.0) - gN * gN.z);
        vec3 wn = normalize(T * tn.x + B * tn.y + gN * tn.z);
        if (rockW > 0.01 && detail > 0.0) wn = normalize(mix(wn, normalize(gN + sfTerrN * 0.9), rockW * detail));
        sfTerrN = wn;
      }`,
      normal: /* glsl */ `normal = normalize((viewMatrix * vec4(sfTerrN, 0.0)).xyz);`,
      preLight: /* glsl */ `roughnessFactor = sfTerrRough; sfNW = sfTerrN;`,
    },
  });

  for (const c of data) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(c.pos, 3));
    geo.setAttribute('aAux', new THREE.BufferAttribute(c.aux, 2));
    geo.setIndex(new THREE.BufferAttribute(indexFor(c.nc, c.nr), 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.castShadow = true;
    m.matrixAutoUpdate = false;
    group.add(m);
  }
  return { group, material: mat };
}

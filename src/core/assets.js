import * as THREE from 'three';

const BASE = './assets/tex/';
export const TEX_LIST = [
  'forrest_ground_01', 'leafy_grass', 'rock_face', 'lichen_rock', 'ganges_river_pebbles', 'snow_02', 'forest_leaves_02',
  'weathered_planks', 'hinoki_planks', 'sakura_bark', 'pine_bark', 'japanese_cedar_bark', 'jolcham_oak_bark_01', 'trident_maple_bark',
  'japanese_stone_wall', 'grey_roof_tiles', 'reed_roof_04', 'painted_plaster_wall', 'turf',
];
// foliage atlases with alpha, clamped (one file each, no normal map)
export const ATLAS_LIST = ['sakura_blossom', 'sakura_blossom_n', 'ground_flora', 'ground_flora_n', 'azalea_atlas', 'azalea_atlas_n', 'conifer_atlas', 'conifer_atlas_n', 'maple_atlas', 'maple_atlas_n', 'tall_flora', 'tall_flora_n', 'broad_atlas', 'broad_atlas_n', 'sakura_leaf', 'sakura_leaf_n', 'bamboo_atlas', 'bamboo_atlas_n'];

export async function loadTextures(renderer, onProgress) {
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const out = {};
  const jobs = [];
  let done = 0;
  const total = TEX_LIST.length * 2 + ATLAS_LIST.length;
  for (const id of TEX_LIST) {
    for (const m of ['c', 'n']) {
      jobs.push(
        loader.loadAsync(`${BASE}${id}_${m}.webp`).then((t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = aniso;
          t.colorSpace = m === 'c' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.generateMipmaps = true;
          t.minFilter = THREE.LinearMipmapLinearFilter;
          out[`${id}_${m}`] = t;
          done++;
          onProgress && onProgress(done / total);
        })
      );
    }
  }
  for (const id of ATLAS_LIST) {
    jobs.push(
      loader.loadAsync(`${BASE}${id}.webp`).then((t) => {
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.anisotropy = aniso;
        t.colorSpace = id.endsWith('_n') ? THREE.NoColorSpace : THREE.SRGBColorSpace;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        out[id] = t;
        done++;
        onProgress && onProgress(done / total);
      })
    );
  }
  await Promise.all(jobs);
  return out;
}

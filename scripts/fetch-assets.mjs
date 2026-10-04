// Downloads CC0 textures from Poly Haven and converts them to webp under public/assets/tex.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const OUT = new URL('../public/assets/tex/', import.meta.url).pathname;
const TMP = new URL('../.cache/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

// [asset, size or [w, h], maps]; c = colour, n = GL normal, r = roughness
const LIST = [
  ['forrest_ground_01', 1024, 'cn'],
  ['leafy_grass', 1024, 'cn'],
  ['rock_face', 1024, 'cn'],
  ['lichen_rock', 1024, 'cn'],
  ['ganges_river_pebbles', 1024, 'cn'],
  ['snow_02', 1024, 'cn'],
  ['forest_leaves_02', 1024, 'cn'],
  ['weathered_planks', 1024, 'cn'],
  ['hinoki_planks', 1024, 'cn'],
  ['sakura_bark', 1024, 'cn'],
  ['pine_bark', 1024, 'cn'],
  ['japanese_cedar_bark', 1024, 'cn'],
  ['jolcham_oak_bark_01', [1024, 2048], 'cn'],
  ['trident_maple_bark', 1024, 'cn'],
  ['japanese_stone_wall', 1024, 'cn'],
  ['grey_roof_tiles', 1024, 'cn'],
  ['reed_roof_04', 1024, 'cn'],
  ['painted_plaster_wall', 1024, 'cn'],
];
const KEY = { c: 'Diffuse', n: 'nor_gl', r: 'Rough' };

const files = async (id) => (await fetch(`https://api.polyhaven.com/files/${id}`)).json();

for (const [id, size, maps] of LIST) {
  const meta = await files(id);
  for (const m of maps) {
    const dst = join(OUT, `${id}_${m}.webp`);
    if (existsSync(dst)) continue;
    const url = meta[KEY[m]]['1k'].jpg.url;
    const tmp = join(TMP, `${id}_${m}.jpg`);
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(tmp, buf);
    const q = m === 'n' ? 90 : 82;
    const [w, h] = Array.isArray(size) ? size : [size, size];
    execFileSync('cwebp', ['-quiet', '-q', String(q), '-resize', String(w), String(h), tmp, '-o', dst]);
    rmSync(tmp);
    console.log('ok', dst.split('/').pop());
  }
}

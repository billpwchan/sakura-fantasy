const sharp = require('sharp');
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// 2 x 2 cells of 1024: bamboo branch sprays, dense (0, 1) and open (2, 3)
(async () => {
  const col = [], nrm = [];
  for (let c = 0; c < 4; c++) {
    const left = (c % 2) * 1024, top = Math.floor(c / 2) * 1024;
    const { data, info } = await sharp(`../veg/bamboo/c${c}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const mx = Math.max(r, g, b), sat = (mx - Math.min(r, g, b)) / Math.max(mx, 1), lum = 0.3 * r + 0.59 * g + 0.11 * b;
      // the scan's white sheath hairs at the leaf bases: back to the leaf's own green
      const m = ss(0.3, 0.18, sat) * ss(105, 140, lum);
      data[i] = r + (84 - r) * m; data[i + 1] = g + (100 - g) * m; data[i + 2] = b + (40 - b) * m;
      const px = (i / 4) % info.width, py = Math.floor(i / 4 / info.width);
      const e = Math.min(px + 0.5, info.width - px - 0.5, py + 0.5, info.height - py - 0.5) / (info.width * 0.035);
      if (e < 1) data[i + 3] *= e * e * (3 - 2 * e);
    }
    // pinholes in the scan's leaf texture near the bases: close them (alpha dilated then eroded, 2 px)
    const W = info.width, H = info.height;
    const al = new Uint8Array(W * H);
    for (let j = 0; j < W * H; j++) al[j] = data[j * 4 + 3];
    const filt = (src, op) => {
      const t = new Uint8Array(W * H), o = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let v = src[y * W + x];
        for (let k = -2; k <= 2; k++) { const xx = Math.min(W - 1, Math.max(0, x + k)); v = op(v, src[y * W + xx]); }
        t[y * W + x] = v;
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let v = t[y * W + x];
        for (let k = -2; k <= 2; k++) { const yy = Math.min(H - 1, Math.max(0, y + k)); v = op(v, t[yy * W + x]); }
        o[y * W + x] = v;
      }
      return o;
    };
    const closed = filt(filt(al, Math.max), Math.min);
    // and the translucent patches the scan's alpha leaves inside the blades: a blade is opaque
    for (let j = 0; j < W * H; j++) data[j * 4 + 3] = 255 * ss(40, 170, Math.max(data[j * 4 + 3], closed[j]));
    col.push({ input: await sharp(data, { raw: info }).png().toBuffer(), left, top });
    nrm.push({ input: await sharp(`../veg/bamboo/c${c}_n.png`).removeAlpha().toBuffer(), left, top });
  }
  await sharp({ create: { width: 2048, height: 2048, channels: 4, background: { r: 30, g: 40, b: 15, alpha: 0 } } }).composite(col).png().toFile('../veg/bamboo/bamboo.png');
  await sharp({ create: { width: 2048, height: 2048, channels: 3, background: { r: 128, g: 128, b: 255 } } }).composite(nrm).png().toFile('../veg/bamboo/bamboo_n.png');
  await sharp('../veg/bamboo/bamboo.png').webp({ quality: 90, alphaQuality: 95, effort: 6 }).toFile('../../public/assets/tex/bamboo_atlas.webp');
  await sharp('../veg/bamboo/bamboo_n.png').webp({ quality: 92, effort: 6 }).toFile('../../public/assets/tex/bamboo_atlas_n.webp');
  await sharp('../veg/bamboo/bamboo.png').flatten({ background: '#8a9aa8' }).resize(1400).toFile('../veg/bamboo/view.png');
})();

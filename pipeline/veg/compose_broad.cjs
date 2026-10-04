const sharp = require('sharp');
// 2 x 2 cells of 1024: konara sprays 0, 1 as scanned; 2, 3 the same sprays regraded to the oak's autumn, a dull gold
// and a rust brown (the twigs keep their colour)
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const AUT = [[1.5, 1.2, 0.45], [1.5, 1.0, 0.42]];
(async () => {
  const col = [], nrm = [];
  for (let c = 0; c < 4; c++) {
    const left = (c % 2) * 1024, top = Math.floor(c / 2) * 1024;
    const { data, info } = await sharp(`../veg/broad/c${c % 2}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (c >= 2) {
      const k = AUT[c - 2];
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const lum = 0.3 * r + 0.59 * g + 0.11 * b;
        const m = ss(0.0, 0.08, (g - r) / 255 + 0.03) * ss(0.15, 0.3, (Math.max(r, g) - b) / Math.max(g, 1));
        data[i] = r + (Math.min(255, lum * k[0]) - r) * m;
        data[i + 1] = g + (lum * k[1] - g) * m;
        data[i + 2] = b + (lum * k[2] - b) * m;
      }
    }
    col.push({ input: await sharp(data, { raw: info }).png().toBuffer(), left, top });
    nrm.push({ input: await sharp(`../veg/broad/c${c % 2}_n.png`).removeAlpha().toBuffer(), left, top });
  }
  await sharp({ create: { width: 2048, height: 2048, channels: 4, background: { r: 40, g: 50, b: 20, alpha: 0 } } }).composite(col).png().toFile('../veg/broad/broad.png');
  await sharp({ create: { width: 2048, height: 2048, channels: 3, background: { r: 128, g: 128, b: 255 } } }).composite(nrm).png().toFile('../veg/broad/broad_n.png');
  await sharp('../veg/broad/broad.png').webp({ quality: 90, alphaQuality: 95, effort: 6 }).toFile('../../public/assets/tex/broad_atlas.webp');
  await sharp('../veg/broad/broad_n.png').webp({ quality: 92, effort: 6 }).toFile('../../public/assets/tex/broad_atlas_n.webp');
  await sharp('../veg/broad/broad.png').flatten({ background: '#8a9aa8' }).resize(1200).toFile('../veg/broad/view.png');
})();

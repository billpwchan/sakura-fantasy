const sharp = require('sharp');
// 2 x 2 cells of 1024: green sprays 0, 1 (the scan's few yellowing leaves pulled back to summer green), red 2 and the
// same red regraded to orange in 3, so a crown in autumn mixes the two as iromomiji do
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
(async () => {
  const col = [], nrm = [];
  for (let c = 0; c < 4; c++) {
    const left = (c % 2) * 1024, top = Math.floor(c / 2) * 1024;
    const { data, info } = await sharp(`../veg/maple/c${c}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i + 1], b = data[i + 2];
      const mx = Math.max(r, g, b), sat = (mx - Math.min(r, g, b)) / Math.max(mx, 1);
      if (c < 2) {
        // the scan's summer leaves are a dull olive with a few yellowing: all leaf (blue low against the green, unlike
        // the twig's grey-brown) goes to iromomiji's clear summer green, its light and shade kept
        const leafm = ss(0.6, 0.45, b / Math.max(g, r, 1));
        const lum = 0.3 * r + 0.59 * g + 0.11 * b;
        const tr = lum * 0.74, tg = lum * 1.2, tb = lum * 0.36;
        const m = leafm * 0.85;
        r = r + (tr - r) * m; g = g + (Math.min(255, tg) - g) * m; b = b + (tb - b) * m;
      } else if (c === 3 && r > g * 1.6) {
        const gg = g + (r - g) * 0.38;
        r = Math.min(255, r * 1.06); g = gg; b = b * 0.5;
      }
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
      // no spray may end on the cell's straight edge
      const px = (i / 4) % info.width, py = Math.floor(i / 4 / info.width);
      const e = Math.min(px + 0.5, info.width - px - 0.5, py + 0.5, info.height - py - 0.5) / (info.width * 0.035);
      if (e < 1) data[i + 3] *= e * e * (3 - 2 * e);
    }
    col.push({ input: await sharp(data, { raw: info }).png().toBuffer(), left, top });
    nrm.push({ input: await sharp(`../veg/maple/c${c}_n.png`).removeAlpha().toBuffer(), left, top });
  }
  await sharp({ create: { width: 2048, height: 2048, channels: 4, background: { r: 60, g: 30, b: 20, alpha: 0 } } }).composite(col).png().toFile('../veg/maple/maple.png');
  await sharp({ create: { width: 2048, height: 2048, channels: 3, background: { r: 128, g: 128, b: 255 } } }).composite(nrm).png().toFile('../veg/maple/maple_n.png');
  await sharp('../veg/maple/maple.png').webp({ quality: 90, alphaQuality: 95, effort: 6 }).toFile('../../public/assets/tex/maple_atlas.webp');
  await sharp('../veg/maple/maple_n.png').webp({ quality: 92, effort: 6 }).toFile('../../public/assets/tex/maple_atlas_n.webp');
  await sharp('../veg/maple/maple.png').flatten({ background: '#8a9aa8' }).resize(1200).toFile('../veg/maple/view.png');
})();

const sharp = require('sharp');
// 4 x 2 cells of 512 px (rendered at 1024, so each is supersampled); the mound cells are re-centred on their content
const S = 512;
(async () => {
  const col = [], nrm = [];
  for (let c = 0; c < 8; c++) {
    let a = sharp(`../veg/azalea/c${c}.png`), n = sharp(`../veg/azalea/c${c}_n.png`);
    if (c === 2 || c === 3 || c >= 6) {
      const { data, info } = await sharp(`../veg/azalea/c${c}.png`).raw().toBuffer({ resolveWithObject: true });
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 8) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      const side = Math.ceil(Math.max(x1 - x0, y1 - y0) * 1.06);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const ext = { left: Math.round(side / 2 - cx), top: Math.round(side / 2 - cy) };
      const frame = async (img, bg) => {
        const big = await img.extend({ top: side, bottom: side, left: side, right: side, background: bg }).toBuffer();
        return sharp(big).extract({ left: Math.round(cx - side / 2 + side), top: Math.round(cy - side / 2 + side), width: side, height: side });
      };
      a = await frame(a, { r: 0, g: 0, b: 0, alpha: 0 });
      // a card's square must never show: the mound fades out on a ragged circle well inside it
      {
        const { data: d2, info: i2 } = await a.raw().toBuffer({ resolveWithObject: true });
        const W = i2.width;
        for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
          const dx = (x + 0.5) / W - 0.5, dy = (y + 0.5) / W - 0.5;
          const ang = Math.atan2(dy, dx);
          const rim = 0.43 + 0.035 * Math.sin(ang * 5 + c) + 0.02 * Math.sin(ang * 11 + 2 * c);
          const t = Math.min(1, Math.max(0, (rim - Math.hypot(dx, dy)) / 0.07));
          d2[(y * W + x) * 4 + 3] *= t * t * (3 - 2 * t);
        }
        a = sharp(d2, { raw: { width: W, height: W, channels: 4 } }).png();
      }
      n = await frame(n, { r: 128, g: 128, b: 255, alpha: 1 });
      void ext;
    }
    col.push({ input: await a.resize(S, S, { kernel: 'lanczos3' }).png().toBuffer(), left: (c % 4) * S, top: Math.floor(c / 4) * S });
    nrm.push({ input: await n.removeAlpha().resize(S, S, { kernel: 'lanczos3' }).png().toBuffer(), left: (c % 4) * S, top: Math.floor(c / 4) * S });
  }
  await sharp({ create: { width: 4 * S, height: 2 * S, channels: 4, background: { r: 40, g: 50, b: 20, alpha: 0 } } }).composite(col).png().toFile('../veg/azalea/azalea.png');
  await sharp({ create: { width: 4 * S, height: 2 * S, channels: 3, background: { r: 128, g: 128, b: 255 } } }).composite(nrm).png().toFile('../veg/azalea/azalea_n.png');
  await sharp('../veg/azalea/azalea.png').webp({ quality: 90, alphaQuality: 95, effort: 6 }).toFile('../../public/assets/tex/azalea_atlas.webp');
  await sharp('../veg/azalea/azalea_n.png').webp({ quality: 92, effort: 6 }).toFile('../../public/assets/tex/azalea_atlas_n.webp');
  await sharp('../veg/azalea/azalea.png').flatten({ background: '#5a6878' }).toFile('../veg/azalea/view_atlas.png');
})();

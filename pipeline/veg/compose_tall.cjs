const sharp = require('sharp');
// 4 x 2 cells of 512 x 1024 (0.9 x 1.8 m): reed stands 0-3, susuki clumps 4-7
(async () => {
  const col = [], nrm = [];
  for (let c = 0; c < 8; c++) {
    const left = (c % 4) * 512, top = Math.floor(c / 4) * 1024;
    col.push({ input: `../veg/tall/c${c}.png`, left, top });
    nrm.push({ input: await sharp(`../veg/tall/c${c}_n.png`).removeAlpha().toBuffer(), left, top });
  }
  await sharp({ create: { width: 2048, height: 2048, channels: 4, background: { r: 60, g: 66, b: 30, alpha: 0 } } }).composite(col).png().toFile('../veg/tall/tall.png');
  await sharp({ create: { width: 2048, height: 2048, channels: 3, background: { r: 128, g: 128, b: 255 } } }).composite(nrm).png().toFile('../veg/tall/tall_n.png');
  await sharp('../veg/tall/tall.png').webp({ quality: 90, alphaQuality: 95, effort: 6 }).toFile('../../public/assets/tex/tall_flora.webp');
  await sharp('../veg/tall/tall_n.png').webp({ quality: 92, effort: 6 }).toFile('../../public/assets/tex/tall_flora_n.webp');
  await sharp('../veg/tall/tall.png').flatten({ background: '#8a9aa8' }).resize(1200).toFile('../veg/tall/view.png');
})();

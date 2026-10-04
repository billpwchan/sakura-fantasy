const sharp = require('sharp');
// 2 x 2 cells of 1024 x 512 (cards are 2:1 too)
(async () => {
  const col = [], nrm = [];
  for (let c = 0; c < 4; c++) {
    const left = (c % 2) * 1024, top = Math.floor(c / 2) * 512;
    col.push({ input: `../veg/conifer/c${c}.png`, left, top });
    nrm.push({ input: await sharp(`../veg/conifer/c${c}_n.png`).removeAlpha().toBuffer(), left, top });
  }
  await sharp({ create: { width: 2048, height: 1024, channels: 4, background: { r: 30, g: 40, b: 15, alpha: 0 } } }).composite(col).png().toFile('../veg/conifer/conifer.png');
  await sharp({ create: { width: 2048, height: 1024, channels: 3, background: { r: 128, g: 128, b: 255 } } }).composite(nrm).png().toFile('../veg/conifer/conifer_n.png');
  await sharp('../veg/conifer/conifer.png').webp({ quality: 90, alphaQuality: 95, effort: 6 }).toFile('../../public/assets/tex/conifer_atlas.webp');
  await sharp('../veg/conifer/conifer_n.png').webp({ quality: 92, effort: 6 }).toFile('../../public/assets/tex/conifer_atlas_n.webp');
  await sharp('../veg/conifer/conifer.png').flatten({ background: '#8a9aa8' }).resize(1400).toFile('../veg/conifer/view.png');
})();

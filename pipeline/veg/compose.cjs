const sharp = require('sharp');
(async () => {
  for (const [sfx, out, ch] of [['', 'sakura_blossom', 4], ['_n', 'sakura_blossom_n', 3]]) {
    const t = [];
    for (let i = 0; i < 4; i++) t.push({ input: await sharp(`../veg/atlas/cell${i}${sfx}.png`).toBuffer(), left: (i % 2) * 1024, top: Math.floor(i / 2) * 1024 });
    const bg = ch === 4 ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 128, g: 128, b: 255 };
    await sharp({ create: { width: 2048, height: 2048, channels: ch, background: bg } }).composite(t).png().toFile(`../veg/atlas/${out}.png`);
    await sharp(`../veg/atlas/${out}.png`).webp({ quality: ch === 4 ? 90 : 92, alphaQuality: 90, effort: 6 }).toFile(`../../public/assets/tex/${out}.webp`);
  }
  await sharp('../veg/atlas/sakura_blossom.png').flatten({ background: '#6d7f92' }).resize(1000, 1000).toFile('../veg/atlas/view_all.png');
  await sharp('../veg/atlas/sakura_blossom_n.png').resize(1000, 1000).toFile('../veg/atlas/view_n.png');
})();

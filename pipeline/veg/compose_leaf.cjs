const sharp = require('sharp');
(async () => {
  for (const [sfx, out, ch] of [['', 'sakura_leaf', 4], ['_n', 'sakura_leaf_n', 3]]) {
    const t = [];
    for (let i = 0; i < 4; i++) {
      let img = sharp(`../veg/sakleaf/cell${i}${sfx}.png`);
      if (ch === 4) {
        // leaves the sprays' framing cut must not end on a straight line: fade the outer few percent
        const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
        const W = info.width;
        for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
          const e = Math.min(x + 0.5, W - x - 0.5, y + 0.5, W - y - 0.5) / (W * 0.04);
          if (e < 1) data[(y * W + x) * 4 + 3] *= e * e * (3 - 2 * e);
        }
        img = sharp(data, { raw: { width: W, height: W, channels: 4 } }).png();
      }
      t.push({ input: await img.toBuffer(), left: (i % 2) * 1024, top: Math.floor(i / 2) * 1024 });
    }
    const bg = ch === 4 ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 128, g: 128, b: 255 };
    await sharp({ create: { width: 2048, height: 2048, channels: ch, background: bg } }).composite(t).png().toFile(`../veg/sakleaf/${out}.png`);
    await sharp(`../veg/sakleaf/${out}.png`).webp({ quality: ch === 4 ? 90 : 92, alphaQuality: 90, effort: 6 }).toFile(`../../public/assets/tex/${out}.webp`);
  }
  await sharp('../veg/sakleaf/sakura_leaf.png').flatten({ background: '#6d7f92' }).resize(1000, 1000).toFile('../veg/sakleaf/view_all.png');
  await sharp('../veg/sakleaf/sakura_leaf_n.png').resize(1000, 1000).toFile('../veg/sakleaf/view_n.png');
})();

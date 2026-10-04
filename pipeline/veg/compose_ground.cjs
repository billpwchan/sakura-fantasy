const sharp = require('sharp');
const cells = [
  ...Array.from({ length: 8 }, (_, i) => [(i % 4) * 512, Math.floor(i / 4) * 256]),
  ...Array.from({ length: 4 }, (_, i) => [i * 512, 512]),
  ...Array.from({ length: 8 }, (_, i) => [(i % 4) * 512, 1024 + Math.floor(i / 4) * 512]),
];
(async () => {
  for (const [sfx, out, ch] of [['', 'ground_flora', 4], ['_n', 'ground_flora_n', 3]]) {
    const t = [];
    for (let i = 0; i < cells.length; i++) {
      let img = sharp(`../veg/ground/c${i}${sfx}.png`);
      if (ch === 4) {
        // no card may end in a straight cut: alpha fades out over the outer few percent of each side
        const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
        const W = info.width, H = info.height;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const e = Math.min(x + 0.5, W - x - 0.5) / (W * 0.07);
          const k = e >= 1 ? 1 : e * e * (3 - 2 * e);
          const top = Math.min(1, (y + 0.5) / (H * 0.03));
          data[(y * W + x) * 4 + 3] *= k * top;
        }
        img = sharp(data, { raw: { width: W, height: H, channels: 4 } }).png();
      }
      t.push({ input: await img.toBuffer(), left: cells[i][0], top: cells[i][1] });
    }
    const bg = ch === 4 ? { r: 70, g: 80, b: 30, alpha: 0 } : { r: 128, g: 128, b: 255 };
    await sharp({ create: { width: 2048, height: 2048, channels: ch, background: bg } }).composite(t).png().toFile(`../veg/ground/${out}.png`);
    await sharp(`../veg/ground/${out}.png`).webp({ quality: ch === 4 ? 90 : 92, alphaQuality: 92, effort: 6 }).toFile(`../../public/assets/tex/${out}.webp`);
  }
  await sharp('../veg/ground/ground_flora.png').flatten({ background: '#5a6878' }).resize(1024, 1024).toFile('../veg/ground/view_all.png');
})();

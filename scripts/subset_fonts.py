#!/usr/bin/env python3
# Re-cut public/fonts/ShipporiMinchoB1-*.woff2 to the characters the site can print. Run after changing any
# Japanese copy: a character missing from the cut falls back to the system Mincho.
# needs: pip install fonttools brotli
import pathlib, subprocess, sys, tempfile, urllib.request

root = pathlib.Path(__file__).resolve().parent.parent
src = [root / 'index.html'] + [p for p in (root / 'src').rglob('*') if p.suffix in ('.js', '.css', '.json', '.html')]
text = ''.join(p.read_text(encoding='utf-8', errors='ignore') for p in src)
text += ''.join(chr(c) for c in range(0x20, 0x7f)) + '、。・「」『』〜ー（）：！？…—–‘’“”'
chars = ''.join(sorted({c for c in text if ord(c) >= 0x20}))

tmp = pathlib.Path(tempfile.mkdtemp())
(tmp / 'chars.txt').write_text(chars)
for weight, name in [(400, 'Regular'), (600, 'SemiBold'), (800, 'ExtraBold')]:
    ttf = tmp / f'{name}.ttf'
    url = f'https://raw.githubusercontent.com/google/fonts/main/ofl/shipporiminchob1/ShipporiMinchoB1-{name}.ttf'
    ttf.write_bytes(urllib.request.urlopen(url).read())
    out = root / 'public' / 'fonts' / f'ShipporiMinchoB1-{weight}.woff2'
    subprocess.run([sys.executable, '-m', 'fontTools.subset', str(ttf), f'--text-file={tmp / "chars.txt"}', '--flavor=woff2',
                    '--layout-features=*', '--no-hinting', '--desubroutinize', f'--output-file={out}'], check=True)
    print(out.name, out.stat().st_size)
print(len(chars), 'characters')

import json, os, sys, urllib.request
ids = sys.argv[1:]
proxy = os.environ.get('PXY')
opener = urllib.request.build_opener(urllib.request.ProxyHandler({'https': proxy, 'http': proxy} if proxy else {}))
for i in ids:
    d = json.load(open(f'{i}.json'))['gltf'][os.environ.get('RES', '1k')]['gltf']
    os.makedirs(i, exist_ok=True)  # textures of every resolution sit side by side; the .bin is shared
    items = [(os.path.basename(d['url']), d['url'])] + [(k, v['url']) for k, v in d.get('include', {}).items()]
    for name, url in items:
        out = os.path.join(i, name)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if os.path.exists(out): continue
        with opener.open(url, timeout=60) as r, open(out, 'wb') as f: f.write(r.read())
    print('ok', i)

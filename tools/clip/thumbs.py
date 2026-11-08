# Миниатюры 330px всех картин -> <папка>/thumbs/<qid>_<i>.jpg (для CLIP).
# Запуск: python thumbs.py <рабочая папка>
# Качает по одной картинке с паузой: при параллельной загрузке Wikimedia отвечает 429.
import json, os, sys, urllib.request, urllib.parse, urllib.error, time
D = sys.argv[1]; os.makedirs(os.path.join(D, 'thumbs'), exist_ok=True)
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
s = open(os.path.join(ROOT, 'data', 'paintings.js'), encoding='utf-8').read()
P = json.loads(s[s.index('=') + 1:s.rindex(';')])
UA = 'ArtEyeTrainer/0.1 (https://github.com/ScherbakovAlexander/art-eye; educational, low volume)'
jobs = []
for q, ps in P.items():
    for i, p in enumerate(ps):
        h, f = p[0], p[1]; e = urllib.parse.quote(f); base = f'https://upload.wikimedia.org/wikipedia/commons/thumb/{h[0]}/{h}/{e}/'
        th = f'lossy-page1-330px-{e}.jpg' if f.lower().endswith(('.tif', '.tiff')) else f'330px-{e}'
        jobs.append((f'{q}_{i}', base + th, base + f'500px-{e}'))
def get(name, *urls):
    out = os.path.join(D, 'thumbs', name + '.jpg')
    if os.path.exists(out): return 'skip'
    for url in urls:
        for t in range(4):
            try:
                data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60).read()
                open(out, 'wb').write(data); time.sleep(0.25); return 'ok'
            except urllib.error.HTTPError as e:
                if e.code == 429: time.sleep(int(e.headers.get('retry-after') or 10) + 2); continue
                break
            except Exception: time.sleep(2)
    return 'fail'
res = {}
for k, j in enumerate(jobs):
    r = get(*j); res[r] = res.get(r, 0) + 1
    if k % 200 == 0: print(k, len(jobs), res, flush=True)
print('done', res)

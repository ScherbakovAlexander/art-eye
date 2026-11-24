"""Копия картинок с Wikimedia Commons для отдельного репозитория art-eye-img (GitHub Pages).

Зачем: upload.wikimedia.org недоступен из части российских сетей, и сайт остаётся без картинок.
Каждая картина и портрет сохраняются как <md5prefix>/<fnv1a(имя файла)>.webp (до 800×1000 px, WebP).
Имя считается так же, как в js/app.js (imgKey): FNV-1a 32 по UTF-16 кодам имени файла Commons.

Запуск:  python tools/mirror_images.py <папка art-eye-img> [--ip 208.80.154.240] [--limit N]
Уже скачанные файлы пропускаются, так что запуск можно повторять; ошибки — в <папка>/failed.txt.
"""
import io, json, os, socket, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'art-eye-mirror/1.0 (https://github.com/ScherbakovAlexander/art-eye)'
MAXW, MAXH, Q = 800, 1000, 70
PAUSE = 1.0


def fnv(name):
    h = 0x811c9dc5
    b = name.encode('utf-16-le')
    for i in range(0, len(b), 2):
        h ^= b[i] | (b[i + 1] << 8)
        h = (h * 0x01000193) & 0xffffffff
    return f'{h:08x}'


def load(path):
    """[(имя переменной, объект)] — по строке на присваивание window.X = {...} / Object.assign(window.X, {...})."""
    res = []
    for line in open(os.path.join(ROOT, path), encoding='utf8'):
        if 'window.' not in line or '{' not in line: continue
        var = line.split('window.', 1)[1].split('=')[0].split(',')[0].strip()
        res.append((var, json.loads(line[line.index('{'):line.rindex('}') + 1])))
    return res


def items():
    out = {}
    for f in ('data/paintings.js', 'data/beta-extra.js', 'data/portraits.js'):
        for var, obj in load(f):
            for v in obj.values():
                for r in (v if var == 'PAINTINGS' else [v]): out[(r[0], r[1])] = 1
    return list(out)


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for attempt in range(8):
        try:
            with urllib.request.urlopen(req, timeout=60) as r: data = r.read()
            time.sleep(PAUSE)   # Wikimedia ограничивает ботов по частоте — не торопимся
            return data
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(int(e.headers.get('Retry-After') or 10) + 2 * attempt); continue
            raise
        except Exception:
            time.sleep(3 * (attempt + 1))
    raise RuntimeError('retries exhausted')


def fetch(h, f):
    enc = urllib.parse.quote(f)
    base = f'https://upload.wikimedia.org/wikipedia/commons'
    thumb = f'lossy-page1-960px-{enc}.jpg' if f.lower().endswith(('.tif', '.tiff')) else f'960px-{enc}'
    try:
        return get(f'{base}/thumb/{h[0]}/{h}/{enc}/{thumb}')
    except urllib.error.HTTPError:
        return get(f'{base}/{h[0]}/{h}/{enc}')   # картинка уже 960 px — берём оригинал


def one(out, h, f):
    dst = os.path.join(out, h, fnv(f) + '.webp')
    if os.path.exists(dst): return 'skip'
    im = Image.open(io.BytesIO(fetch(h, f)))
    im.seek(0)
    im = im.convert('RGB')
    im.thumbnail((MAXW, MAXH), Image.LANCZOS)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im.save(dst + '.tmp', 'WEBP', quality=Q, method=5)
    os.replace(dst + '.tmp', dst)
    return 'ok'


def main():
    out = sys.argv[1]
    ip = sys.argv[sys.argv.index('--ip') + 1] if '--ip' in sys.argv else None
    if ip:   # обход недоступного узла Wikimedia: тот же сертификат, другой дата-центр
        real = socket.getaddrinfo
        socket.getaddrinfo = lambda host, *a, **k: real(ip if host == 'upload.wikimedia.org' else host, *a, **k)
    todo = items()
    if '--limit' in sys.argv: todo = todo[:int(sys.argv[sys.argv.index('--limit') + 1])]
    keys = {}
    for h, f in todo:
        k = (h, fnv(f))
        if k in keys and keys[k] != f: print('! коллизия', h, f, keys[k])
        keys[k] = f
    print('всего', len(todo), flush=True)
    failed, done = [], 0

    def job(x):
        try: return one(out, *x)
        except Exception as e: failed.append(f'{x[0]}\t{x[1]}\t{e}'); return 'fail'

    with ThreadPoolExecutor(1) as ex:
        for r in ex.map(job, todo):
            done += 1
            if done % 100 == 0: print(done, 'готово, ошибок', len(failed), flush=True)
    open(os.path.join(out, 'failed.txt'), 'w', encoding='utf8').write('\n'.join(failed))
    print('итог: всего', len(todo), 'ошибок', len(failed), flush=True)


if __name__ == '__main__':
    main()

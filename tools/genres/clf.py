# Классификатор жанра на CLIP: картинка (work/emb.npy) + английское название (текстовый энкодер CLIP).
# Учится на жанрах из Wikidata, проверяется перекрёстно; доразмечает остальные → genres.json
# Запуск: python clf.py   (сначала label.py, thumbs.py и embed.py в work/)
import json, os, numpy as np, torch, open_clip
from collections import Counter
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_predict, StratifiedKFold
here = os.path.dirname(os.path.abspath(__file__)); W = os.path.join(here, 'work')
L = json.load(open(os.path.join(here, 'labels.json'), encoding='utf-8'))
img = np.load(os.path.join(W, 'emb.npy')); ids = json.load(open(os.path.join(W, 'ids.json')))
ids = [i if '#' in i else i.replace('_', '#') for i in ids]
ix = {p: k for k, p in enumerate(ids)}
pids = [p for p in L if p in ix]
print('картин с миниатюрой', len(pids), 'из', len(L))

# текстовые отпечатки названий
model, _, _ = open_clip.create_model_and_transforms('ViT-B-32', pretrained='openai'); model.eval()
tok = open_clip.get_tokenizer('ViT-B-32')
T = []
with torch.no_grad():
    for k in range(0, len(pids), 256):
        e = model.encode_text(tok([L[p]['en'][:200] or 'painting' for p in pids[k:k + 256]])); T.append((e / e.norm(dim=-1, keepdim=True)).numpy())
T = np.concatenate(T)
X = np.hstack([img[[ix[p] for p in pids]], 0.7 * T])
Xi = img[[ix[p] for p in pids]]

lab = np.array([L[p]['wd'][0] if L[p]['wd'] else '' for p in pids])
tr = lab != ''
classes = sorted(set(lab[tr]))
cv = StratifiedKFold(5, shuffle=True, random_state=0)
def evaluate(F, name):
    clf = LogisticRegression(C=3, max_iter=3000)
    pr = cross_val_predict(clf, F[tr], lab[tr], cv=cv, method='predict_proba')
    pred = np.array(classes)[pr.argmax(1)]; conf = pr.max(1); y = lab[tr]
    print(f'\n{name}: точность {np.mean(pred == y):.3f}')
    for th in (0.5, 0.6, 0.7, 0.8):
        m = conf >= th; print(f'  уверенность ≥{th}: доля {m.mean():.2f}, точность {np.mean(pred[m] == y[m]):.3f}')
    for c in classes:
        m = y == c; mp = pred == c
        print(f'  {c:10s} n={m.sum():4d}  полнота {np.mean(pred[m] == c):.2f}  точность {np.mean(y[mp] == c) if mp.any() else 0:.2f}')
    return pr
evaluate(Xi, 'только картинка')
pr = evaluate(X, 'картинка + название')

# итог: Wikidata > классификатор (уверенность ≥ 0.6) > ключевые слова > нет
clf = LogisticRegression(C=3, max_iter=3000).fit(X[tr], lab[tr])
P = clf.predict_proba(X); pred = np.array(clf.classes_)[P.argmax(1)]; conf = P.max(1)
cvpred = dict(zip(np.array(pids)[tr], np.array(classes)[pr.argmax(1)])); cvconf = dict(zip(np.array(pids)[tr], pr.max(1)))
out, src, flags = {}, Counter(), []
for k, p in enumerate(pids):
    v = L[p]
    if v['wd']:
        g, s = v['wd'][0], 'wd'
        if cvpred[p] != g and cvconf[p] >= 0.85: flags.append((p, g, cvpred[p], round(float(cvconf[p]), 2), v['t'][:80]))
    elif conf[k] >= 0.6: g, s = pred[k], 'clip'
    elif v['kw']: g, s = v['kw'], 'kw'
    else: g, s = None, 'none'
    src[s] += 1
    out[p] = {'g': g, 's': s, 'c': round(float(conf[k]), 2), 'clip': pred[k], 'kw': v['kw'], 't': v['t'][:120], 'f': v['f']}
json.dump(out, open(os.path.join(here, 'genres.json'), 'w', encoding='utf-8'), ensure_ascii=False)
json.dump(flags, open(os.path.join(here, 'flags.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('\nисточник итогового жанра:', src.most_common())
print('итог:', Counter(v['g'] or 'нет' for v in out.values()).most_common())
kwc = [(v['kw'], v['clip']) for v in out.values() if v['s'] == 'clip' and v['kw']]
print('где есть и слово, и CLIP (без WD): совпадают', sum(a == b for a, b in kwc), 'из', len(kwc))
print('Wikidata спорит с уверенным CLIP:', len(flags))

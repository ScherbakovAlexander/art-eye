# Трудность пар художников -> data/pairs.js
# Запуск: python pairs.py <рабочая папка с emb.npy и ids.json>
#
# Две меры, обе по отпечаткам CLIP:
#  1) похожесть «центров» — средних отпечатков всех картин художника;
#  2) путаница — простой классификатор «кто автор» (логистическая регрессия) учится на 4/5 картин и отвечает на 1/5,
#     которых не видел; для картины автора A считаем, как часто при выборе «A или B» он выбрал бы B.
# Трудность пары = среднее мест пары в двух списках (0 — самая лёгкая из всех пар, 1 — самая трудная).
# Ручные поправки (OVERRIDE) — пары, где мера расходится с человеческим глазом.
import os, sys, json, re, numpy as np, torch
D = sys.argv[1]; ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OVERRIDE = {}   # {('Q…', 'Q…'): 0.2} — ручные поправки, если машина расходится с глазом

src = open(os.path.join(ROOT, 'js', 'curriculum.js'), encoding='utf-8').read()
order = re.findall(r"\{ q: '(Q\d+)', n: '", src)
E = torch.tensor(np.load(os.path.join(D, 'emb.npy'))); ids = json.load(open(os.path.join(D, 'ids.json')))
ai = {a: k for k, a in enumerate(order)}; K = len(order)
keep = [i for i, p in enumerate(ids) if p.split('#')[0] in ai]; E = E[keep]; ids = [ids[i] for i in keep]
y = torch.tensor([ai[p.split('#')[0]] for p in ids]); N = len(ids)
missing = [a for a in order if (y == ai[a]).sum() < 5]
assert not missing, f'мало отпечатков: {missing}'

# 1) похожесть центров
C = torch.nn.functional.normalize(torch.stack([E[y == k].mean(0) for k in range(K)]), dim=1)
sim = (C @ C.T).numpy()

# 2) путаница классификатора, 5 частей
fold = torch.randint(0, 5, (N,), generator=torch.Generator().manual_seed(0))
Z = torch.zeros(N, K)
for f in range(5):
    tr = fold != f
    W = torch.zeros(E.shape[1], K, requires_grad=True); b = torch.zeros(K, requires_grad=True)
    opt = torch.optim.LBFGS([W, b], max_iter=300, line_search_fn='strong_wolfe')
    def closure():
        opt.zero_grad()
        l = torch.nn.functional.cross_entropy(E[tr] @ W * 30 + b, y[tr]) + 1e-3 * (W ** 2).sum(); l.backward(); return l
    opt.step(closure)
    Z[~tr] = (E[~tr] @ W * 30 + b).detach()
print('классификатор угадывает автора:', f'{(Z.argmax(1) == y).float().mean():.1%}')
Zn, yn = Z.numpy(), y.numpy()
conf = np.zeros((K, K)); cnt = np.zeros(K)
for i in range(N):
    a = yn[i]; conf[a] += 1 / (1 + np.exp(-(Zn[i] - Zn[i, a]))); cnt[a] += 1
conf /= cnt[:, None]; conf = (conf + conf.T) / 2

# смесь мест
iu = np.triu_indices(K, 1)
rank = lambda v: np.argsort(np.argsort(v)) / (len(v) - 1)
mix = (rank(sim[iu]) + rank(conf[iu])) / 2
M = np.zeros((K, K)); M[iu] = mix; M = M + M.T
for (a, b), v in OVERRIDE.items(): M[ai[a], ai[b]] = M[ai[b], ai[a]] = v

# компактно: верхний треугольник построчно, по 2 цифры (00–99) на пару
vals = ''.join(f'{min(99, int(round(M[i, j] * 99))):02d}' for i, j in zip(*iu))
out = ('// Трудность пар художников 0–99 (tools/clip/pairs.py): смесь похожести CLIP и путаницы классификатора.\n'
       '// Верхний треугольник построчно в порядке q, по 2 цифры на пару.\n'
       f'window.PAIRS = {json.dumps({"q": order, "v": vals})};\n')
open(os.path.join(ROOT, 'data', 'pairs.js'), 'w', encoding='utf-8').write(out)
print('pairs.js:', K, 'художников,', len(vals) // 2, 'пар,', len(out) // 1024, 'КБ')

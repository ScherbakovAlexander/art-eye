# Жанр (P136) и «что изображено» (P180) для всех картин из raw.json → genres/wd.json
import json, urllib.request, urllib.parse, time, os, sys
UA = {'User-Agent': 'ArtEyeTrainer/0.1 (personal learning app)', 'Accept': 'application/sparql-results+json'}
def sparql(q):
    data = urllib.parse.urlencode({'query': q}).encode()
    for i in range(8):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request('https://query.wikidata.org/sparql', data=data, headers=UA), timeout=120))['results']['bindings']
        except Exception as e:
            print('  retry', e, flush=True); time.sleep(20)
    raise SystemExit('failed')
here = os.path.dirname(os.path.abspath(__file__))
raw = json.load(open(os.path.join(here, '..', 'raw.json'), encoding='utf-8'))
ids = sorted({r['p'].rsplit('/', 1)[1] for a in raw.values() for r in a['rows']})
out_path = os.path.join(here, 'wd.json')
out = json.load(open(out_path, encoding='utf-8')) if os.path.exists(out_path) else {}
todo = [q for q in ids if q not in out]
print(len(ids), 'картин, осталось', len(todo), flush=True)
for i in range(0, len(todo), 250):
    batch = todo[i:i + 250]
    q = '''SELECT ?p ?prop ?v ?vl WHERE { VALUES ?p { %s }
      { ?p wdt:P136 ?v. BIND("g" AS ?prop) } UNION { ?p wdt:P180 ?v. BIND("d" AS ?prop) }
      OPTIONAL { ?v rdfs:label ?vl FILTER(LANG(?vl)="en") } }''' % ' '.join('wd:' + x for x in batch)
    rows = sparql(q)
    for x in batch: out.setdefault(x, {'g': [], 'd': []})
    for r in rows:
        p = r['p']['value'].rsplit('/', 1)[1]
        out[p][r['prop']['value']].append(r.get('vl', r['v'])['value'])
    json.dump(out, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False)
    print(i + len(batch), flush=True); time.sleep(1.5)

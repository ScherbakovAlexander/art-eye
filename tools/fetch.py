import json, urllib.request, urllib.parse, time, random, sys, os
UA={'User-Agent':'ArtEyeTrainer/0.1 (personal learning app)','Accept':'application/sparql-results+json'}
SKIP={'Maurice de Vlaminck','Pablo Picasso','Georges Braque','Giorgio de Chirico','René Magritte','Salvador Dalí'}
FIX={'Pieter Bruegel the Elder':'Q43270'}
FRESCO={'Giotto','Piero della Francesca'}
PRINTS={'Katsushika Hokusai','Utagawa Hiroshige','Kitagawa Utamaro'}
def sparql(q):
    data=urllib.parse.urlencode({'query':q}).encode()
    for i in range(8):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request('https://query.wikidata.org/sparql',data=data,headers=UA),timeout=120))['results']['bindings']
        except Exception as e:
            ra=getattr(e,'headers',None) and e.headers.get('Retry-After')
            print('  retry',e,ra,flush=True); time.sleep(int(ra or 20)+3)
    raise SystemExit('failed')
cache={}
if os.path.exists('raw.json'): cache=json.load(open('raw.json',encoding='utf-8'))
for a in json.load(open('qids.json',encoding='utf-8')):
    n=a['name']
    if n in SKIP or n in cache: continue
    qid=FIX.get(n,a['qid'])
    types='wd:Q3305213 wd:Q18218093 wd:Q11060274' if n in PRINTS else ('wd:Q3305213 wd:Q134194' if n in FRESCO else 'wd:Q3305213')
    q=f'''SELECT ?p (SAMPLE(?img) AS ?img) (MIN(YEAR(?d)) AS ?y) (SAMPLE(?ru) AS ?ru) (SAMPLE(?en) AS ?en) (SAMPLE(?sl) AS ?sl) WHERE {{
 ?p p:P170 ?st. ?st ps:P170 wd:{qid}. FILTER NOT EXISTS {{ ?st pq:P5102 [] }} FILTER NOT EXISTS {{ ?st pq:P1774 [] }}
 ?p wdt:P31 ?t. VALUES ?t {{ {types} }}
 ?p wdt:P18 ?img. OPTIONAL {{ ?p wdt:P571 ?d }}
 FILTER NOT EXISTS {{ ?p wdt:P170 ?other. FILTER(?other != wd:{qid}) }}
 OPTIONAL {{ ?p rdfs:label ?ru FILTER(LANG(?ru)="ru") }} OPTIONAL {{ ?p rdfs:label ?en FILTER(LANG(?en)="en") }}
 OPTIONAL {{ ?p wikibase:sitelinks ?sl }}
}} GROUP BY ?p'''
    rows=sparql(q)
    cache[n]={'qid':qid,'rows':[{k:v['value'] for k,v in r.items()} for r in rows]}
    print(len(rows),n,flush=True)
    json.dump(cache,open('raw.json','w',encoding='utf-8'),ensure_ascii=False)
    time.sleep(1.5)

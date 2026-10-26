import json, urllib.request, urllib.parse
UA={'User-Agent':'ArtEyeTrainer/0.1 (personal learning app)','Accept':'application/sparql-results+json'}
names=[n.strip() for n in open('artists.txt',encoding='utf-8') if n.strip()]
vals=' '.join('"%s"@en'%n for n in names)
q='''SELECT ?name ?a (COUNT(DISTINCT ?p) AS ?n) WHERE {
 VALUES ?name { %s }
 ?a rdfs:label|skos:altLabel ?name. ?a wdt:P31 wd:Q5.
 ?p wdt:P170 ?a; wdt:P18 [].
 ?p wdt:P31 ?t. VALUES ?t { wd:Q3305213 wd:Q18218093 wd:Q93184 wd:Q11060274 }
} GROUP BY ?name ?a''' % vals
data=urllib.parse.urlencode({'query':q}).encode()
import time
for i in range(6):
    try:
        r=json.load(urllib.request.urlopen(urllib.request.Request('https://query.wikidata.org/sparql',data=data,headers=UA),timeout=120)); break
    except urllib.error.HTTPError as e:
        print('retry',e.code,e.headers.get('Retry-After')); time.sleep(int(e.headers.get('Retry-After') or 30)+5)
best={}
for b in r['results']['bindings']:
    n=b['name']['value']; c=int(b['n']['value']); a=b['a']['value'].split('/')[-1]
    if n not in best or c>best[n][1]: best[n]=(a,c)
out=[]
for n in names:
    a,c=best.get(n,(None,0)); out.append({'name':n,'qid':a,'count':c}); print(f'{c:5} {a} {n}')
json.dump(out,open('qids.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)

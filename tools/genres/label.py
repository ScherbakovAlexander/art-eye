# Жанр каждой картины приложения: из Wikidata (P136) и по ключевым словам в названиях (ru, en) и P180 → genres/labels.json
import json, re, os, urllib.parse
from collections import Counter
here = os.path.dirname(os.path.abspath(__file__))
P = json.loads(open(os.path.join(here, '..', '..', 'data', 'paintings.js'), encoding='utf-8').read().split('window.PAINTINGS=', 1)[1].rstrip().rstrip(';'))
raw = json.load(open(os.path.join(here, '..', 'raw.json'), encoding='utf-8'))
wd = json.load(open(os.path.join(here, 'wd.json'), encoding='utf-8'))
byfile = {}
for a in raw.values():
    for r in a['rows']:
        f = urllib.parse.unquote(r['img'].rsplit('/', 1)[1]).replace(' ', '_')
        byfile[f] = r

WD = {
 'portrait': ['portrait', 'self-portrait', 'double portrait', 'group portrait', 'family portrait', 'equestrian portrait', 'tronie', 'profile',
              'historiated portrait', 'donor portrait', 'catafalque portrait', 'schutterstuk', 'Regents group portrait'],
 'religious': ['religious art', 'Christian painting'],
 'myth': ['mythological painting', 'mythological art', 'allegory', 'Arthurian painting'],
 'history': ['history painting', 'battle painting'],
 'still': ['still life', 'floral painting', 'vanitas', 'bodegón'],
 'abstract': ['abstract art'],
 'genre': ['genre art', 'interior view', 'interior painting', 'Interior painting', 'street scene', 'Fête galante', 'hunting'],
 'landscape': ['landscape painting', 'Veduta', 'marine art', 'cityscape', 'capriccio', 'architectural painting', 'architectural view',
               'historical landscape', 'village scape', 'meisho-e', 'idyll', 'pastoral', 'church interior'],
 'animals': ['animal art'],
}
WDMAP = {v: g for g, vs in WD.items() for v in vs}
# при нескольких жанрах — главный: сюжет важнее формы (портрет святого — религиозный)
PRIO = ['abstract', 'religious', 'myth', 'history', 'still', 'portrait', 'genre', 'animals', 'landscape']
KW = {
 'religious': r'мадонн|богоматер|богородиц|христ|святого|святой|святая|святые|апостол|ангел|благовещ|распяти|пьета|рождество|поклонение|святое семейство|креститель|крещение|давид|юдифь|моисе|авраам|иаков|сусанн|самсон|товий|товия|вирсави|магдалин|иероним|себастьян|страшный суд|тайная вечеря|вознесени|воскресени|бегство в египет|снятие с креста|несение креста|положение во гроб|оплакивани|мученик|мучениц|евангелист|св\.|библ|голгоф|искушени|лазар|пророк|иисус|madonna|virgin|christ|saint\b|\bst\.? |apostle|angel|annunciation|crucifix|pietà|pieta|nativity|adoration|holy family|baptist|baptism|\bdavid\b|judith|moses|abraham|jacob|susanna|samson|tobias|bathsheba|magdalen|jerome|sebastian|last judg|last supper|ascension|resurrection|flight into egypt|deposition|entombment|lamentation|martyr|evangelist|ecce homo|calvary|lazarus|prophet|jesus|madone|heilige|santa |san ',
 'myth': r'венер|диан[аыу]|вакх|вакхан|юпитер|аполлон|нимф|сатир|амур|купидон|психе|минерв|геракл|геркулес|леда|дана[яе]|европ[ыа]|париса|аллегори|орфе|нарцисс|персе[йя]|андромед|адонис|вулкан|меркури|галате|прометей|муз[ыа]\b|граци[ия]|ариадн|актеон|кентавр|нептун|посейдон|зевс|афродит|прозерпин|цирцея|одиссе|улисс|ахилл|медуз|сирен|venus|diana|bacchus|bacchanal|jupiter|apollo|nymph|satyr|cupid|amor\b|psyche|\bmars\b|minerva|hercules|heracles|leda|dana[eë]|europa|judge?ment of paris|allegor|orpheus|narcissus|perseus|andromeda|adonis|vulcan|mercury|galatea|prometheus|\bmuses?\b|graces|ariadne|actaeon|centaur|neptune|zeus|aphrodite|proserpin|circe|ulysses|odysse|achilles|medusa|siren|flora\b|pomona|aurora|endymion|bacchante|vertumnus',
 'portrait': r'портрет|автопортрет|portrait|porträt|ritratto|retrato|portret|bildnis|selbstbildnis',
 'still': r'натюрморт|still life|stillleben|stilleven|nature morte|ваза с|цветы в|букет|vase of|vase with|bouquet|flowers in|fruit|фрукт|bodegón|vanitas|ванитас',
 'history': r'битв|сражени|коронаци|взятие|казн[ьи]|наполеон|петр i|пётр i|иван грозн|battle|coronation|capture of|execution|napoleon|surrender|siege|осада|клятва|oath of|въезд|entry of|запорожц|боярын|княжн|царевн|tsar|emperor|император',
 'abstract': r'композиция|импровизаци|абстракц|супремати|composition|improvisation|abstract|suprematis|контрасты|красный квадрат|черный квадрат|чёрный квадрат',
 'genre': r'крестьян|таверн|кабак|трактир|кухн|кухарк|свадьб|танц|рынок|рынке|игрок|урок|читающ|чтение|письм|праздник|ярмарк|завтрак|обед|чаепит|прачк|кружевниц|служанк|пряха|интерьер|музыкант|концерт|кафе|балерин|балет|скачк|peasant|tavern|\binn\b|kitchen|\bcook|wedding|danc|market|players|lesson|reading|letter|\bball\b|feast|\bfair\b|breakfast|luncheon|dinner|\btea\b|laundress|lacemaker|\bmaid|spinner|interior|\bcards?\b|concert|musician|\bcafe|café|ballet|races',
 'landscape': r'пейзаж|\bвид\b|море|морск|берег|река|реке|озер|\bлес|роща|гора|горы|долин|закат|рассвет|восход|зима|осен|весна|летн|зимн|весенн|\bполе|\bлуг|пруд|\bмост|гаван|канал|\bсад|парк|утро|вечер|ноч[ьи]|\bбур[яи]|шторм|волн|остров|скал|водопад|деревн|улиц|площад|собор|венеци|landscape|view of|view on|\bsea\b|seascape|coast|shore|beach|river|lake|forest|\bwoods?\b|mountain|valley|sunset|sunrise|winter|autumn|spring|summer|\bfields?\b|meadow|pond|bridge|harbou?r|port of|canal|garden|\bpark\b|morning|evening|\bnight|storm|\bwaves?\b|island|cliff|\brocks?\b|waterfall|village|street|square|cathedral|church|haystack|стог|poplar|тополь|\bmill|мельниц|boats|лодк|snow|снег|fog|туман|\bmoon|\bлун',
 'animals': r'лошад|\bконь|\bкони|собак|кошк|\bкот\b|корова|\bбык|овц|птиц|\bлев\b|тигр|олен|horse|\bdogs?\b|\bcats?\b|\bcows?\b|cattle|sheep|\bbirds?\b|\blions?\b|tiger|\bdeer\b|\bstag\b',
}
KWO = ['abstract', 'religious', 'myth', 'still', 'portrait', 'history', 'genre', 'animals', 'landscape']
KWRE = {g: re.compile(KW[g], re.I) for g in KWO}
DEP_REL = re.compile(r'Virgin Mary|Jesus|Christ|Saint |Mary Magdalene|angel|apostle|John the Baptist|Moses|David|crucifix|Madonna', re.I)
DEP_MYTH = re.compile(r'Venus|Diana|Bacchus|Cupid|Apollo|Jupiter|Zeus|Mars|Minerva|Hercules|nymph|satyr|Psyche|Leda|Danaë|Europa|Mercury|Neptune|Orpheus|Adonis|muse', re.I)

def kw_genre(text, deps):
    for g in KWO:
        if KWRE[g].search(text): return g
    if any(DEP_REL.search(d) for d in deps): return 'religious'
    if any(DEP_MYTH.search(d) for d in deps): return 'myth'
    return None

out, stat = {}, Counter()
for q, rows in P.items():
    for i, r in enumerate(rows):
        pid = f'{q}#{i}'
        src = byfile.get(r[1])
        qid = src['p'].rsplit('/', 1)[1] if src else None
        w = wd.get(qid, {'g': [], 'd': []}) if qid else {'g': [], 'd': []}
        wg = sorted({WDMAP[g] for g in w['g'] if g in WDMAP}, key=PRIO.index)
        text = ' | '.join(x for x in [r[3], src and src.get('en'), src and src.get('ru')] if x)
        kg = kw_genre(' ' + text + ' ', w['d'])
        out[pid] = {'wd': wg, 'kw': kg, 't': text, 'en': (src and src.get('en')) or r[3] or '', 'f': r[1], 'qid': qid}
        stat['all'] += 1; stat['matched'] += bool(src)
        stat['wd'] += bool(wg); stat['kw'] += bool(kg); stat['any'] += bool(wg or kg)
        if wg and kg: stat['both'] += 1; stat['agree'] += kg == wg[0]; stat['agree_any'] += kg in wg
json.dump(out, open(os.path.join(here, 'labels.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print(dict(stat))
print('WD главный:', Counter(v['wd'][0] for v in out.values() if v['wd']).most_common())
print('KW:', Counter(v['kw'] for v in out.values() if v['kw']).most_common())
fin = Counter((v['wd'][0] if v['wd'] else v['kw']) or 'нет' for v in out.values())
print('итог (WD, иначе слова):', fin.most_common())
dis = Counter((v['wd'][0], v['kw']) for v in out.values() if v['wd'] and v['kw'] and v['kw'] not in v['wd'])
print('расхождения:', dis.most_common(15))

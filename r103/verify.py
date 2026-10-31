"""Verify public search, assets, protected files and buyer-facing content before packaging."""
import sys,json,hashlib,re
from pathlib import Path
from collections import Counter
from urllib.parse import urlsplit,unquote
from xml.etree import ElementTree as ET
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'.local/python'))
from bs4 import BeautifulSoup
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')
out=ROOT/'output/r103-site';m=json.loads((ROOT/'output/r103-manifest.json').read_text('utf-8'))
sha=lambda b:hashlib.sha256(b).hexdigest()
errors=[];titles=[];descriptions=[];wordcounts={};products=0
protected=json.loads((ROOT/'output/r101-manifest.json').read_text('utf-8'))['protected']
for name,value in protected.items():
 if sha((out/name).read_bytes())!=value:errors.append('Protected candidate differs: '+name)
for route in m['routes']:
 file=out/route.strip('/')/'index.html' if route!='/' else out/'index.html'
 s=BeautifulSoup(file.read_text('utf-8'),'html.parser');canonical=s.select_one('link[rel="canonical"]')['href']
 assert len(s.select('h1'))==1,route
 if route in m['canonicalRoutes']:
  assert canonical=='https://xn--80aaan1dh9b.xn--p1ai'+route,route
  titles.append(s.title.get_text());descriptions.append(s.select_one('meta[name="description"]')['content'].strip())
 assert s.select_one('meta[name="robots"]')['content']=='noindex,nofollow',route
 assert s.select_one('form fieldset[disabled]'),route
 assert s.select_one('link[rel="icon"][type="image/x-icon"]'),route
 assert s.select_one('link[rel="apple-touch-icon"]'),route
 graph=json.loads(s.select_one('script[type="application/ld+json"]').string)['@graph']
 org=next(n for n in graph if n['@type']=='Organization')
 assert org['telephone']=='+79517349999'
 assert org['location']['address']['addressLocality']=='Вологда'
 assert 'streetAddress' not in org['location']['address']
 assert any(x['name']=='Санкт-Петербург' for x in org['areaServed'])
 for n in graph:
  if n['@type']=='Product':
   model={'kvadro':'kvadro','parus':'parus','viking':'viking','kvadro-haus':'kvadro-house'}[route.strip('/').split('/')[-1]]
   b=json.loads((out/'data/catalog-pricebook.json').read_text('utf-8'))
   prices=[v['priceRub'] for v in b['r85']['models'][model]['sizes'].values()]
   assert n['offers']['lowPrice']==min(prices) and n['offers']['highPrice']==max(prices)
   products+=1
 if route.startswith('/journal/') and route!='/journal/':
  article=next(n for n in graph if n['@type']=='Article');assert article['dateModified']=='2026-10-31'
  main=s.select_one('main');wordcounts[route]=len(main.get_text(' ',strip=True).split())
  assert main.select_one('img') and main.select_one('.reading-toc') and main.select_one('.reading-related')
  assert len(main.select('.reading-body h2'))>=5
 for node in s.select('[src],link[href],a[href]'):
  url=node.get('src') or node.get('href') or '';parts=urlsplit(url)
  if parts.scheme or parts.netloc or not parts.path:continue
  path=out/unquote(parts.path.lstrip('/')) if parts.path.startswith('/') else file.parent/unquote(parts.path)
  if not path.exists():errors.append(route+' broken '+url)
  if parts.fragment and path.exists():
   target=path/'index.html' if path.is_dir() else path
   if target.suffix=='.html' and not BeautifulSoup(target.read_text('utf-8'),'html.parser').find(id=parts.fragment):errors.append(route+' broken fragment '+url)
 images=[i.get('src') for i in s.select('main img')]
 if len(images)!=len(set(images)):errors.append(route+' repeated content image')
 for img in s.select('img'):
  if not img.get('alt'):errors.append(route+' missing image alt')
  assert img.get('width') and img.get('height'),route
 text=s.select_one('main').get_text(' ',strip=True)
 if re.search(r'\{\{|\b(?:API|JSON|CTA|backend|frontend|деплой|продакшен)\b|Делюкс|созданная ИИ|Атмосферная сцена',text,re.I):errors.append(route+' technical or obsolete copy')
 for title in s.select('h1,h2,h3'):
  if title.get_text(strip=True).endswith('.'):errors.append(route+' heading dot')
assert products==4
for values in [titles,descriptions]:assert max(Counter(values).values())==1,'Duplicate metadata'
assert len(m['routes'])==34 and len(m['canonicalRoutes'])==32
xml=ET.fromstring((out/'sitemap.xml').read_text('utf-8'))
assert {x.text for x in xml.findall('{*}url/{*}loc')}=={'https://xn--80aaan1dh9b.xn--p1ai'+r for r in m['canonicalRoutes']}
ico=Image.open(out/'favicon.ico');assert {(16,16),(32,32),(48,48)}<=ico.ico.sizes()
for size in [32,48,120,180,192]:assert Image.open(out/f'favicon-{size}.png').size==(size,size)
report={'routes':34,'canonicalPages':32,'articles':13,'regions':4,'products':4,'protectedFiles':len(protected),'articleWordsIncludingNavigation':wordcounts,'errors':errors}
(ROOT/'output/r103-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2));sys.exit(bool(errors))

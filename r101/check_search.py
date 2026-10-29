"""Audit search metadata, canonical URLs, sitemap and factual structured data."""
import sys,json,re
from pathlib import Path
from urllib.parse import urlsplit
from collections import Counter
from xml.etree import ElementTree
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'.local/python'))
from bs4 import BeautifulSoup
from seo import ORIGIN,canonical_path
sys.stdout.reconfigure(encoding='utf-8')
out=ROOT/'output/r101-site';manifest=json.loads((ROOT/'output/r101-manifest.json').read_text('utf-8'))
book=json.loads((out/'data/catalog-pricebook.json').read_text('utf-8'));errors=[];titles=[];descriptions=[];products=0;articles=0
for route in manifest['routes']:
 f=out/(route.strip('/')+'/index.html' if route!='/' else 'index.html');soup=BeautifulSoup(f.read_text('utf-8'),'html.parser')
 canonical=ORIGIN+canonical_path(route)
 try:
  assert soup.select_one('link[rel="canonical"]')['href']==canonical
  title=soup.title.get_text(' ',strip=True);description=soup.select_one('meta[name="description"]')['content'].strip()
  assert 10<=len(title)<=110,('title length',len(title))
  assert 45<=len(description)<=320,('description length',len(description))
  if route==canonical_path(route):titles.append(title);descriptions.append(description)
  assert soup.select_one('meta[property="og:url"]')['content']==canonical
  assert soup.select_one('meta[property="og:description"]')['content'].strip()==description
  og=soup.select_one('meta[property="og:image"]')['content'];assert og.startswith(ORIGIN+'/') and (out/urlsplit(og).path.lstrip('/')).is_file()
  data=json.loads(soup.select_one('script[type="application/ld+json"]').string);graph=data['@graph']
  org=next(n for n in graph if n['@type']=='Organization');assert org['telephone']=='+79517349999'
  assert org['location']['address']['addressLocality']=='Вологда' and 'streetAddress' not in org['location']['address']
  assert len(org['areaServed'])==5
  webpage=next(n for n in graph if n['@type']=='WebPage');assert webpage['url']==canonical
  if route!='/':assert any(n['@type']=='BreadcrumbList' for n in graph)
  if route.startswith('/journal/') and route!='/journal/':assert any(n['@type']=='Article' for n in graph);articles+=1
  for node in graph:
   if node['@type']=='Product':
    model={'kvadro':'kvadro','parus':'parus','viking':'viking','kvadro-haus':'kvadro-house'}[route.strip('/').split('/')[-1]]
    prices=[v['priceRub'] for v in book['r85']['models'][model]['sizes'].values()]
    assert node['offers']['lowPrice']==min(prices) and node['offers']['highPrice']==max(prices)
    assert node['offers']['priceCurrency']=='RUB';products+=1
 except Exception as e:errors.append({'route':route,'error':str(e)})
for label,values in [('title',titles),('description',descriptions)]:
 for value,count in Counter(values).items():
  if count>1:errors.append({'duplicate':label,'value':value})
xml=ElementTree.fromstring((out/'sitemap.xml').read_text('utf-8'));urls={n.text for n in xml.findall('{*}url/{*}loc')}
expected={ORIGIN+p for p in manifest['routes'] if canonical_path(p)==p}
if urls!=expected:errors.append({'sitemapMissing':sorted(expected-urls),'sitemapExtra':sorted(urls-expected)})
assert products==4 and articles==13
report={'routes':len(manifest['routes']),'indexableCanonicalPages':len(expected),'products':products,'articles':articles,'verifiedAreas':5,'errors':errors,'notVerified':['Search Console ownership and indexing','Yandex Webmaster regional setting','Real-device speed and touch behavior']}
(ROOT/'output/r101-search-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2));sys.exit(bool(errors))

"""Validate public routes, assets, structured prices and the immutable quote contract."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import json,re,hashlib
ROOT=Path(__file__).resolve().parents[1];WEB=ROOT/'web';errors=[]
class Page(HTMLParser):
 def __init__(self):super().__init__();self.refs=[];self.ids=[];self.scripts=[];self.json=False;self.buffer='';self.h1=0
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if a.get('id'):self.ids.append(a['id'])
  if tag=='h1':self.h1+=1
  if tag=='script' and a.get('type')=='application/ld+json':self.json=True;self.buffer=''
  for key in ['src','href','poster']:
   if key in a:self.refs.append(a[key])
  for v in a.get('srcset','').split(','):
   if v.strip():self.refs.append(v.strip().split()[0])
 def handle_data(self,data):
  if self.json:self.buffer+=data
 def handle_endtag(self,tag):
  if tag=='script' and self.json:self.scripts.append(json.loads(self.buffer));self.json=False
def target(value,parent):
 u=urlsplit(value)
 if u.scheme or u.netloc or not u.path or unquote(u.path).startswith('#'):return None
 p=(WEB/unquote(u.path.lstrip('/'))) if u.path.startswith('/') else (parent/unquote(u.path))
 p=p.resolve()
 if not p.is_relative_to(WEB.resolve()):return None
 if p.is_dir():p=p/'index.html'
 return p
pages={}
for p in WEB.rglob('*.html'):
 page=Page()
 try:page.feed(p.read_text('utf8'))
 except Exception as e:errors.append(f'{p.relative_to(WEB)}: HTML/JSON {e}');continue
 pages[p]=page
 if p.name!='manager.html' and page.h1!=1:errors.append(f'{p.relative_to(WEB)}: expected one H1, got {page.h1}')
 if len(page.ids)!=len(set(page.ids)):errors.append(f'{p.relative_to(WEB)}: duplicate IDs')
 for ref in page.refs:
  t=target(ref,p.parent)
  if t and not t.is_file():errors.append(f'{p.relative_to(WEB)}: missing {ref}')
for p in WEB.rglob('*'):
 if p.suffix not in ['.css','.mjs','.js']:continue
 s=p.read_text('utf8');refs=[]
 if p.suffix=='.css':refs+=re.findall(r'url\([\'\"]?([^\s)\'\";]+)',s)
 else:refs+=re.findall(r'(?:from|import)\s*[\'\"]([^\'\"]+)[\'\"]',s)
 for ref in refs:
  t=target(ref,p.parent)
  if t and not t.is_file():errors.append(f'{p.relative_to(WEB)}: missing dependency {ref}')
book=json.loads((WEB/'data/catalog-pricebook.json').read_text('utf8'))
def structured(x):
 if isinstance(x,dict):
  m=re.fullmatch(r'dp-(kvadro-house|kvadro|viking|parus)-(.+)',x.get('sku',''))
  if m and x.get('offers',{}).get('price')!=book['prices'][m[1]][m[2]]:errors.append('stale structured price: '+x['sku'])
  for v in x.values():structured(v)
 elif isinstance(x,list):
  for v in x:structured(v)
for page in pages.values():
 for value in page.scripts:structured(value)
plans=json.loads((WEB/'data/r94-layouts.json').read_text('utf8'))['plans']
assert len(plans)==39
for p in plans:
 for field in ['image','mirrorImage']:
  if not (WEB/p[field]).is_file():errors.append('Missing plan '+p[field])
for p in json.loads((WEB/'data/photo-references.json').read_text('utf8')):
 if not (WEB/p['image'].lstrip('/')).is_file():errors.append('Missing reference photo '+p['photoId'])
for name in ['quote.mjs','r85-pricing.mjs','data/catalog-pricebook.json','consent.html','privacy.html']:
 baseline=ROOT/'.local/r99-baseline-hashes.json'
 if baseline.is_file() and hashlib.sha256((WEB/name).read_bytes()).hexdigest()!=json.loads(baseline.read_text('utf8'))[name]:errors.append('Protected file changed: '+name)
home=pages[WEB/'index.html']
for id in ['model-switch','size-switch','contact-dialog','relay-lead-form','quote-total','save-variant','share-variant','r100-select-plan']:
 if id not in home.ids:errors.append('Missing calculator element '+id)
if errors:
 print('\n'.join(errors));raise SystemExit(1)
print(f'PASS: {len(pages)} HTML pages, linked assets/imports, 39 plans, 50 photo references, structured prices, protected calculator and legal sources.')

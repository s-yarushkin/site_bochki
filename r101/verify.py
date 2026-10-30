import sys,json,hashlib,re
from pathlib import Path
from urllib.parse import urlsplit,unquote
from collections import Counter
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'.local/python'))
from bs4 import BeautifulSoup
sys.stdout.reconfigure(encoding='utf-8')
out=root/'output/r101-site';manifest=json.loads((root/'output/r101-manifest.json').read_text('utf-8'));errors=[]
for name,sha in manifest['protected'].items():
 if hashlib.sha256((root/'web'/name).read_bytes()).hexdigest()!=sha:errors.append('Protected source changed: '+name)
upstream=json.loads((root/'r101/vendor/UPSTREAM.json').read_text('utf-8'))
for name,sha in upstream['sha256'].items():
 if hashlib.sha256((out/'r101/vendor'/name).read_bytes()).hexdigest()!=sha:errors.append('Engine modified: '+name)
for f in out.rglob('*.html'):
 if f.name in ['consent.html','privacy.html','requisites.html','manager.html']:continue
 soup=BeautifulSoup(f.read_text('utf-8'),'html.parser')
 if len(soup.select('h1'))!=1:errors.append(str(f)+' wrong h1')
 if 'делюкс' in soup.get_text().lower():errors.append(str(f)+' visible Deluxe')
 for phrase in ['JavaScript','API','JSON','CTA','backend','frontend','деплой','продакшен','эндпоинт']:
  if re.search(r'(?<!\w)'+re.escape(phrase)+r'(?!\w)',soup.get_text(' ',strip=True),re.I):errors.append(str(f.relative_to(out))+': developer language '+phrase)
 for phrase in ['созданная ИИ','создано ИИ','Атмосферная сцена','Рассчитать доставку','Расчёт доставки ↗','работы на участке — отдельно','работы на участке отдельно','рассчитываются отдельно','Доставка отдельно','Панорамное остекление и декоративную подсветку можно добавить к Комфорту']:
  if phrase.lower() in soup.get_text().lower():errors.append(str(f.relative_to(out))+': obsolete copy '+phrase)
 for heading in soup.select('h1,h2,h3,.ritual-note button'):
  if heading.get_text(strip=True).endswith('.'):errors.append(str(f.relative_to(out))+': heading full stop')
 if not soup.select_one('form[method="post"] fieldset[disabled]'):errors.append(str(f)+' no-JS form guard')
 if f.parent.name in ['kvadro','parus','viking','kvadro-haus'] and f.parent.parent.name=='bani':
  link=soup.select_one('.model-foot a')
  if not link or link.get('href')!='#plans':errors.append(str(f)+' model plan anchor must preserve selected size')
 for e in soup.select('[src],link[href],a[href]'):
  u=e.get('src') or e.get('href') or '';parts=urlsplit(u)
  if parts.scheme or parts.netloc or not parts.path:continue
  p=out/unquote(parts.path.lstrip('/')) if parts.path.startswith('/') else f.parent/unquote(parts.path)
  if not p.exists():errors.append(str(f.relative_to(out))+': broken '+u)
  if parts.fragment and p.exists():
   target=p/'index.html' if p.is_dir() else p
   if target.suffix=='.html' and not BeautifulSoup(target.read_text('utf-8'),'html.parser').find(id=parts.fragment):errors.append('Broken fragment '+u)
 for img in soup.select('img'):
  if not img.has_attr('alt'):errors.append('Missing image alt')
 image_ids=[re.sub(r'-(?:480|640|960|1280|1440|1600|1920)(?=\.)','',urlsplit(i.get('src','')).path) for i in soup.select('img[src]')]
 for src,count in Counter(image_ids).items():
  if count>1:errors.append(str(f.relative_to(out))+': repeated image '+src)
selected=json.loads((out/'r101/plans.json').read_text('utf-8'))
assert len(selected)==8 and all(n==2 for n in Counter(p['model'] for p in selected).values())
assert not {'p9','p11'}&{p['id'] for p in selected}
for plan in ['p9','p11']:
 for suffix in ['', '_mirror']:
  assert not (out/f'assets/plans/r93/{plan}{suffix}.webp').exists()
assert 'Время для себя' in (out/'index.html').read_text('utf-8')
home=BeautifulSoup((out/'index.html').read_text('utf-8'),'html.parser')
assert not home.select('.photo-note,.included-strip'), 'Remove duplicate strip and technical hero caption'
hero=home.select_one('.hero')
assert 'Производим бани в Вологде. Поможем выбрать вашу.' in hero.get_text(' ',strip=True)
assert 'Комфорт' not in hero.get_text() and not hero.select('.hero-price')
assert [a.get_text(' ',strip=True) for a in hero.select('.actions a')]==['Посмотреть бани ↗']
assert len(manifest['routes'])==len(set(manifest['routes']))
print(json.dumps({'routes':len(manifest['routes']),'plans':len(selected),'protected':len(manifest['protected']),'errors':errors},ensure_ascii=False,indent=2))
sys.exit(bool(errors))

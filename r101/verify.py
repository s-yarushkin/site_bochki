import sys,json,hashlib,re
from pathlib import Path
from urllib.parse import urlsplit,unquote
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'.local/python'))
from bs4 import BeautifulSoup
sys.stdout.reconfigure(encoding='utf-8')
out=root/'output/r101-site';manifest=json.loads((root/'output/r101-manifest.json').read_text('utf-8'));errors=[]
for name,sha in manifest['protected'].items():
 if hashlib.sha256((root/'web'/name).read_bytes()).hexdigest()!=sha:errors.append('Protected source changed: '+name)
for name in ['scrollcraft.js','scrollcraft.css']:
 if (out/'r101/vendor'/name).read_bytes()!=(root/'.local/scroll-craft-source/plugins/nateherk-design/skills/scroll-craft/engine'/name).read_bytes():errors.append('Engine modified: '+name)
for f in out.rglob('*.html'):
 if f.name in ['consent.html','privacy.html','requisites.html','manager.html']:continue
 soup=BeautifulSoup(f.read_text('utf-8'),'html.parser')
 if len(soup.select('h1'))!=1:errors.append(str(f)+' wrong h1')
 if 'делюкс' in soup.get_text().lower():errors.append(str(f)+' visible Deluxe')
 if not soup.select_one('form[method="post"] fieldset[disabled]'):errors.append(str(f)+' no-JS form guard')
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
selected=json.loads((out/'r101/plans.json').read_text('utf-8'))
assert not {'p9','p11'}&{p['id'] for p in selected}
for plan in ['p9','p11']:
 for suffix in ['', '_mirror']:
  assert not (out/f'assets/plans/r93/{plan}{suffix}.webp').exists()
assert 'Время для себя' in (out/'index.html').read_text('utf-8')
assert len(manifest['routes'])==len(set(manifest['routes']))
print(json.dumps({'routes':len(manifest['routes']),'plans':len(selected),'protected':len(manifest['protected']),'errors':errors},ensure_ascii=False,indent=2))
sys.exit(bool(errors))

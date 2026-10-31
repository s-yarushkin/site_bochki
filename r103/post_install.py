"""Read-only confirmation after the guarded installer has verified public file bytes."""
import json,importlib.util,hashlib,urllib.request,urllib.robotparser,xml.etree.ElementTree as ET
from pathlib import Path
base=Path('/tmp/dachapar-R103-SEO-9bf27b5c245d')
spec=importlib.util.spec_from_file_location('release',base/'r103-remote.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
m=json.loads((base/'manifest.json').read_text());web=mod.WEB.resolve(strict=True);api=mod.API.resolve(strict=True)
assert web.name==m['release']
assert str(api)==m['expectedApi']
assert mod.tree(web)==mod.final_files(m),'installed tree mismatch'
for name,value in m['protectedWeb'].items():assert mod.digest((web/name).read_bytes())==value,name
for route in m['routes']:
 f=web/route.strip('/')/'index.html' if route!='/' else web/'index.html'
 s=f.read_text()
 assert 'data-release="R103"' in s and 'noindex' not in s,route
assert 'noindex' in (web/'404.html').read_text()
robots=urllib.robotparser.RobotFileParser();robots.parse((web/'robots.txt').read_text().splitlines())
for bot in ['Googlebot','YandexBot']:
 for route in m['routes']:assert robots.can_fetch(bot,mod.ORIGIN+route),(bot,route)
urls=[e.text for e in ET.fromstring((web/'sitemap.xml').read_text()).findall('{*}url/{*}loc')]
assert len(urls)==32
icons={}
for name in ['favicon.ico','favicon.svg','favicon-48.png','favicon-180.png']:
 with urllib.request.urlopen(mod.ORIGIN+'/'+name+'?r103_verify=1',timeout=15) as response:
  assert response.status==200
  assert hashlib.sha256(response.read()).hexdigest()==mod.final_files(m)[name]
  kind=response.headers.get('Content-Type','');assert kind.startswith('image/'),kind
  icons[name]=kind
mod.health()
print(json.dumps({'release':m['release'],'postInstall':'PASS','marketingPages':len(m['routes']),'sitemapPages':len(urls),'protectedFiles':len(m['protectedWeb']),'apiUnchanged':True,'indexingEnabled':True,'faviconMime':icons,'health':'PASS','leadSubmitted':False},ensure_ascii=False))

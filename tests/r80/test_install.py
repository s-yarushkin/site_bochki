"""Synthetic release acceptance for R8.0: before/after diff, no API files, rollback."""
import tempfile,sys,shutil
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
import install
SRC=Path('/mnt/data/unified_release/merged_rc/payload')
PARUS=Path('/mnt/data/unified_release/parus/overlay/parus-media/content.mjs')
FIX='''<!doctype html><html lang="ru"><head><title>Модель</title></head><body><main><h1>Готовая баня</h1><p class="lead">Выбор модели</p><h2>Размеры и базовые цены</h2><div class="table-scroll"><table><tr><td>400 000</td></tr></table></div><h2>Состав базы</h2></main></body></html>'''

def setup(path):
 site=path/'site';source=site/'releases'/install.EXPECTED_WEB
 shutil.copytree(SRC,source)
 (source/'parus-media/content.mjs').parent.mkdir(parents=True,exist_ok=True);shutil.copy2(PARUS,source/'parus-media/content.mjs')
 for model in ('kvadro','viking','parus'):
  p=source/'bani'/model/'index.html';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(FIX)
 for name,text in [('quote.mjs','export {};'),('lead-client.mjs','export {};'),('manager.html','<html>manager</html>'),('robots.txt','User-agent: *\nAllow: /\n'),('sitemap.xml','<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://xn--80aaan1dh9b.xn--p1ai/</loc></url></urlset>')]:
  (source/name).write_text(text)
 api=path/'services'/'current-api';api.mkdir(parents=True)
 target=site/'current';target.symlink_to(source)
 link=path/'services'/'current';link.symlink_to(api)
 install.SITE=site;install.WEB=target;install.API=link
 return source,api

with tempfile.TemporaryDirectory() as folder:
 src,api=setup(Path(folder))
 before=install.inventory(src);print('R80_SYNTHETIC_SOURCE=READY')
 web,relay,actual=install.preflight();assert web==src and relay==api and before==actual
 print('R80_SYNTHETIC_PREFLIGHT=PASS')
 dest=install.stage();assert install.WEB.resolve()==src and install.API.resolve()==api
 after=install.inventory(dest)
 assert install.changes(before,after)==sorted(install.MODIFIED|install.CREATED)
 for path in before:
  if path not in install.MODIFIED:assert before[path]==after[path],path
 print('R80_SYNTHETIC_STAGE=PASS; MODIFIED='+str(len(install.MODIFIED))+'; NEW='+str(len(install.CREATED)))
 # failed public smoke must force rollback
 smoke=install.public_smoke
 def fail(*args):raise RuntimeError('SYNTHETIC_PUBLIC_HASH_FAILURE')
 install.public_smoke=fail
 try:install.activate(dest)
 except RuntimeError as e:assert str(e)=='SYNTHETIC_PUBLIC_HASH_FAILURE'
 else:raise AssertionError('Expected rollback')
 assert install.WEB.resolve()==src and install.API.resolve()==api
 print('R80_SYNTHETIC_AUTO_ROLLBACK=PASS')
 # now mock success without touching actual network
 install.public_smoke=lambda *args:None
 install.activate(dest)
 assert install.WEB.resolve()==dest and install.API.resolve()==api
 assert install.inventory(src)==before
 print('R80_SYNTHETIC_ACTIVATION=PASS; API_UNTOUCHED=YES; SRC_UNCHANGED=YES')
 install.public_smoke=smoke

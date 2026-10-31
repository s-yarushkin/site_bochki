"""Reuse R103's structural checks, then verify the R104 behavior and removed copy."""
from pathlib import Path
import sys,json,re,hashlib
ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'r103/verify.py').read_text('utf-8').replace('output/r103-site','output/r104-site').replace('output/r103-manifest.json','output/r104-manifest.json').replace('output/r103-verification.json','output/r104-verification.json')
try:exec(compile(source,str(Path(__file__)),'exec'),{'__file__':str(Path(__file__)),'__name__':'r104_structural_check'})
except SystemExit as result:
 if result.code:raise
sys.path.insert(0,str(ROOT/'.local/python'))
from bs4 import BeautifulSoup
out=ROOT/'output/r104-site';m=json.loads((ROOT/'output/r104-manifest.json').read_text('utf-8'))
for route in m['routes']:
 file=out/route.strip('/')/'index.html' if route!='/' else out/'index.html'
 s=BeautifulSoup(file.read_text('utf-8'),'html.parser');text=s.get_text(' ',strip=True)
 assert not re.search(r'сборк.{0,90}включ|включ.{0,90}сборк',text,re.I),route
 assert not any('Помогите' in b.get_text() for b in s.select('button')),route
 assert s.body['data-release']=='R104-CANDIDATE'
home=BeautifulSoup((out/'index.html').read_text('utf-8'),'html.parser')
assert home.select_one('[data-ritual-step="heat"] button').get_text()=='Камни набирают жар'
assert home.select_one('#breath button').get_text().replace('↗','').strip()=='Обсудить мою баню'
js=(out/'r101/site.mjs').read_text('utf-8')
for expected in ["source:button.closest('#breath')?'vision_block':'other'",'qualifyVision({source:context.source','qualifiedGoals.confirmed(result.receipt','qualifiedGoals.start(settings)','updateSelection(initial,!!pathModel)','remembered?.model===pathModel']:
 assert expected in js,expected
assert hashlib.sha256((out/'analytics-core.mjs').read_bytes()).digest()==hashlib.sha256((ROOT/'web/analytics-core.mjs').read_bytes()).digest()
assert not re.search(r'сборк.{0,90}включ|включ.{0,90}сборк',(out/'llms.txt').read_text('utf-8'),re.I)
print('R104 content, source-specific goals, model memory and core analytics: PASS')

"""Validate web copy, protected pricing and unchanged application modules."""
from pathlib import Path
import sys,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
src=(ROOT/'r103/verify.py').read_text('utf-8').replace('output/r103-site','output/r105-site').replace('output/r103-manifest.json','output/r105-manifest.json').replace('output/r103-verification.json','output/r105-verification.json')
try:exec(compile(src,__file__,'exec'),{'__file__':__file__,'__name__':'r105_structural'})
except SystemExit as e:
 if e.code:raise
sys.path.insert(0,str(ROOT/'.local/python'))
from bs4 import BeautifulSoup
out=ROOT/'output/r105-site'
for f in out.rglob('*.html'):
 s=f.read_text('utf-8')
 if 'data-release="R105-CANDIDATE"' not in s:continue
 for phrase in ['Центральный вход и ровный пол уже включены','Удобный центральный вход уже включён','Арочный центральный вход уже включён']:
  assert phrase not in s,(f,phrase)
kit=BeautifulSoup((out/'komplektaciya/index.html').read_text('utf-8'),'html.parser')
assert 'Планировки под ваш отдых' in kit.get_text(' ',strip=True)
for name in ['r101/site.mjs','r104/qualified-goals.mjs','analytics-core.mjs']:
 assert (out/name).read_bytes()==(ROOT/'output/r104-site'/name).read_bytes(),name
print('R105 buyer copy and unchanged application modules: PASS')

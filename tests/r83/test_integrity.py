#!/usr/bin/env python3
"""Offline copy editor tests; *not* substitute for browser testing on real server stage."""
from pathlib import Path
import tempfile,shutil,hashlib,json,subprocess,sys
from bs4 import BeautifulSoup
sys.path.insert(0,str(Path(__file__).parent))
from transform import run,EDITABLE
BASE=Path(__file__).parent/'base'

def snap(root):return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}

def test():
 with tempfile.TemporaryDirectory() as d:
  dest=Path(d)/'site';shutil.copytree(BASE,dest)
  before=snap(dest); report=run(dest)
  assert set(report['changed_files'])<=EDITABLE
  after=snap(dest)
  protected=['quote.mjs','lead-client.mjs','data/catalog-pricebook.json','analytics-runtime.mjs']
  for f in protected:assert before[f]==after[f], f
  assert report['changed_count']>=18
  for model in ['kvadro','parus','viking','kvadro-haus']:
   s=BeautifulSoup((dest/f'bani/{model}/index.html').read_text(),'html.parser')
   block=s.select_one('#comfort-included');assert block,model
   assert len(block.select('li'))==7
   assert 'Окна и двери выбранного варианта' not in block.get_text(' ',strip=True)
   assert 'Входная дверь и окно в комнате отдыха' in block.get_text(' ',strip=True)
   assert 'r83-comfort-openings' in str(block)
   assert len(s.select('a[href="#comfort-included"]'))>=1
   assert s.select_one('h1') and len(s.select('h1'))==1
   assert len({t['id'] for t in s.select('[id]')})==len(s.select('[id]'))
  faq=BeautifulSoup((dest/'voprosy/index.html').read_text(),'html.parser').get_text(' ',strip=True).replace('\u00a0',' ')
  for t in ('Что входит в комплектацию Комфорт','505 000 ₽','618 022 ₽','113 022 ₽','Делюкс отличается от Комфорта'):assert t in faq,t
  assert 'Для Квадро 5 м база стоит' not in faq
  assert 'Квадро 4 м' in faq and '60 × 60 см' in faq and 'Паруса 4 м' in faq and '60 × 80 см' in faq
  assert 'Окна и двери выбранного варианта' not in faq
  home=BeautifulSoup((dest/'index.html').read_text(),'html.parser');catalog=BeautifulSoup((dest/'bani/index.html').read_text(),'html.parser')
  assert len(home.select('.r83-model-preview'))==4
  assert len(catalog.select('.r83-catalog-kit'))==4
  text=(dest/'journal/iz-chego-skladyvaetsya-tsena/index.html').read_text()
  assert 'Баня в комплектации Делюкс' in text
  assert 'Баня в комплектации Комфорт' not in text
  sha_before=snap(dest)
  twice=run(dest)
  assert not twice['changed_files'],'not idempotent'
  assert sha_before==snap(dest),'second pass changed bytes'
  print('R83_OFFLINE_INTEGRITY=PASS; MODELS=4; MODEL_CARDS=8; ARTICLES=YES; P0_PRICES=PASS; IDEMPOTENT=YES; PROTECTED=UNCHANGED')
if __name__=='__main__':test()

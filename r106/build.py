"""Preview the improved quiz on the current R105 site, not the historical web/index."""
import sys,shutil,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.local/python'))
from bs4 import BeautifulSoup
BASE=ROOT/'output/r105-site';OUT=ROOT/'output/r106-site'
subprocess.run([sys.executable,str(ROOT/'r105/build.py')],check=True)
shutil.copytree(BASE,OUT,dirs_exist_ok=True)
for name in ['quiz.mjs','quiz.css','quiz-engine.mjs','data/quiz-v1.json','analytics-core.mjs']:
 shutil.copy2(ROOT/'web'/name,OUT/name)
s=BeautifulSoup((OUT/'index.html').read_text('utf-8'),'html.parser')
for node in s.select('script[src*="/quiz.mjs"],link[href*="/quiz.css"]'):node.decompose()
link=s.new_tag('link',rel='stylesheet',href='/quiz.css?v=r106');s.head.append(link)
script=s.new_tag('script',src='/quiz.mjs?v=r106',type='module');s.body.append(script)
entry=BeautifulSoup('''<div class="dp-quiz-entry" data-quiz-mount><div><span class="dp-quiz-entry-label">Начните со своих пожеланий</span><strong>Какая баня подойдёт вам?</strong><p>Ответьте на три вопроса. Сравните планировки и цены.</p></div><a class="dp-quiz-action" href="/compare/">Найти свою баню <span aria-hidden="true">↗</span></a></div>''','html.parser')
s.select_one('#models .section-heading').insert_after(entry)
help=s.select_one('#models .help-line')
if help:help.decompose()
s.body['data-release']='R106-PREVIEW'
(OUT/'index.html').write_text(str(s),encoding='utf-8')
print('R106 preview ready; production, prices and plan images unchanged')

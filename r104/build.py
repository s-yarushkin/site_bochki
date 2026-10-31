"""R104 overlay: contextual CTA, matching copy, two confirmed interest goals."""
import sys,json,re,shutil,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'.local/python'))
from bs4 import BeautifulSoup
sys.stdout.reconfigure(encoding='utf-8')
subprocess.run([sys.executable,str(ROOT/'r103/build.py')],check=True)
OUT=ROOT/'output/r104-site';shutil.copytree(ROOT/'output/r103-site',OUT,dirs_exist_ok=True)
(OUT/'r104').mkdir(exist_ok=True);shutil.copy2(Path(__file__).parent/'qualified-goals.mjs',OUT/'r104/qualified-goals.mjs')
assembly=re.compile(r'(?:(?:Для|У)\s+)?(?:Квадро\s+Хаус\s+)?[Сс]борка\s+(?:Квадро\s+Хаус\s+)?на\s+(?:вашем\s+)?участке\s+(?:(?:уже|тоже)\s+)?включена\s*(?:в\s+(?:его\s+)?цену(?:\s+модели)?)?\.?',re.I)
for f in OUT.rglob('*.html'):
 if f.name in ['manager.html','privacy.html','consent.html','requisites.html'] or f.name.startswith('yandex_'):continue
 s=BeautifulSoup(f.read_text('utf-8'),'html.parser')
 if not s.select_one('body[data-release]'):continue
 for text in list(s.find_all(string=assembly)):
  cleaned=assembly.sub('',str(text)).strip()
  if cleaned:text.replace_with(cleaned)
  elif text.parent.name in ['p','small']:text.parent.decompose()
  else:text.replace_with('')
 # Replace the empty House feature with its useful spatial benefit, without changing specifications.
 for scope in s.select('[data-model-card="kvadro-house"],.spec-list li'):
  for node in scope.select('p.muted,p.model-inclusion'):
   if not node.get_text(strip=True):node.decompose()
 for b in s.select('button[data-inquiry="selection_help"]'):
  if 'Помогите' in b.get_text():b.string='Подобрать мою баню'
 for row in s.select('tr'):
  if 'Квадро Хаус' in row.get_text():
   for cell in row.select('td'):
    if not cell.get_text(strip=True):cell.string='Больше места для отдельных помещений'
 for item in s.select('.spec-list li'):
  if 'Квадро Хаус' in item.get_text() and not item.find('p'):
   node=s.new_tag('p');node.string='Больше места для отдельных помещений и отдыха';item.append(node)
 for note in s.select('[data-ritual-step="heat"]'):
  note.select_one('button').string='Камни набирают жар'
  note.select_one('p').string='Печь прогревает камни. Ещё немного — и первая порция воды наполнит парную тёплым паром.'
 s.body['data-release']='R104-CANDIDATE'
 f.write_text(str(s),encoding='utf-8')
js=(OUT/'r101/site.mjs').read_text('utf-8')
def replace(old,new):
 global js
 assert old in js,old
 js=js.replace(old,new)
replace("import {mobileDialog} from './mobile-dialog.mjs';","import {mobileDialog} from './mobile-dialog.mjs';\nimport {qualifyVision,createQualifiedGoals} from '../r104/qualified-goals.mjs';\nconst qualifiedGoals=createQualifiedGoals(window);")
replace("button.textContent='Помогите выбрать ↗'","button.textContent='Подобрать мою баню ↗'")
replace("'Получить помощь с выбором бани'","'Подобрать баню для моей дачи'")
replace("context={purpose,pagePath:location.pathname,reference:ref,plan,selection:selected,placement:placement(button)};","context={purpose,pagePath:location.pathname,reference:ref,plan,selection:selected,placement:placement(button),source:button.closest('#breath')?'vision_block':'other'};")
replace("const values=Object.fromEntries(['name','phone','channel','settlement','comment'].map(n=>[n,getField(n).value]));","const values=Object.fromEntries(['name','phone','channel','settlement','comment'].map(n=>[n,getField(n).value]));\n const qualification=qualifyVision({source:context.source,comment:values.comment,settlement:values.settlement});")
replace("analytics?.confirmed(result.receipt,{flow:payload.flow,requestId:payload.requestId,purpose:context.purpose,model:context.selection?.model});","const baseCounted=analytics?.confirmed(result.receipt,{flow:payload.flow,requestId:payload.requestId,purpose:context.purpose,model:context.selection?.model});qualifiedGoals.confirmed(result.receipt,{flow:payload.flow,requestId:payload.requestId,qualification,baseCounted});")
replace('analytics?.start(settings);','analytics?.start(settings);qualifiedGoals.start(settings);')
replace('if(initial)updateSelection(initial,false);','if(initial)updateSelection(initial,!!pathModel);')
replace("let initial=pathModel?{model:pathModel,size:q.get('size')}","const remembered=storage.read();\n let initial=pathModel?{model:pathModel,size:q.get('size')||(remembered?.model===pathModel?remembered.size:null)}")
(OUT/'r101/site.mjs').write_text(js,encoding='utf-8')
# The same statement also existed in the machine-readable public business summary.
llms=(ROOT/'output/R103-SEO-9bf27b5c245d/manifest.json')
if not (OUT/'llms.txt').exists():
 (OUT/'llms.txt').write_text('# ДачаПар\n\nГотовые бани: Квадро, Парус, Викинг, Квадро Хаус.\nЦены и модели: https://xn--80aaan1dh9b.xn--p1ai/bani/\nКомплектация: https://xn--80aaan1dh9b.xn--p1ai/komplektaciya/\nГеография доставки: https://xn--80aaan1dh9b.xn--p1ai/regiony/\nПроизводство — Вологда. Телефон +7 (951) 734-99-99.\nСостав заказа, доставка и порядок установки согласуются индивидуально.\n',encoding='utf-8')
else:(OUT/'llms.txt').write_text(assembly.sub('',(OUT/'llms.txt').read_text('utf-8')),encoding='utf-8')
m=json.loads((ROOT/'output/r103-manifest.json').read_text('utf-8'));m.update(release='R104-CANDIDATE',qualifiedGoals=['dp_vision_bedroom_confirmed','dp_vision_location_confirmed'])
(ROOT/'output/r104-manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
print('R104 candidate built; prices and core analytics unchanged')

"""Preserve the current public lower home and its real motion implementation."""
from pathlib import Path
import hashlib,json,re,shutil
HERE=Path(__file__).resolve().parent

COMFORT_COPY={
 'Париться, отдыхать, собираться за чаем. Печь, полки, мебель и электрика уже предусмотрены в Комфорте.':'В комплектации «Комфорт» уже есть всё для банного вечера: печь, полки, мебель, свет и вентиляция. Можно париться, отдыхать и собираться за чаем.',
 'Печь с дымоходом и защитным ограждением. Верхний полок и выдвижной нижний, стеклянная дверь в парную.':'Печь с камнями и дымоходом, защитное ограждение. Верхний и выдвижной нижний полки, стеклянная дверь в парную.',
 'Освещение с двумя абажурами, проводка, выключатели, электрощиток и дополнительная розетка. Увеличенное окно в комнате отдыха, форточка в парной.':'Освещение с двумя абажурами, проводка, выключатели, электрощиток и дополнительная розетка. Окно ПВХ в комнате отдыха.',
 'Вентиляция для проветривания и просушки бани. Входная дверь ПВХ.':'Вентиляция и форточка в парной для проветривания и просушки. Входная дверь ПВХ.'
}

def compose(page,out):
 baseline=HERE/'baseline-v5';meta=json.loads((baseline/'metadata.json').read_text('utf8'))
 for row in meta['files']:
  path=baseline/row['path'];assert hashlib.sha256(path.read_bytes()).hexdigest()==row['sha256'],row['path']
  if row['path'] not in ['index.html','r101/site.mjs','quiz.mjs','quiz.css']:
   target=out/row['path'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
 source=(baseline/'index.html').read_text('utf8');start=source.index('<section class="ritual"');end=source.index('</main>')
 lower=source[start:end]
 for old,new in COMFORT_COPY.items():assert lower.count(old)==1;lower=lower.replace(old,new)
 care=(HERE/'care.html').read_text('utf8').strip();closing='<section class="closing section" id="contact">';assert lower.count(closing)==1
 lower=lower.replace(closing,care+'\n'+closing)
 footer=source[source.index('</main>')+len('</main>'):source.index('<dialog')]
 extras=source[source.index('<dialog'):source.index('<script defer')]
 extras=extras.replace('Тестовый просмотр · Заявка останется на этом компьютере','')
 intro='<p class="eyebrow">Ваша будущая баня</p>'
 assert extras.count(intro)==1
 extras=extras.replace(intro,(HERE/'inquiry-success.html').read_text('utf8')+'<div data-inquiry-entry>'+intro)
 extras=extras.replace('</div></dialog>','</div></div></dialog>',1)
 page=page.replace('{{home-continuation}}',lower).replace('{{home-footer}}',footer+extras)
 page=page.replace('</head>','<link rel="stylesheet" href="/choice/inquiry-success.css?v=20261105"></head>')
 # Copy the public motion fragment literally, preserving ritual, depth and reveal behaviour.
 script=(baseline/'r101/site.mjs').read_text('utf8');motion=script[script.index('// A native scrolling page:'):script.index('try{\n [book,settings,photos,plans]')]
 (out/'choice/continuation-motion.mjs').write_text("const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];\n"+motion,'utf8')
 protected=[]
 for original in re.findall(r'<section\b.*?</section>',source[start:end],re.S):
  name=re.search(r'id="([^"]+)"',original.split('>')[0]);key=name[1] if name else 'faq'
  expected=original
  if key=='comfort':
   for old,new in COMFORT_COPY.items():expected=expected.replace(old,new)
  assert expected in page,('Protected section changed',key)
  protected.append({'section':key,'unchanged':key!='comfort','sourceSha256':hashlib.sha256(original.encode()).hexdigest(),'resultSha256':hashlib.sha256(expected.encode()).hexdigest()})
 report={'pass':True,'sourceDate':meta['capturedDate'],'sourceHomeSha256':meta['files'][0]['sha256'],'sections':protected,'carePosition':'after FAQ, immediately before closing','originalMotionSha256':hashlib.sha256(motion.encode()).hexdigest(),'heroHasVologda':False}
 assert 'Вологд' not in re.search(r'<section class="hero.*?</section>',page,re.S)[0]
 (HERE/'home-preservation-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
 return page

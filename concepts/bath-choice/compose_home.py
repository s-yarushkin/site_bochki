"""Preserve the current public lower home and its real motion implementation."""
from pathlib import Path
import hashlib,json,re,shutil
HERE=Path(__file__).resolve().parent

INDIVIDUAL_LINK='<a class="textlink" href="/planirovki/">Посмотреть примеры планировок →</a>'

PACKAGE_PATH_COPY={
 '<a class="textlink" href="/komplektaciya/">Вся комплектация →</a>': '<p class="muted">В «Делюкс» дополнительно предусмотрены печь с двумя каменками, подсветка полков, утепление пола и уличный свет.</p><button type="button" class="choice-text-button" data-compare-details aria-haspopup="dialog">Сравнить «Комфорт» и «Делюкс» <span aria-hidden="true">↗</span></button>',
 'В дополнение к комплектации «Комфорт»': 'Дополнения к любой комплектации',
 'У каждой семьи свой банный вечер. Подстроим пространство под ваши привычки.': 'Если нужно больше возможностей, дополним комплектацию и подстроим баню под ваши привычки.',
}

COMFORT_SECTION=re.compile(r'<section class="quiet section" id="comfort">.*?</section>',re.S)
INQUIRY_COPY={
 '<div class="selection-summary" data-closing-choice="" hidden=""></div>':'',
 '<div class="selection-summary" id="inquiry-summary"></div>':'',
 '<p class="dialog-intro">Поможем продумать вашу баню и подготовим предложение с выбранным оснащением и доставкой.</p>':'<p class="dialog-intro" data-inquiry-intro>Расскажите, чем помочь. Менеджер свяжется с вами удобным способом.</p>',
 '<small>Ваш выбор</small><strong id="resume-title"></strong>':'<strong>Есть вопросы?</strong>',
 'aria-label="Скрыть выбранный вариант"':'aria-label="Скрыть кнопку заявки"',
}
PACKAGE_CSS='<link rel="stylesheet" href="/choice/packages.css?v=20261106">'

def compose(page,out):
 baseline=HERE/'baseline-v5';meta=json.loads((baseline/'metadata.json').read_text('utf8'))
 for row in meta['files']:
  path=baseline/row['path'];assert hashlib.sha256(path.read_bytes()).hexdigest()==row['sha256'],row['path']
  if row['path'] not in ['index.html','r101/site.mjs','quiz.mjs','quiz.css']:
   target=out/row['path'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
 source=(baseline/'index.html').read_text('utf8');start=source.index('<section class="ritual"');end=source.index('</main>')
 lower=source[start:end]
 for old,new in PACKAGE_PATH_COPY.items():assert lower.count(old)==1;lower=lower.replace(old,new)
 packages=(HERE/'packages.html').read_text('utf8').strip()
 lower,count=COMFORT_SECTION.subn(lambda _:packages,lower);assert count==1
 assert lower.count(INDIVIDUAL_LINK)==1
 lower=lower.replace(INDIVIDUAL_LINK,'')
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
 for old,new in INQUIRY_COPY.items():assert page.count(old)==1;page=page.replace(old,new)
 page=page.replace('</head>','<script type="module" src="/site-entries.mjs?v=entries-20261107"></script><link rel="stylesheet" href="/choice/inquiry-success.css?v=20261105"><link rel="stylesheet" href="/choice/care.css?v=20261106">'+PACKAGE_CSS+'</head>')
 # Copy the public motion fragment literally, preserving ritual, depth and reveal behaviour.
 script=(baseline/'r101/site.mjs').read_text('utf8');motion=script[script.index('// A native scrolling page:'):script.index('try{\n [book,settings,photos,plans]')]
 (out/'choice/continuation-motion.mjs').write_text("const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];\n"+motion,'utf8')
 protected=[]
 for original in re.findall(r'<section\b.*?</section>',source[start:end],re.S):
  name=re.search(r'id="([^"]+)"',original.split('>')[0]);key=name[1] if name else 'faq'
  expected=original
  if key=='comfort':expected=packages
  if key=='contact':
   for old,new in INQUIRY_COPY.items():expected=expected.replace(old,new)
  if key=='individual':expected=expected.replace(INDIVIDUAL_LINK,'')
  for old,new in PACKAGE_PATH_COPY.items():expected=expected.replace(old,new)
  assert expected in page,('Protected section changed',key)
  protected.append({'section':key,'unchanged':expected==original,'sourceSha256':hashlib.sha256(original.encode()).hexdigest(),'resultSha256':hashlib.sha256(expected.encode()).hexdigest()})
 report={'pass':True,'sourceDate':meta['capturedDate'],'sourceHomeSha256':meta['files'][0]['sha256'],'sections':protected,'carePosition':'after FAQ, immediately before closing','originalMotionSha256':hashlib.sha256(motion.encode()).hexdigest(),'heroHasVologda':False}
 assert 'Вологд' not in re.search(r'<section class="hero.*?</section>',page,re.S)[0]
 (HERE/'home-preservation-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
 return page

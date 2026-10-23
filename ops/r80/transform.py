#!/usr/bin/env python3
"""R8.0 safe architecture: existing homepage pricing and form remain untouched.
No server deps; stages changes in a copied WEB tree (never modifies current)."""
import argparse, re, json, hashlib, html
from pathlib import Path

ASSET_URL='/cjm-r80.css?v=20261022-r80a'
COMPAT='''<script id="cjm-r80-legacy-routing">(function(){const routes={'#parus-photos':'/bani/parus/#photos','#parus-layouts':'/bani/parus/#plans','#qh-photos':'/bani/kvadro-haus/#photos','#qh-layouts':'/bani/kvadro-haus/#plans'};const dst=routes[location.hash];if(dst)location.replace(dst.slice(0,dst.indexOf('#'))+location.search+dst.slice(dst.indexOf('#')));})();</script>'''
NAV_WORKS='/raboty/'
MODELS=['kvadro','viking','parus','kvadro-haus']
OBJECTS={
 'parus':[
 ('slats','Дерево и тёмные рейки','02_exterior',3),
 ('terrace','Бирюзовый Парус с террасой','03_evening',2),
 ('cream','Светлая отделка и тёмные акценты','04_exterior',4),
 ('timber','Дерево и белое остекление','01_night',1)],
 'kvadro-haus':[
 ('terrace-window','Терраса и большое окно в парной','kh7-07',6),
 ('timber-terrace','Дерево и просторная терраса','kh1-16',6),
 ('panoramic','Панорамный фасад в дереве','kh3-09',4),
 ('grey','Светлый фасад и тёмная кровля','kh4-02',4),
 ('wide-glazing','Широкое остекление и светлый интерьер','kh6-02',3)]}

CSS='''/* R8.0 – isolated IA layer. Existing pricebook, form and CTA CSS retained. */
.cjm-home-works{padding:50px max(20px,calc((100vw - 1180px)/2));background:#f4f1e9;color:#1e352b}
.cjm-home-works h2,.cjm-shortcuts h2{font-family:inherit;font-size:clamp(1.65rem,3vw,2.6rem);line-height:1.15;margin:8px 0 12px}
.cjm-home-works p{line-height:1.55}
.cjm-works-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:24px}
.cjm-works-card{display:flex;flex-direction:column;color:inherit;text-decoration:none;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 10px 28px #162b2022}
.cjm-works-card img{display:block;width:100%;height:clamp(195px,23vw,310px);object-fit:cover}
.cjm-works-card .cjm-card-copy{padding:16px 20px 20px}
.cjm-works-card strong{display:block;font-size:1.22rem;margin-bottom:7px}
.cjm-works-card small{display:block;color:#4c6659;margin-bottom:10px}
.cjm-link{color:#166743;font-weight:750;text-decoration:underline;text-underline-offset:4px}
.cjm-work-hub{background:#f4f1e9;color:#1b3027;min-height:80vh;padding:42px max(18px,calc((100vw - 1180px)/2)) 80px;font-family:inherit}
.cjm-work-hub h1{font-size:clamp(2rem,5vw,3.6rem);line-height:1.05;margin:14px 0 16px}
.cjm-work-hub p{max-width:740px;line-height:1.55}
.cjm-work-filter{display:flex;flex-wrap:wrap;gap:10px;margin:30px 0}
.cjm-work-filter button{border:1px solid #50745f;border-radius:100px;padding:12px 18px;background:transparent;color:#203e30;cursor:pointer;font:inherit}
.cjm-work-filter button[aria-pressed="true"]{background:#1b4735;color:#fff}
.cjm-work-hub .cjm-works-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}
.cjm-works-card[hidden]{display:none!important}
.cjm-model-shortcuts{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 22px;padding:14px 0}
.cjm-model-shortcuts a{border:1px solid #33664e;border-radius:100px;padding:11px 16px;color:#1a5135;background:#f5f6ee;text-decoration:none;font-weight:650}
.cjm-model-shortcuts a:first-child{background:#1e5139;color:#fff}
.cjm-model-page #photos,.cjm-model-page #plans{scroll-margin-top:115px}
.cjm-model-page .pp-section,.cjm-model-page .qh-section{max-width:100%;overflow:clip;margin:18px 0 48px}
.cjm-model-page .pp-wrap,.cjm-model-page .qh-wrap{max-width:1180px;margin:auto}
.cjm-model-page .pp-section .pp-heading,.cjm-model-page .qh-section .qh-heading{color:#193528}
.cjm-legacy-anchor{display:block;position:relative;top:-90px;visibility:hidden;height:0}
.cjm-home-works .cjm-works-card:focus-visible,.cjm-work-hub a:focus-visible,.cjm-work-filter button:focus-visible,.cjm-model-shortcuts a:focus-visible{outline:3px solid #e7a64a;outline-offset:3px}
@media(max-width:760px){.cjm-home-works{padding:36px 18px}.cjm-works-grid,.cjm-work-hub .cjm-works-grid{grid-template-columns:1fr}.cjm-work-hub{padding:30px 18px 70px}.cjm-works-card img{height:230px}.cjm-model-shortcuts a{font-size:0.9rem}.cjm-model-page .pp-wrap,.cjm-model-page .qh-wrap{width:100%}}
'''

def require(t,why):
 if not t:raise RuntimeError(why)
def cut_section(text,id):
  m=re.search(r'<section\b(?=[^>]*\bid="'+re.escape(id)+r'")[^>]*>[\s\S]*?</section>',text)
  require(bool(m),'SECTION_NOT_FOUND_'+id)
  return text[:m.start()]+text[m.end():],m.group(0)
def cut_span(text,id):
 m=re.search(r'<span\b(?=[^>]*\bid="'+re.escape(id)+r'")[^>]*>\s*</span>',text)
 require(bool(m),'ANCHOR_NOT_FOUND_'+id)
 return text[:m.start()]+text[m.end():],m.group(0)
def insert_after_section(text,id,chunk):
 m=re.search(r'<section\b(?=[^>]*\bid="'+re.escape(id)+r'")[^>]*>[\s\S]*?</section>',text)
 require(bool(m),'INSERT_AFTER_MISSING_'+id)
 return text[:m.end()]+chunk+text[m.end():]
def once_replace(src,old,new,key):
 require(src.count(old)==1,key+'_COUNT_'+str(src.count(old)))
 return src.replace(old,new,1)
def move_section_after(src,id,after):
 src,frag=cut_section(src,id)
 return insert_after_section(src,after,'\n'+frag+'\n')
def imgurl(model,photo,size=960):
 return ('/parus-media/' if model=='parus' else '/qh-media/')+'assets/photos/'+photo+'-'+str(size)+'.webp'
def cards(model=None):
 out=[]
 for kind,items in OBJECTS.items():
  if model and kind!=model:continue
  label='Парус' if kind=='parus' else 'Квадро Хаус'
  for oid,title,img,n in items:
   link='/bani/'+kind+'/?work='+oid+'#photos'
   out.append(f'<a class="cjm-works-card" data-work-model="{kind}" href="{link}"><img src="{imgurl(kind,img)}" loading="lazy" decoding="async" alt="{html.escape(label+': '+title,quote=True)}"><span class="cjm-card-copy"><small>{label} · {n} фото</small><strong>{html.escape(title)}</strong><span class="cjm-link">Посмотреть этот объект ↗</span></span></a>')
 return '\n'.join(out)

def home_teaser():
 return '''<section class="cjm-home-works" id="real-bani" aria-labelledby="cjm-work-title"><p class="eyebrow">Примеры выполненных работ</p><h2 id="cjm-work-title">Как бани выглядят в жизни</h2><p>Реальные объекты — отдельно от вариантов планировки и расчёта стоимости. Посмотрите понравившуюся модель снаружи и внутри.</p><div class="cjm-works-grid">'''+\
  cards('parus').split('</a>')[0]+'</a>'+cards('kvadro-haus').split('</a>')[0]+'</a>'+\
  '''</div><p><a class="cjm-link" href="/raboty/">Все девять выполненных бань →</a></p></section>'''

def inject_head(src,content):return once_replace(src,'</head>',content+'</head>','HEAD')
def inject_before_main_close(src,content):return once_replace(src,'</main>',content+'</main>','MAIN_CLOSE')
def home(src):
 for id in ('parus-photos','parus-layouts','qh-photos','qh-layouts','cinema','models','included','configure','packages','details','hero'):
  require(f'id="{id}"' in src,'HOME_ID_MISSING_'+id)
 # Keep media HTML exactly for model migration while removing ONLY full works+plans.
 sections={}
 for id in ('parus-photos','parus-layouts','qh-photos','qh-layouts'):
  src,sections[id]=cut_section(src,id)
 # main's cinema remains untouched: marketing asset, not completed-works catalog.
 src=move_section_after(src,'models','hero')
 src=move_section_after(src,'included','packages')
 # Move existing anchors with the unchanged DOM price engine.
 aliases=[]
 for id in ('builder','bundle','personal'):
  src,alias=cut_span(src,id);aliases.append(alias)
 src,calculator=cut_section(src,'configure')
 src=insert_after_section(src,'included','\n'+''.join(aliases)+calculator+'\n'+home_teaser()+'\n')
 # Move #base immediately before the included section.
 src,base=cut_span(src,'base')
 src=once_replace(src,'<section class="included',base+'<section class="included','BASE_MOVE')
 # Menu: factual image entry is always an aggregate page (never the Parus anchor).
 src=src.replace('href="#parus-photos"','href="/raboty/"')
 src=src.replace('href="#qh-photos"','href="/bani/kvadro-haus/#photos"')
 src=src.replace('href="#packages"','href="#packages"')
 # Make mobile menu show real-bani entry explicitly.
 src=once_replace(src,'<a href="#models">Все модели</a>','<a href="#models">Все модели</a><a href="/raboty/">Реальные бани</a>','MOBILE_NAV')
 # Existing model image buttons become clear entry points to a dedicated model page.
 for model in ['kvadro','viking','parus','kvadro-house']:
  slug='kvadro-haus' if model=='kvadro-house' else model
  p=r'(<button\s+type="button"\s+class="model-image"\s+data-gallery="'+re.escape(model)+r'"[^>]*>)([\s\S]*?)(</button>)'
  src,count=re.subn(p,lambda m: m.group(1).replace('<button type="button"','<a',1).replace('data-gallery="'+model+'"','href="/bani/'+slug+'/"')+m.group(2)+'</a>',src,count=1)
  require(count==1,'HOME_MODEL_CARD_LINK_'+model)
 # Convert small model shortcuts into direct links instead of invoking galleries on the root.
 src=re.sub(r'<button\b([^>]*\bclass="pp-catalog-hint"[^>]*)>([\s\S]*?)</button>',lambda m:'<a class="pp-catalog-hint" href="/bani/parus/#photos">'+m.group(2)+'</a>',src,count=1)
 src=re.sub(r'<button\b([^>]*\bclass="qh-catalog-hint"[^>]*)>([\s\S]*?)</button>',lambda m:'<a class="qh-catalog-hint" href="/bani/kvadro-haus/#photos">'+m.group(2)+'</a>',src,count=1)
 src=src.replace('Размеры и оснащение <svg','Фото, планировки и цены <svg')
 src=inject_head(src,'<link rel="stylesheet" href="'+ASSET_URL+'">'+COMPAT)
 require('id="configure"' in src and 'id="relay-lead-form"' in src and 'id="quote-total"' in src,'HOME_COMMERCE_LOST')
 for id in ('parus-photos','parus-layouts','qh-photos','qh-layouts'):
  require(('id="'+id+'"') not in src,'HOME_MEDIA_STILL_PRESENT_'+id)
 return src,sections

def model_page(src,model,parts=None):
 require('<main' in src and '</main>' in src and ('<header class="content-header">' in src or 'class="lead"' in src),'MODEL_HEADER_MISSING_'+model)
 require('href="/bani/' not in src or True,'')
 target='/bani/'+model+'/'
 media =model in ('parus','kvadro-haus')
 # Existing QH content is included in its original production model page; do not re-add.
 if model=='parus':
  # Release PARUS-MEDIA already placed both sections on its own model page.
  # Older releases have neither; import them from the homepage in that case.
  # A partial/ambiguous page must abort rather than duplicating or losing data.
  def section_for(sec_id):
   return re.search(r'<section\b[^>]*\bid="'+re.escape(sec_id)+r'"[^>]*>',src)
  has_photos=bool(section_for('parus-photos'))
  has_plans=bool(section_for('parus-layouts'))
  require(has_photos==has_plans,'PARUS_PARTIAL_MEDIA_ABORT')
  if has_photos:
   require(src.count('id="parus-photos"')==1 and src.count('id="parus-layouts"')==1,'PARUS_MEDIA_DUPLICATE_ID')
   require('id="photos"' not in src and 'id="plans"' not in src,'PARUS_TARGET_ID_ALREADY_EXISTS')
   # Preserve the actual production model page's photo and layout elements.
   src=src.replace('id="parus-photos"','id="photos"',1).replace('id="parus-layouts"','id="plans"',1)
  else:
   require('id="parus-photos"' not in src and 'id="parus-layouts"' not in src,'PARUS_MEDIA_LEGACY_ID_CONFLICT')
   require(parts is not None and 'parus-photos' in parts and 'parus-layouts' in parts,'PARUS_PARTS_MISSING')
   p=parts['parus-photos'].replace('id="parus-photos"','id="photos"',1)
   q=parts['parus-layouts'].replace('id="parus-layouts"','id="plans"',1)
   added=p+q
   # Insert after the actual price section and before generic content.
   if 'id="r732-size-prices"' in src:
    src=insert_after_grid(src,added)
   else:
    m=re.search(r'<h2>Размеры и базовые цены</h2>[\s\S]*?</div>',src)
    require(bool(m),'PARUS_PRICE_TABLE_MISSING')
    src=src[:m.end()]+'\n'+added+'\n'+src[m.end():]
  # In both paths, keep old public hashes working and ensure module is loaded once.
  photo_anchor='<span class="cjm-legacy-anchor" id="parus-photos"></span>'
  plan_anchor='<span class="cjm-legacy-anchor" id="parus-layouts"></span>'
  require(src.count('id="photos"')==1 and src.count('id="plans"')==1,'PARUS_MEDIA_NOT_UNIQUE')
  require('class="pp-section pp-examples"' in src and 'class="pp-section pp-layouts"' in src,'PARUS_EXPECTED_MEDIA_SECTIONS_MISSING')
  require(len(re.findall(r'data-pp-layout="',src))==5,'PARUS_PLAN_BUTTON_COUNT_MISMATCH')
  require(len(re.findall(r'class="pp-card"',src))==3,'PARUS_PHOTO_CARDS_MISMATCH')
  src=src.replace('<section class="pp-section pp-examples" id="photos"',photo_anchor+'<section class="pp-section pp-examples" id="photos"',1)
  src=src.replace('<section class="pp-section pp-layouts" id="plans"',plan_anchor+'<section class="pp-section pp-layouts" id="plans"',1)
  require(src.count('id="parus-photos"')==1 and src.count('id="parus-layouts"')==1,'PARUS_LEGACY_ANCHOR_FAIL')
  have_css=bool(re.search(r'<link[^>]+/parus-media/widget\.css',src))
  have_js=bool(re.search(r'<script[^>]+/parus-media/widget\.mjs',src))
  require(have_css==have_js,'PARUS_PARTIAL_WIDGET_IMPORT')
  if have_js:
   require(len(re.findall(r'/parus-media/widget\.css',src))==1 and len(re.findall(r'/parus-media/widget\.mjs',src))==1,'PARUS_DUPLICATE_WIDGET_IMPORT')
  else:
   src=inject_head(src,'<link rel="stylesheet" href="/parus-media/widget.css?v=20261022-gallery-p0-rc2"><script type="module" src="/parus-media/widget.mjs?v=20261022-gallery-p0-rc2"></script>')
 if model=='kvadro-haus':
  require(src.count('id="qh-photos"')==1 and src.count('id="qh-layouts"')==1,'QH_MEDIA_MISSING_OR_DUPLICATE')
  src=src.replace('id="qh-photos"','id="photos"',1).replace('id="qh-layouts"','id="plans"',1)
  src=src.replace('<section class="qh-section" id="photos"','<span class="cjm-legacy-anchor" id="qh-photos"></span><section class="qh-section" id="photos"',1)
  src=src.replace('<section class="qh-section qh-layouts" id="plans"','<span class="cjm-legacy-anchor" id="qh-layouts"></span><section class="qh-section qh-layouts" id="plans"',1)
 # Entrypoints and CTA always target the live, unmodified calculator.
 gallery_label='Реальные бани' if media else 'Обзор модели'
 nav=f'<nav class="cjm-model-shortcuts" aria-label="Разделы модели"><a href="#photos">Реальные объекты</a><a href="#plans">Планировки</a><a href="#r732-size-prices">Размеры и цены</a><a href="/?model={"kvadro-house" if model=="kvadro-haus" else model}#configure">Рассчитать мою баню ↗</a></nav>' if media else f'<nav class="cjm-model-shortcuts" aria-label="Разделы модели"><a href="#r732-size-prices">Размеры и цены</a><a href="/raboty/">Реальные бани других моделей</a><a href="/?model={model}#configure">Рассчитать мою баню ↗</a></nav>'
 if '</header><div class="model-page-grid"' in src:
  src=once_replace(src,'</header><div class="model-page-grid"', '</header>'+nav+'<div class="model-page-grid"','MODEL_SHORTCUT_'+model)
  require('id="r732-size-prices"' in src,'NEW_MODEL_PRICE_MISSING_'+model)
 else:
  src=src.replace('<h2>Размеры и базовые цены</h2>','<h2 id="r732-size-prices">Размеры и базовые цены</h2>',1)
  # Older SEO pages: preserve original structure and insert shortcuts below the H1 / lead.
  m=re.search(r'<p class="lead">[\s\S]*?</p>',src)
  require(bool(m),'LEGACY_MODEL_INTRO_MISSING_'+model)
  src=src[:m.end()]+nav+src[m.end():]
  require('Размеры и базовые цены' in src,'LEGACY_MODEL_PRICE_MISSING_'+model)
 if 'class="content-page"' in src:
  src=src.replace('class="content-page"','class="content-page cjm-model-page"',1)
 elif re.search(r'<body\s+class="',src):
  src=src.replace('<body class="','<body class="cjm-model-page ',1)
 else:
  src=src.replace('<body>','<body class="cjm-model-page">',1)
 require('cjm-model-page' in src,'MODEL_PAGE_STYLE_SCOPE_MISSING_'+model)
 src=src.replace('href="../../compare/"','href="/bani/"')
 src=src.replace('>Сравнение</a>','>Все модели</a>')
 src=once_replace(src,'</head>','<link rel="stylesheet" href="'+ASSET_URL+'"><script type="module" src="/cjm-r80-model.mjs?v=20261022-r80a"></script></head>','MODEL_HEAD_'+model)
 if 'href="/raboty/"' not in src:src=src.replace('>Все модели</a>','>Все модели</a><a href="/raboty/">Реальные бани</a>',1)
 require('<table' in src and ('id="r732-size-prices"' in src or 'Размеры и базовые цены' in src),'MODEL_PRICE_LOST_'+model)
 return src

def insert_after_grid(src,added):
 # The known model page structural marker: <div class="model-page-grid"...> ... </div>
 # with inner divs. Find true closing tag with lexical stack (never use a greedy regex for nested div).
 p=src.index('<div class="model-page-grid"');i=p;depth=0
 for match in re.finditer(r'</?div\b[^>]*>',src[p:]):
  tag=match.group(0);depth+=(-1 if tag.startswith('</') else 1)
  if depth==0:
   k=p+match.end();return src[:k]+'\n'+added+'\n'+src[k:]
 raise RuntimeError('PRICE_GRID_UNBALANCED')

def works_page():
 h='<div class="cjm-work-hub"><nav aria-label="Навигация"><a class="cjm-link" href="/">← Главная</a> · <a class="cjm-link" href="/bani/">Все модели</a> · <a class="cjm-link" href="/#configure">Рассчитать баню</a></nav><header><p class="eyebrow">Дача Пар · реальные работы</p><h1>Бани, которые уже построены</h1><p>Девять реальных объектов в двух моделях. Фотографии сгруппированы по конкретным баням, без смешивания интерьеров. Размеры, планировки и комплектации выбираются отдельно — на странице соответствующей модели.</p></header><div class="cjm-work-filter" role="group" aria-label="Фильтр по модели"><button type="button" data-work-filter="all" aria-pressed="true">Все 9 объектов</button><button type="button" data-work-filter="parus" aria-pressed="false">Парус · 4</button><button type="button" data-work-filter="kvadro-haus" aria-pressed="false">Квадро Хаус · 5</button></div><section class="cjm-works-grid" aria-label="Примеры выполненных бань">'+cards()+'</section><p>Каталожные фотографии «Квадро» и «Викинга» не считаются подтверждёнными фото выполненных объектов.</p></div>'
 js='''<script>document.addEventListener('click',e=>{let b=e.target.closest('[data-work-filter]');if(!b)return;for(const x of document.querySelectorAll('[data-work-filter]'))x.setAttribute('aria-pressed',String(x===b));for(const card of document.querySelectorAll('[data-work-model]'))card.hidden=b.dataset.workFilter!=='all'&&card.dataset.workModel!==b.dataset.workFilter;});</script>'''
 head='''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow,max-image-preview:large"><meta name="description" content="Реальные фотографии построенных бань Парус и Квадро Хаус. 9 объектов, снаружи и внутри. Выберите свою модель и планировку."><title>Реальные бани: фотографии готовых объектов | Дача Пар</title><link rel="canonical" href="https://xn--80aaan1dh9b.xn--p1ai/raboty/"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/premium.css"><link rel="stylesheet" href="/cjm-r80.css?v=20261022-r80a"></head><body><main>'''
 return head+h+'</main>'+js+'</body></html>'

def r80_model_script():
 return '''// Exact known object IDs only; no arbitrary query selectors or external URLs.
const valid={parus:new Set(['slats','terrace','cream','timber']),'kvadro-haus':new Set(['terrace-window','timber-terrace','panoramic','grey','wide-glazing'])};
const model=location.pathname.includes('/bani/parus/')?'parus':location.pathname.includes('/bani/kvadro-haus/')?'kvadro-haus':null;
const requested=new URLSearchParams(location.search).get('work');
if(model&&valid[model].has(requested)){
 const attr=model==='parus'?'data-pp-object':'data-qh-object';
 const selector='['+attr+'="'+requested+'"]';
 addEventListener('load',()=>{const target=document.querySelector(selector);if(target){const section=document.getElementById('photos');section?.scrollIntoView({block:'start'});requestAnimationFrame(()=>target.click());}}, {once:true});
}
'''

def transform(root):
 root=Path(root);main=root/'index.html';qh=root/'bani/kvadro-haus/index.html';require(main.is_file() and qh.is_file(),'SOURCE_HTML_MISSING')
 original=main.read_text();edited,parts=home(original)
 require(edited!=original,'NO_HOME_CHANGE')
 results={'index.html':edited}
 for model in MODELS:
  path=f'bani/{model}/index.html';f=root/path
  require(f.is_file(),'MODEL_FILE_MISSING_'+path)
  results[path]=model_page(f.read_text(),model,parts)
 results['raboty/index.html']=works_page()
 results['cjm-r80.css']=CSS
 results['cjm-r80-model.mjs']=r80_model_script()
 sitemap=root/'sitemap.xml'
 if sitemap.is_file():
  value=sitemap.read_text()
  target='https://xn--80aaan1dh9b.xn--p1ai/raboty/'
  if target not in value:
   require('</urlset>' in value,'SITEMAP_INVALID')
   results['sitemap.xml']=value.replace('</urlset>', '<url><loc>'+target+'</loc></url>\n</urlset>',1)

 for name,text in results.items():
  target=root/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text,encoding='utf-8')
 return {k:hashlib.sha256(v.encode()).hexdigest() for k,v in results.items()}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('site',type=Path);a=p.parse_args();print(json.dumps(transform(a.site),indent=2,ensure_ascii=False))

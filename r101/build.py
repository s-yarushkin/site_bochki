"""Build an isolated R101 public candidate. Never writes production or web/ baseline."""
import sys, json, shutil, hashlib, re
from pathlib import Path
from html import escape as esc
from datetime import date
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.local/python'))
from bs4 import BeautifulSoup
from PIL import Image
from editorial import ARTICLES
from seo import metadata, structured, canonical_path
SRC=ROOT/'web'; DEST=ROOT/'output/r101-site'; HERE=ROOT/'r101'
DEST.mkdir(parents=True,exist_ok=True)
shutil.copytree(SRC,DEST,dirs_exist_ok=True)
shutil.copytree(HERE/'vendor',DEST/'r101/vendor',dirs_exist_ok=True)
for f in ['site.css','visual.css','site.mjs','state.mjs','mobile-dialog.mjs']: shutil.copy2(HERE/f,DEST/'r101'/f)
facades={'kvadro-editorial','parus-editorial','viking-editorial','house-editorial'}
responsive_assets=facades|{'tea-editorial','oak-basin-layer','oak-steam','conifer-rest'}
for name in ['tea-editorial','oak-basin-layer','oak-steam','conifer-rest',*sorted(facades)]:
 im=Image.open(HERE/'assets'/f'{name}.png'); im.thumbnail((1536,1536))
 (DEST/'r101/assets').mkdir(exist_ok=True)
 im.save(DEST/'r101/assets'/f'{name}.webp',quality=80 if name in facades else 86)
 if name in responsive_assets:
  for width in [640,960]:
   small=im.copy();small.thumbnail((width,width))
   small.save(DEST/'r101/assets'/f'{name}-{width}.webp',quality=80)
(DEST/'r101/assets/birch-layer.webp').unlink(missing_ok=True)
book=json.loads((SRC/'data/catalog-pricebook.json').read_text('utf-8'))
photos=json.loads((SRC/'data/photo-references.json').read_text('utf-8'))
plans=json.loads((SRC/'data/r94-layouts.json').read_text('utf-8'))['plans']
models=['kvadro','parus','viking','kvadro-house']
names={'kvadro':'Квадро','parus':'Парус','viking':'Викинг','kvadro-house':'Квадро Хаус'}
slugs={**{m:m for m in models},'kvadro-house':'kvadro-haus'}
desc={'kvadro':'Парная и комната отдыха в компактном корпусе для небольшого участка','parus':'Корпус шириной 2,4 метра с прямыми стенами и центральным входом','viking':'Арочный центральный вход и корпус шириной 2,4 метра','kvadro-house':'Больше места для отдельных помещений и отдыха с семьёй или гостями'}
meta={'kvadro':'Ширина 2,1 м · длина 4–6 м','parus':'Ширина 2,4 м · длина 4–6 м','viking':'Ширина 2,4 м · длина 4–6 м','kvadro-house':'От 4 × 4 до 6 × 6 м'}
model_inclusions={'kvadro':'Центральный вход и ровный пол уже включены в Комфорт.','parus':'Удобный центральный вход уже включён в Комфорт.','viking':'Арочный центральный вход уже включён.','kvadro-house':'Сборка на участке уже включена в цену.'}
photo_ids={'kvadro':'kq-08','parus':'02_exterior','viking':'cream-outside','kvadro-house':'kh7-07'}
hero_photo='/qh-media/assets/photos/kh7-06-960.webp'
def money(v):return f'{v:,}'.replace(',','\u00a0')+' ₽'
def model_url(m):return '/bani/'+slugs[m]+'/'
def sizes(m):return list(book['r85']['models'][m]['sizes'].keys())
def size_label(m,s):return book['r85']['models'][m]['sizes'][s]['label']
def price(m,s):return book['r85']['models'][m]['sizes'][s]['priceRub']
def photo(m):return next(p for p in photos if p['model']==m and p['photoId']==photo_ids[m])
def image(src,alt,cls='',eager=False):
 with Image.open(DEST/src.lstrip('/')) as asset:w,h=asset.size
 responsive=''
 if Path(src).stem in facades:
  stem=src[:-5]
  responsive=f' srcset="{stem}-640.webp 640w, {stem}-960.webp 960w, {src} 1536w" sizes="(max-width:760px) calc(100vw - 40px), 50vw"'
 return f'<img src="{src}" alt="{esc(alt)}" width="{w}" height="{h}" class="{cls}"{responsive} '+('fetchpriority="high"' if eager else 'loading="lazy"')+' decoding="async">'
def btn(label,href=None,attrs='',kind=''):return f'<a class="btn {kind}" href="{href}" {attrs}>{label}<span aria-hidden="true">↗</span></a>' if href else f'<button type="button" class="btn {kind}" {attrs}>{label}<span aria-hidden="true">↗</span></button>'
def request(label='Получить предложение',m='',s='',purpose='quote',extra=''):return btn(label,attrs=f'data-inquiry="{purpose}" data-model="{m}" data-size="{s}" {extra}')
def control(m,full=False):
 s=sizes(m)[0]
 detail_url='#plans' if full else model_url(m)
 opts=''.join(f'<option value="{k}">{size_label(m,k)}</option>' for k in sizes(m))
 table=''.join(f'<tr><td>{size_label(m,k)}</td><td>{money(price(m,k))}</td></tr>' for k in sizes(m))
 return f'''<div class="size-control"><label>Размер бани <select data-size-picker="{m}" aria-label="Размер {names[m]}">{opts}</select></label></div><div class="price-line"><div><strong data-price="{m}">{money(price(m,s))}</strong><small>Комплектация «Комфорт»</small></div>{request(m=m,s=s)}</div><div class="model-foot"><a class="textlink" href="{detail_url}">{'О модели и оснащении' if not full else 'Примеры планировок'} →</a><button class="textlink" data-save="{m}" type="button" style="border:0;background:none;font-size:13px">Сохранить выбор</button></div><details class="disclosure"><summary>Все размеры и цены</summary><table class="price-table"><caption class="caption">{names[m]} · Комфорт</caption><tbody>{table}</tbody></table></details>'''
def model_image(m):return '/r101/assets/'+('house' if m=='kvadro-house' else m)+'-editorial.webp'
def card(m):return f'''<article class="model" data-model-card="{m}"><a class="model-figure" style="display:block" href="{model_url(m)}">{image(model_image(m),names[m]+', вид снаружи')}</a><div class="model-head"><h3><a href="{model_url(m)}">{names[m]}</a></h3><small>{meta[m]}</small></div><p class="model-desc">{desc[m]}</p>{control(m)}</article>'''
mark='<svg class="mark" viewBox="0 0 32 38" aria-hidden="true"><path d="M6 33c-8-10 8-13 1-23M16 34c-10-12 10-16 1-29M26 32c-8-9 7-12 1-21"/></svg>'
nav='<a href="/bani/">Бани и цены</a><a href="/komplektaciya/">Что входит</a><a href="/planirovki/">Планировки</a><a href="/dostavka-i-ustanovka/">Доставка</a>'
header=f'''<a class="skip" href="#main">К содержанию</a><header class="site-header"><a class="wordmark" href="/" aria-label="ДачаПар, главная">{mark}дача пар</a><nav class="desktop-nav" aria-label="Основная навигация">{nav}</nav><a class="phone" href="tel:+79517349999">+7 (951) 734-99-99</a><button class="menu-button" aria-expanded="false" aria-controls="mobile-menu">Меню</button></header><nav id="mobile-menu" class="mobile-menu" aria-label="Мобильная навигация" hidden>{nav}<a href="/kontakty/">Контакты</a></nav>'''
footer=f'''<footer class="site-footer"><div class="wrap"><div class="footer-top"><a href="/" class="wordmark">{mark}дача пар</a><nav class="footer-links" aria-label="Дополнительная навигация">{nav}<a href="/voprosy/">Вопросы</a><a href="/journal/">Журнал</a><a href="/kontakty/">Контакты</a><a href="/regiony/">География доставки</a></nav><a href="tel:+79517349999">+7 (951) 734-99-99</a></div><div class="footer-bottom"><p>Производство — Вологда. Доставка: Москва и Подмосковье, Вологодская, Ярославская и Ленинградская области.</p><a href="/privacy.html">Политика обработки данных</a><a href="/consent.html">Согласие на обработку</a><a href="/requisites.html">Реквизиты</a></div></div></footer>'''
dialog='''<dialog id="inquiry-dialog" aria-labelledby="inquiry-title"><div class="dialog-body"><button class="dialog-close" type="button" aria-label="Закрыть заявку">×</button><p class="eyebrow">Ваша будущая баня</p><h2 id="inquiry-title">Как с вами связаться</h2><p class="dialog-intro">Поможем продумать вашу баню и подготовим предложение с выбранным оснащением и доставкой.</p><div class="selection-summary" id="inquiry-summary"></div><form id="inquiry-form" action="/api/lead" method="post"><fieldset id="form-fields" disabled style="border:0;padding:0;margin:0"><div class="form-grid contact-fields"><label>Ваш телефон<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (999) 123-45-67" required maxlength="20"></label><label id="channel-field">Удобный способ связи<select name="channel"><option value="phone">Позвонить</option><option value="max">Написать в MAX</option><option value="telegram">Написать в Telegram</option><option value="whatsapp">Написать в WhatsApp</option></select></label></div><details class="form-details"><summary>Добавить пожелания</summary><div class="form-grid"><label>Как к вам обращаться<input name="name" autocomplete="name" maxlength="80" placeholder="Необязательно"></label><label>Где находится участок<input name="settlement" autocomplete="address-level2" maxlength="140" placeholder="Область, населённый пункт"></label><label class="full">Что важно для вашей бани<textarea name="comment" rows="2" maxlength="300" placeholder="Например, нужен душ, большая парная или особое освещение"></textarea></label></div></details><p class="consent" id="consent-notice">Отправляя заявку, вы подтверждаете <a href="/consent.html" target="_blank" rel="noopener">согласие на обработку персональных данных</a> для ответа на ваше обращение. <a href="/privacy.html" target="_blank" rel="noopener">Политика обработки данных</a>.</p><button type="submit" class="btn form-submit" aria-describedby="consent-notice">Получить предложение</button></fieldset><p class="form-status" id="form-status" role="status" aria-live="polite"></p><p class="caption" id="preview-note" hidden>Тестовый просмотр · Заявка останется на этом компьютере</p></form><p class="dialog-contact">Или позвоните нам <a href="tel:+79517349999">+7 (951) 734-99-99</a></p></div></dialog><aside class="resume" id="resume" hidden aria-label="Ваш выбранный вариант"><div><small>Ваш выбор</small><strong id="resume-title"></strong></div><button data-resume-inquiry>Получить предложение ↗</button><button data-dismiss-resume aria-label="Скрыть выбранный вариант">×</button></aside><p class="toast" role="status" hidden></p>'''

routes=[]
def page(path,title,body,description='',schema=None):
 file=DEST/(path.strip('/')+'/index.html' if path!='/' else 'index.html');file.parent.mkdir(parents=True,exist_ok=True)
 body_soup=BeautifulSoup(body,'html.parser');intro=body_soup.select_one('.lede') or body_soup.find('p')
 title,description,canonical=metadata(path,title,description,intro.get_text(' ',strip=True) if intro else '')
 schema=structured(path,title,description,schema)
 ld='<script type="application/ld+json">'+json.dumps(schema,ensure_ascii=False).replace('</','<\\/')+'</script>'
 markup=f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#fafaf7"><title>{esc(title)} | ДачаПар</title><meta name="description" content="{esc(description)} "><link rel="canonical" href="https://xn--80aaan1dh9b.xn--p1ai{canonical}"><meta property="og:title" content="{esc(title)} | ДачаПар"><meta property="og:site_name" content="ДачаПар"><meta property="og:locale" content="ru_RU"><meta property="og:url" content="https://xn--80aaan1dh9b.xn--p1ai{canonical}"><meta property="og:description" content="{esc(description)}"><meta property="og:type" content="{'article' if path.startswith('/journal/') and path!='/journal/' else 'website'}"><meta name="twitter:card" content="summary_large_image"><meta property="og:image" content="https://xn--80aaan1dh9b.xn--p1ai{model_image(next(m for m in models if model_url(m)==path)) if path in [model_url(m) for m in models] else hero_photo}"><meta name="robots" content="noindex,nofollow"><link rel="icon" href="/assets/favicon.svg"><link rel="preload" href="/assets/manrope-cyrillic.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/r101/vendor/scrollcraft.css"><link rel="stylesheet" href="/r101/site.css"><link rel="stylesheet" href="/r101/visual.css">{ld}</head><body data-release="R101-CANDIDATE">{header}<main id="main">{body}</main>{footer}{dialog}<noscript><p class="wrap section">Поможем выбрать баню по телефону <a href="tel:+79517349999">+7 (951) 734-99-99</a>.</p></noscript><script src="/r101/vendor/scrollcraft.js" defer></script><script type="module" src="/r101/site.mjs"></script></body></html>'''
 soup=BeautifulSoup(markup,'html.parser')
 for asset in soup.select('img[src]'):
  source=asset['src'];stem=Path(source).stem
  if stem in responsive_assets:
   prefix=source[:-5];asset['srcset']=f'{prefix}-640.webp 640w, {prefix}-960.webp 960w, {source} 1536w'
   desktop='50vw' if stem in facades or stem=='tea-editorial' else '61vw'
   mobile='108vw' if stem=='oak-basin-layer' else 'calc(100vw - 40px)'
   asset['sizes']=f'(max-width:760px) {mobile}, {desktop}'
 for element in soup.select('h1,h2,h3,.eyebrow,.ritual-note button'):
  for node in list(element.find_all(string=True)):
   node.replace_with(re.sub(r'\.(?=\s*$)','',str(node)))
 file.write_text(str(soup),encoding='utf-8');routes.append(path)
def head(title,lead='',crumb=''):
 return f'<header class="wrap page-head"><nav class="breadcrumb" aria-label="Навигационная цепочка"><a href="/">Главная</a><span>/</span><span>{esc(crumb or title)}</span></nav><h1>{title}</h1>'+ (f'<p class="lede">{lead}</p>' if lead else '')+'</header>'
def heading(title,text=''):return f'<div class="section-heading"><h2>{title}</h2><p class="muted">{text}</p></div>'
def close():
 return f'''<section class="closing section" id="contact"><div class="wrap closing-grid">
 <div><p class="eyebrow">От идеи к своей бане</p><h2>Пусть у дачи<br>появится свой<br>банный вечер</h2><p class="muted">Поможем выбрать модель, обсудим оснащение и подготовим предложение для вашего участка.</p><div class="selection-summary" data-closing-choice hidden></div><div class="actions">{request('Получить предложение',purpose='quote')}<a class="textlink" href="tel:+79517349999">Позвонить</a></div></div>
 <figure>{image('/r101/assets/tea-editorial.webp','Чай у окна после банного вечера')}</figure></div></section>'''

specs=[
 ('Для хорошего пара','Печь с дымоходом и защитным ограждением. Верхний полок и выдвижной нижний, стеклянная дверь в парную.'),
 ('Для отдыха между заходами','Стол и две лавки для чаепития. Шкаф, чтобы убрать одежду и личные вещи.'),
 ('Для света и удобства','Освещение с двумя абажурами, проводка, выключатели, электрощиток и дополнительная розетка. Увеличенное окно в комнате отдыха, форточка в парной.'),
 ('Для воздуха и тепла','Вентиляция для проветривания и просушки бани. Входная дверь ПВХ.')]
def spec_list():
 return '<ul class="spec-list">'+''.join(f'<li><strong>{a}</strong><p>{b}</p></li>' for a,b in specs)+'</ul>'

faq=[
 ('Что входит в цену бани?','На сайте указана цена бани в комплектации «Комфорт». В неё входят печь с дымоходом, полки и ограждение, мебель, свет, электрика, двери, окно и вентиляция. Сборка Квадро Хаус на участке тоже включена.'),
 ('Можно изменить планировку и оснащение?','Да. Расскажите, сколько места нужно для парной, душа и отдыха. Поможем выбрать планировку, расставить мебель, розетки и свет. Покажем дополнения для вашей модели и включим выбранные решения в предложение.'),
 ('Когда я узнаю полную стоимость?','После разговора о вашей бане и месте установки подготовим персональное предложение. В нём будут выбранная модель, желаемые дополнения, доставка и условия установки. Состав и полную стоимость вы увидите до заказа.'),
 ('Большое окно и подсветка входят в Комфорт?','В Комфорте уже есть увеличенное окно в комнате отдыха, форточка парной и основное освещение. Для панорамного остекления, подсветки полков и террасы подберём подходящее исполнение и подготовим предложение с выбранными дополнениями.'),
 ('Нужно заранее выбирать планировку?','Можно начать с пожеланий: париться и отдыхать вдвоём, принимать душ после парной или собираться с гостями. Мы поможем подобрать модель и планировку под ваш банный вечер.')]
def faqs():
 return ''.join(f'<details class="disclosure"><summary>{q}</summary><p>{a}</p></details>' for q,a in faq)

def personalize():
 return f'''<section class="personalize section" id="individual"><div class="wrap split">
 <div><p class="eyebrow">В дополнение к комплектации «Комфорт»</p><h2>Добавим то,<br>что важно вам</h2><p class="lede">У каждой семьи свой банный вечер. Подстроим пространство под ваши привычки.</p><ul class="possibilities"><li>Индивидуальная планировка и расстановка мебели</li><li>Розетки и светильники там, где вам удобно</li><li>LED-подсветка полков и уличное освещение</li><li>Панорамное остекление и другие варианты оснащения</li></ul><p class="muted">Менеджер покажет варианты для вашей модели и поможет выбрать оснащение под ваши привычки.</p><a class="textlink" href="/planirovki/">Посмотреть примеры планировок →</a></div>
 <figure>{image('/assets/detail-led-p2-960.webp','Мягкая подсветка деревянного полка')}</figure></div></section>'''

def invitation():
 return f'''<section class="breath invitation" id="breath" aria-labelledby="breath-title" data-depth-scene><div class="breath-stage"><p class="eyebrow breath-kicker">Начнём с ваших пожеланий</p><p class="breath-word" aria-hidden="true">ВАША БАНЯ</p>{image('/r101/assets/oak-basin-layer.webp','Дубовый веник в деревянном тазу','breath-object')}<div class="breath-copy"><h2 id="breath-title">Расскажите, какой<br>вы её представляете</h2><p>Для тихих вечеров вдвоём или встреч с близкими. Найдём подходящий вариант вместе.</p>{request('Обсудить мою баню',purpose='selection_help')}</div><span class="breath-line" aria-hidden="true"></span></div></section>'''

def process():
 return '''<section class="wrap section" id="delivery"><div class="section-heading"><h2>От первого разговора<br>до вашей бани</h2><p class="muted">Вы заранее знаете состав бани и полную стоимость</p></div><ol class="steps process-row"><li><div><h3>Обсудим пожелания</h3><p>Как будете отдыхать, какие помещения нужны и где находится участок.</p></div></li><li><div><h3>Подготовим предложение</h3><p>Подберём модель и оснащение, подготовим предложение с доставкой по вашему адресу.</p></div></li><li><div><h3>Подготовим ваш заказ</h3><p>Запишем выбранное оснащение, стоимость и порядок установки в документы заказа.</p></div></li></ol><a class="textlink" href="/dostavka-i-ustanovka/">Как подготовить место для бани →</a></section>'''

home=f'''<section class="hero" data-sc-act="flow"><div class="hero-grid"><div class="hero-copy"><p class="eyebrow">Готовые бани для дачи</p><h1>Ваша дача<br>Ваша баня<br><span>Время для себя</span></h1><p class="lede">Производим бани в Вологде. Поможем выбрать вашу.</p><div class="actions">{btn('Посмотреть бани','#models')}</div></div><div class="hero-visual">{image(hero_photo,'Парная ДачаПар с большим окном в сад','hero-photo',True)}</div></div></section>

 <section class="wrap section" id="models" data-sc-act="flow">{heading('Найдите свою баню','Четыре формы, разные размеры и одна готовая комплектация «Комфорт»')}<div class="model-grid">{''.join(card(m) for m in models)}</div><div class="help-line"><a class="textlink" href="/compare/">Сравнить модели →</a>{request('Помогите выбрать',purpose='selection_help')}</div></section>
 <section class="ritual" id="ritual" data-sc-act="flow"><div class="wrap">{heading('У каждого вечера<br>свой ритуал','Протопить печь, запарить веник и наконец никуда не торопиться')}<div class="ritual-layout"><figure class="ritual-stage"><div class="ritual-images"><img class="ritual-picture active" data-ritual-image="heat" src="/assets/detail-stove-p2-960.webp" width="960" height="640" alt="Камни банной печи" loading="lazy"><img class="ritual-picture" data-ritual-image="steam" src="/r101/assets/oak-steam.webp" width="1536" height="1024" alt="Запаренный дубовый веник" loading="lazy" aria-hidden="true"><img class="ritual-picture" data-ritual-image="rest" src="/r101/assets/conifer-rest.webp" width="1536" height="1024" alt="Отдых на полке с хвойными ветками" loading="lazy" aria-hidden="true"></div><div class="ritual-tabs" aria-label="Детали банного вечера"><button type="button" data-ritual="heat" aria-pressed="true">Жар</button><button type="button" data-ritual="steam" aria-pressed="false">Веник</button><button type="button" data-ritual="rest" aria-pressed="false">Отдых</button></div></figure><div class="ritual-notes"><article class="ritual-note" data-ritual-step="heat"><button data-ritual="heat" aria-pressed="true">Потрескивают дрова</button><p>Печь набирает тепло, камни прогреваются. Скоро можно будет поддать первую порцию воды.</p></article><article class="ritual-note" data-ritual-step="steam"><button data-ritual="steam" aria-pressed="false">Пахнет дубовым<br>веником</button><p>Мягкие листья, тёплое дерево и знакомый аромат. Здесь легко забыть о делах.</p></article><article class="ritual-note" data-ritual-step="rest"><button data-ritual="rest" aria-pressed="false">Можно остаться<br>ещё немного</button><p>Вытянуть ноги на полке, потом налить чаю и решить, будет ли ещё один заход.</p></article></div></div></div></section>
 <section class="quiet section" id="comfort"><div class="wrap split"><div><p class="eyebrow">Уже входит в цену</p><h2>Баня уже<br>укомплектована</h2><p class="lede">Париться, отдыхать, собираться за чаем. Печь, полки, мебель и электрика уже предусмотрены в Комфорте.</p><a href="/komplektaciya/" class="textlink">Вся комплектация →</a></div>{spec_list()}</div></section>
 {personalize()}{invitation()}{process()}<section class="wrap section" style="padding-top:0"><div class="split"><h2>Перед заказом</h2><div>{faqs()}</div></div></section>{close()}'''
page('/','Готовые бани для дачи в комплектации Комфорт',home)
page('/bani/','Бани и цены',head('Найдите свою баню','Выберите форму и размер. Цена комплектации «Комфорт» появится сразу, без заявки.')+f'<section class="wrap section" style="padding-top:20px"><div class="model-grid">{"".join(card(m) for m in models)}</div></section>'+close())

# Two intentional examples per model, not a plan per each available size.
plan_ids=['p1','p5','parus_4000_2400_dry','parus_5000_2400_wash','viking_5000_2400_dry','viking_6000_2400_wash','p13','p15']
selected=[next(p for p in plans if p['id']==id) for id in plan_ids]
(DEST/'r101/plans.json').write_text(json.dumps(selected,ensure_ascii=False,indent=2),encoding='utf-8')
(DEST/'data/r94-layouts.json').write_text(json.dumps({'version':'R101-V3-CURATED','plans':selected},ensure_ascii=False,indent=2),encoding='utf-8')
for p in plans:
 if p['id'] in {'p9','p11'}:
  for k in ['image','mirrorImage']:
   f=DEST/p[k]
   if f.is_file():f.unlink()
for f in (DEST/'qh-media/assets/plans').glob('kh-4x4*'):f.unlink()

plan_text={
 'p1':('Для отдыха вдвоём','Компактная баня с отдельной парной и местом для чаепития'),
 'p5':('С местом для душа','Парная, комната отдыха и душевая ниша внутри бани'),
 'parus_4000_2400_dry':('Для неспешных выходных','Парная и комната отдыха в корпусе длиной 4 метра'),
 'parus_5000_2400_wash':('Парная и место для душа','Больше возможностей для отдыха между заходами'),
 'viking_5000_2400_dry':('Для пара и компании','Две основные зоны в корпусе длиной 5 метров'),
 'viking_6000_2400_wash':('После парной — освежиться','Вариант для тех, кто хочет ополоснуться после парной'),
 'p13':('Больше места для общения','Парная, душевая и место для общения между заходами'),
 'p15':('Отличный отдых большой компании','Отдельные помещения для парения, душа и отдыха')}
def plan_card(p):
 title,description=plan_text[p['id']]
 return f'''<article class="plan" data-plan-model="{p['model']}" id="plan-{p['id']}"><a href="/{p['image']}" aria-label="Открыть схему {esc(p['title'])}">{image('/'+p['image'],p['title'])}</a><p class="eyebrow">{names[p['model']]} · {size_label(p['model'],p['size'])}</p><h3>{title}</h3><p>{description}</p>{request('Обсудить планировку',p['model'],p['size'],'plan',f'data-plan="{p["id"]}" data-plan-label="{esc(title)}"')}</article>'''

# Keep a small, optional original detail gallery. It is not the advertising showcase.
detail_ids={'kvadro':['kq-12','kq-13'],'parus':['02_steam','02_lounge'],'viking':['cream-steam','cream-lounge'],'kvadro-house':['kh7-06','kh7-08']}
for m in models:
 p=photo(m);s=sizes(m)[0]
 own=[x for id in detail_ids[m] for x in photos if x['model']==m and x['photoId']==id]
 gallery=''
 for x in own:
  extra='data-photo="'+x['photoId']+'"'
  gallery+=f'<figure>{image(x["image"],x["caption"])}<figcaption><p>{esc(x["caption"])}</p>{request("Обсудить исполнение",m,s,"photo",extra)}</figcaption></figure>'
 body=head(names[m]+' для вашей дачи',desc[m],names[m])+f'''<section class="wrap section" style="padding-top:20px"><div class="product-lead"><figure>{image(model_image(m),names[m]+', вид снаружи',eager=True)}</figure><div class="product-controls" data-model-card="{m}"><p class="eyebrow">{meta[m]}</p><h2 style="margin-top:20px">Готовая баня<br>в Комфорте</h2><p class="muted" style="margin-top:20px">{model_inclusions[m]}</p>{control(m,True)}</div></div></section>
 <section class="quiet section"><div class="wrap split"><div><h2>Что уже есть<br>в вашей бане</h2><a class="textlink" href="/komplektaciya/">Подробнее о комплектации →</a></div>{spec_list()}</div></section>
 <section class="wrap section" id="plans">{heading('Два примера планировки','Можно взять за основу один из вариантов или обсудить собственный')}<div class="plan-grid">{''.join(plan_card(x) for x in selected if x['model']==m)}</div></section>
 <section class="wrap" id="photos"><details class="disclosure construction"><summary>Заглянуть внутрь бани</summary><p>Рассмотрите помещения этой модели. Подскажем, как устроить пространство под ваши привычки.</p><div class="photo-rail">{gallery}</div></details></section>'''+personalize()+close()
 schema={'@context':'https://schema.org','@type':'Product','name':'Баня '+names[m]+' Комфорт','image':'https://xn--80aaan1dh9b.xn--p1ai'+model_image(m),'description':desc[m],'offers':{'@type':'AggregateOffer','priceCurrency':'RUB','lowPrice':min(price(m,x) for x in sizes(m)),'highPrice':max(price(m,x) for x in sizes(m)),'offerCount':len(sizes(m))}}
 page(model_url(m),names[m]+' Комфорт: размеры и цены',body,schema=schema)

page('/komplektaciya/','Что входит в Комфорт',head('Всё основное<br>уже на своём месте','Печь, обустройство парной, мебель и электрика входят в цену каждой бани в Комфорте.')+f'<section class="wrap section" style="padding-top:20px"><div class="split"><div>{image("/kvadro-media/assets/photos/kq-12-960.webp","Полки, свет и вентиляция в парной Квадро")}</div>{spec_list()}</div></section><section class="quiet section"><div class="wrap split"><h2>Особенности<br>четырёх моделей</h2><ul class="spec-list">'+''.join(f'<li><strong>{names[m]}</strong><p>{model_inclusions[m]}</p></li>' for m in models)+'</ul></div></section>'+personalize()+'<section class="wrap section"><div class="split"><h2>Баня на<br>вашем участке</h2><div><p class="lede">Расскажите, где вы хотите поставить баню. Подскажем, как подготовить место, обсудим доставку, разгрузку и подключения. Полную стоимость отразим в предложении до заказа.</p><p class="notice">Сборка Квадро Хаус на вашем участке уже включена в цену модели.</p><a class="textlink" href="/bani/">Выбрать модель и размер →</a></div></div></section>'+close())

# Existing URL remains useful without a second catalogue of raw project photos.
page('/raboty/','Посмотрите бани изнутри',head('Рассмотрите баню<br>поближе','Откройте модель, чтобы посмотреть её помещения, планировки и варианты оснащения.')+'<section class="wrap section" style="padding-top:20px"><div class="model-grid">'+''.join(f'<article class="model"><a class="model-figure" href="{model_url(m)}#photos">{image(model_image(m),names[m]+", фасад")}</a><h2 style="margin-top:20px">{names[m]}</h2><p class="muted">{desc[m]}</p><a class="textlink" href="{model_url(m)}#photos">Посмотреть детали →</a></article>' for m in models)+'</div></section>'+close())
page('/planirovki/','Примеры планировок',head('Как будет устроена<br>ваша баня','По два примера для каждой модели. Планировку и расстановку мебели можно обсудить индивидуально.')+'<section class="wrap section" style="padding-top:0"><nav class="filters" aria-label="Фильтр планировок"><a href="/planirovki/">Все модели</a>'+''.join(f'<a href="?model={m}">{names[m]}</a>' for m in models)+'</nav><p class="form-status" id="plan-notice" hidden></p><div class="plan-grid">'+''.join(plan_card(p) for p in selected)+'</div></section>'+close())
page('/dostavka-i-ustanovka/','Доставка и установка',head('От выбора бани<br>до вашего участка','Поможем подготовить место и продумать доставку вашей бани.')+'<section class="wrap section" style="padding-top:20px"><div class="split"><div><h2>Начнём<br>с вашего адреса</h2><p class="lede">Для начала достаточно населённого пункта. Фотографии места и размеры подъезда можно прислать после первого разговора.</p></div><ol class="steps"><li><div><h3>Удобный подъезд</h3><p>По фотографиям и размерам въезда определим, как технике подъехать к месту установки.</p></div></li><li><div><h3>Место для бани</h3><p>Поможем учесть размеры бани и подскажем, какое основание нужно подготовить.</p></div></li><li><div><h3>Подключения</h3><p>Расскажем, что подготовить для подключения электричества и воды в выбранной бане.</p></div></li></ol></div><p class="notice">Порядок доставки и установки вашей бани обсудим до заказа.</p><div class="delivery-consultation"><h2>Где поставить<br>вашу баню?</h2><p class="lede">Получите бесплатную консультацию по доставке и размещению бани на участке.</p><div class="actions">'+request('Получить консультацию',purpose='delivery')+'</div></div></section>')
page('/voprosy/','Ответы на вопросы',head('Что важно<br>перед заказом')+'<section class="wrap section" style="padding-top:0"><div class="editorial">'+faqs()+'</div></section>'+close())
page('/kontakty/','Контакты ДачаПар',head('Обсудим вашу баню','Поможем выбрать модель, подскажем варианты оснащения и подготовим предложение.')+f'<section class="wrap section" style="padding-top:10px"><div class="split"><div><a href="tel:+79517349999" style="font-size:clamp(27px,4vw,48px);text-decoration:none">+7 (951) 734-99-99</a><p class="lede" style="margin-top:25px">Позвоните нам или оставьте номер для связи.</p><p>Производство — Вологда</p></div><div>{request("Помогите выбрать",purpose="selection_help")}<p class="notice">Москва и Московская область, Вологодская, Ярославская и Ленинградская области. Подготовим предложение с доставкой по вашему адресу.</p><a href="/requisites.html" class="textlink">Реквизиты →</a></div></div></section>')
compare_rows=''.join(f'<tr><th scope="row"><a href="{model_url(m)}">{names[m]}</a></th><td>{meta[m]}</td><td>{model_inclusions[m]}</td><td>от {money(price(m,sizes(m)[0]))}</td></tr>' for m in models)
page('/compare/','Сравнить модели',head('Какая баня<br>подойдёт вам','Во всех моделях предусмотрена комплектация «Комфорт». Главное различие — форма, габариты и пространство внутри.')+f'<section class="wrap section" style="padding-top:15px"><div class="table-scroll" tabindex="0" role="region" aria-label="Сравнение четырёх моделей"><table class="comparison"><thead><tr><th>Модель</th><th>Габариты</th><th>Особенность</th><th>Комфорт</th></tr></thead><tbody>{compare_rows}</tbody></table></div><p class="catalog-note">В таблице — цены бань в Комфорте. Откройте модель, чтобы выбрать размер и увидеть свою цену.</p><div class="actions">{btn('Посмотреть модели','/bani/')}{request('Помогите выбрать',purpose='selection_help')}</div></section>')



page('/regiony/','Доставка бань из Вологды в Москву и регионы',head('Из Вологды —<br>на вашу дачу','Бани ДачаПар производятся в Вологде. Поставляем их в Москву и Подмосковье, Вологодскую, Ярославскую и Ленинградскую области.')+f'<section class="wrap section" style="padding-top:10px"><div class="region-grid"><article><h2>Москва и Подмосковье</h2><p>Выберите модель и размер, расскажите, где находится участок. Подготовим предложение с доставкой и поможем продумать размещение бани.</p></article><article><h2>Вологодская область</h2><p>Бани ДачаПар производятся в Вологде. Поможем подобрать баню для вашей дачи и обсудим доставку по адресу участка.</p></article><article><h2>Ярославская область</h2><p>Поставляем готовые бани в область. Для первого разговора достаточно населённого пункта и пожеланий к модели.</p></article><article><h2>Ленинградская область</h2><p>Обсудим выбранную баню, подъезд к участку и место установки. Фотографии въезда помогут подготовить доставку.</p></article></div><div class="split section"><div><h2>Начните с бани,<br>которая вам нравится</h2><p class="lede">В каталоге открыты цены всех размеров в Комфорте. Производство находится в Вологде; предложение с доставкой подготовим для вашего адреса.</p></div><div><ul class="spec-list">'+''.join(f'<li><strong><a href="{model_url(m)}">{names[m]}</a></strong><p>{meta[m]} · от {money(price(m,sizes(m)[0]))}</p></li>' for m in models)+'</ul></div></div><div class="delivery-consultation"><h2>Поможем разместить<br>баню на участке</h2><p class="lede">Получите бесплатную консультацию по доставке и подготовке места.</p><div class="actions">'+request('Получить консультацию',purpose='delivery')+btn('Посмотреть бани','/bani/',kind='ghost')+'</div></div></section>')

# Reuse useful editorial substance with new navigation and no obsolete package sale.
articles=[]
for f in sorted((SRC/'journal').glob('*/index.html')):
 soup=BeautifulSoup(f.read_text('utf-8'),'html.parser');h=soup.find('h1');title=h.get_text(' ',strip=True) if h else f.parent.name
 if f.parent.name in ARTICLES:
  title,lead,sections=ARTICLES[f.parent.name];path='/journal/'+f.parent.name+'/'
  articles.append((path,title))
  content=''.join(f'<h2>{esc(heading)}</h2><p>{esc(text)}</p>' for heading,text in sections)
  page(path,title,head(title,lead)+'<article class="wrap section editorial" style="padding-top:0">'+content+'<div class="actions">'+btn('Выбрать баню','/bani/')+request('Помогите выбрать',purpose='selection_help')+'</div></article>')
  continue
 if f.parent.name=='kvadro-5-komfort':
  title='Квадро 5 м в комплектации Комфорт';path='/journal/kvadro-5-komfort/';articles.append((path,title))
  page(path,title,head(title,'Компактный корпус шириной 2,1 метра и место для банного вечера.')+f'<article class="wrap section editorial" style="padding-top:0"><h2>Что вы получаете за {money(price("kvadro","500"))}</h2><p>В цену входят печь и дымоход по согласованной спецификации, верхний и выдвижной нижний полки, ограждение печи, стол, две лавки, шкаф, электрика, штатное освещение и вентиляция.</p><p>Центральный вход и ровный пол уже включены в Комфорт. Входная дверь и окно ПВХ сохраняют тепло, стеклянная дверь отделяет парную от комнаты отдыха.</p><h2>Как баня появится на вашей даче</h2><p>Подготовим предложение с доставкой, подскажем, что нужно для установки и подключения. Состав и полная стоимость будут понятны до заказа.</p><a class="textlink" href="/bani/kvadro/?size=500">Посмотреть Квадро 5 м →</a></article>')
  continue
 paragraphs=[]
 for n in (soup.find('article') or soup.find('main') or soup).find_all(['h2','h3','p','ul']):
  text=n.get_text(' ',strip=True)
  if (n.name not in ['h2','h3'] and len(text)<35) or not text or re.search(r'делюкс|deluxe|калькулятор|комфорт\s*\+|data-|отправляя заявку',text,re.I):continue
  if n.find_parent(['ul','footer','nav']):continue
  if n.name in ['h2','h3']:paragraphs.append(f'<h2>{esc(text)}</h2>')
  else:paragraphs.append(f'<p>{esc(text)}</p>')
 path='/journal/'+f.parent.name+'/'
 articles.append((path,title));page(path,title,head(esc(title))+ '<article class="wrap section editorial" style="padding-top:0">'+''.join(paragraphs[:16])+'<p class="notice">Выберите модель и размер — цена Комфорта уже указана в каталоге. С планировкой, оснащением и доставкой поможем разобраться.</p><a class="textlink" href="/bani/">Бани и цены →</a></article>')
page('/journal/','Журнал о выборе бани',head('Чтобы выбрать<br>со знанием дела.','Коротко о размерах, материалах, цене и подготовке участка.')+'<section class="wrap section" style="padding-top:0"><div class="article-list">'+''.join(f'<a href="{p}">{esc(t)} ↗</a>' for p,t in articles)+'</div></section>')
# Replace old sales entry points with the new package page, while preserving URLs.
for path in ['/komplektacii/','/ceny/']:
 page(path,'Бани в комплектации Комфорт',head('Одна понятная комплектация.','Цены всех размеров открыты. Печь, полки, мебель, свет и электрика уже предусмотрены.')+f'<section class="wrap section"><div class="actions">{btn("Бани и цены","/bani/")}{btn("Что входит","/komplektaciya/",kind="ghost")}</div></section>')
# Every remaining HTML marketing path is explicitly migrated; protected legal sources stay byte-identical.
protected={'privacy.html','consent.html','requisites.html','manager.html'}
for f in list(DEST.rglob('*.html')):
 rel=f.relative_to(DEST).as_posix()
 if rel in protected or rel=='404.html':continue
 if 'data-release="R101-CANDIDATE"' not in f.read_text('utf-8'):
  path='/'+str(f.parent.relative_to(DEST)).replace('\\','/')+'/'
  page(path,'Выбор готовой бани',head('Ваша баня начинается здесь.')+f'<section class="wrap section">{btn("Бани и цены","/bani/")}</section>')
page('/404-temp/','Страница не найдена',head('Найдём вашу баню','Здесь нужная страница не нашлась. Все модели, цены и примеры планировок собраны в каталоге.')+f'<section class="wrap section">{btn("Перейти к баням","/bani/")}</section>')
shutil.copy2(DEST/'404-temp/index.html',DEST/'404.html');(DEST/'404-temp/index.html').unlink();(DEST/'404-temp').rmdir();routes.remove('/404-temp/')
(DEST/'robots.txt').write_text('User-agent: *\nDisallow: /\n',encoding='utf-8')
(DEST/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>https://xn--80aaan1dh9b.xn--p1ai'+p+'</loc></url>' for p in routes if canonical_path(p)==p)+'</urlset>',encoding='utf-8')
manifest={'release':'R101-CANDIDATE','productionChanged':False,'routes':routes,'selectedPlans':[p['id'] for p in selected],'withdrawnPlans':['p9','p11'],'protected':{n:hashlib.sha256((DEST/n).read_bytes()).hexdigest() for n in ['data/catalog-pricebook.json','data/site-settings.json','quote.mjs','r85-pricing.mjs','consent.html','privacy.html','requisites.html','manager.html','assets/js/manager.js','assets/css/manager.css']},'source':str(HERE)}
(ROOT/'output/r101-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'BUILT R101 isolated candidate: {len(routes)} routes, {len(selected)} curated plans, 20 Comfort prices. Root: {DEST}')

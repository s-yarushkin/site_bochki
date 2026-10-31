"""R103 SEO and editorial overlay. Reproducible preview; never writes production."""
import sys,json,re,shutil,subprocess,hashlib,math
from pathlib import Path
from html import escape as e
from datetime import date
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.local/python'))
from bs4 import BeautifulSoup
from PIL import Image,ImageDraw
from content import ARTICLES,REGIONS,table,link,ul,h,p
sys.stdout.reconfigure(encoding='utf-8')
ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
OUT=ROOT/'output/r103-site';HERE=Path(__file__).parent
subprocess.run([sys.executable,str(ROOT/'r101/build.py')],check=True)
shutil.copytree(ROOT/'output/r101-site',OUT,dirs_exist_ok=True)
(OUT/'r103').mkdir(exist_ok=True)
for n in ['reading.css','region-context.mjs']:shutil.copy2(HERE/n,OUT/'r103'/n)
book=json.loads((OUT/'data/catalog-pricebook.json').read_text('utf-8'))
def money(n):return f'{n:,}'.replace(',','\u00a0')+' ₽'
def price(model,size):return book['r85']['models'][model]['sizes'][size]['priceRub']
tokens={**{f'{m}_{s}':money(price(m,s)) for m in ['kvadro','parus','viking'] for s in ['400','500','600']},'house_400':money(price('kvadro-house','4x4'))}
def expand(s):
 for k,v in tokens.items():s=s.replace('{{'+k+'}}',v)
 assert '{{' not in s
 return s

# Source images are generated through the built-in image model and kept in the project.
sources={
 'sizes':'exec-af2aa03a-20bf-488b-bd7b-4ed1c2fbcac4.png',
 'site':'exec-f91ab6f9-9abc-4900-9cc7-e366d66a7650.png',
 'wood':'exec-d2bc80a7-08e7-496c-9cc4-ff5b6d5bc013.png',
 'fuel':'exec-34dbcf05-ecf2-440f-a6ef-e44baa4c2273.png',
 'comfort':'exec-35012ce4-7b8d-4fd0-bfc7-4c961147fdf7.png'}
assets=HERE/'assets';assets.mkdir(exist_ok=True)
generated=Path.home()/'.codex/generated_images/01a17e0f-cfbc-7c60-a180-f2bcc29455fe'
for name,source in sources.items():
 target=assets/(name+'.png')
 if not target.exists():shutil.copy2(generated/source,target)
 im=Image.open(target).convert('RGB')
 (OUT/'r103/assets').mkdir(exist_ok=True)
 for width in [640,960,1536]:
  variant=im.copy();variant.thumbnail((width,width));variant.save(OUT/f'r103/assets/{name}-{width}.webp',quality=86)

# Rasterize the existing editable logo geometry; do not invent a new brand mark.
scale=8;im=Image.new('RGBA',(64*scale,64*scale),(0,0,0,0));draw=ImageDraw.Draw(im)
draw.rounded_rectangle((0,0,64*scale-1,64*scale-1),radius=16*scale,fill='#18392e')
for points in [[(18,49),(5,34),(34,30),(20,12)],[(33,51),(18,34),(48,27),(35,7)],[(47,48),(35,36),(56,30),(51,16)]]:
 curve=[]
 for i in range(201):
  t=i/200;u=1-t
  curve.append(tuple(scale*(u**3*points[0][j]+3*u*u*t*points[1][j]+3*u*t*t*points[2][j]+t**3*points[3][j]) for j in [0,1]))
 draw.line(curve,fill='#f1a674',width=3*scale,joint='curve')
 for x,y in [curve[0],curve[-1]]:draw.ellipse((x-1.5*scale,y-1.5*scale,x+1.5*scale,y+1.5*scale),fill='#f1a674')
for size in [32,48,120,180,192]:im.resize((size,size),Image.Resampling.LANCZOS).save(OUT/f'favicon-{size}.png')
im.resize((256,256),Image.Resampling.LANCZOS).save(OUT/'favicon.ico',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
svg=(OUT/'assets/favicon.svg').read_text('utf-8').replace('viewBox="0 0 64 64"','width="64" height="64" viewBox="0 0 64 64"')
(OUT/'favicon.svg').write_text(svg,encoding='utf-8')
favicon='''<link rel="icon" href="/favicon.ico?v=r103" sizes="16x16 32x32 48x48" type="image/x-icon"><link rel="icon" href="/favicon-48.png?v=r103" sizes="48x48" type="image/png"><link rel="icon" href="/favicon.svg?v=r103" sizes="any" type="image/svg+xml"><link rel="apple-touch-icon" href="/favicon-180.png?v=r103" sizes="180x180">'''

template=BeautifulSoup((OUT/'journal/kak-vybrat-gotovuyu-banyu/index.html').read_text('utf-8'),'html.parser')
def figure(name,alt,caption):
 return f'<figure class="reading-figure" data-illustration="{name}"><a href="/r103/assets/{name}-1536.webp" target="_blank" rel="noopener" aria-label="Открыть иллюстрацию крупнее"><img src="/r103/assets/{name}-960.webp" srcset="/r103/assets/{name}-640.webp 640w, /r103/assets/{name}-960.webp 960w, /r103/assets/{name}-1536.webp 1536w" sizes="(max-width:760px) calc(100vw - 40px), 960px" width="1536" height="1024" alt="{e(alt)}" decoding="async" fetchpriority="high"></a><figcaption>{e(caption)}</figcaption></figure>'
def cta(title='Найдём баню для вашей дачи',text='Расскажите, как хотите отдыхать. Поможем выбрать модель, планировку и оснащение, подготовим предложение для вашего участка.',delivery=False):
 return '<section class="reading-cta delivery-consultation"><h2>'+title+'</h2><p>'+text+'</p><div class="actions"><button class="btn" data-inquiry="'+('delivery' if delivery else 'selection_help')+'">'+('Получить консультацию' if delivery else 'Помогите выбрать баню')+'</button><a class="textlink" href="/bani/">Посмотреть бани и цены →</a></div></section>'
new_routes=[]
def render(path,title,description,body,article=False,region=None,image=None):
 s=BeautifulSoup(str(template),'html.parser');s.select_one('main').clear();s.select_one('main').append(BeautifulSoup(body,'html.parser'))
 if region:s.select_one('main')['data-region']=region
 s.title.string=title+' | ДачаПар'
 for name,value in [('description',description),('robots','noindex,nofollow')]:s.select_one('meta[name="'+name+'"]')['content']=value
 s.select_one('link[rel="canonical"]')['href']=ORIGIN+path
 for key,value in [('title',title+' | ДачаПар'),('description',description),('url',ORIGIN+path),('type','article' if article else 'website')]:s.select_one('meta[property="og:'+key+'"]')['content']=value
 if image:s.select_one('meta[property="og:image"]')['content']=ORIGIN+f'/r103/assets/{image}-1536.webp'
 org=json.loads(s.select_one('script[type="application/ld+json"]').string)['@graph'][0]
 org['areaServed'].append({'@type':'City','name':'Санкт-Петербург'})
 crumbs=[('Главная','/'),('Журнал' if article else 'География доставки','/journal/' if article else '/regiony/')]
 if path not in ['/journal/','/regiony/']:crumbs.append((title,path))
 else:crumbs=crumbs[:1]+[(title,path)]
 graph=[org,{'@type':'WebSite','@id':ORIGIN+'/#website','url':ORIGIN+'/','name':'ДачаПар','inLanguage':'ru-RU','publisher':{'@id':ORIGIN+'/#organization'}},{'@type':'WebPage','@id':ORIGIN+path+'#webpage','url':ORIGIN+path,'name':title,'description':description,'inLanguage':'ru-RU','isPartOf':{'@id':ORIGIN+'/#website'}},{'@type':'BreadcrumbList','@id':ORIGIN+path+'#breadcrumbs','itemListElement':[{'@type':'ListItem','position':i,'name':name,'item':ORIGIN+url} for i,(name,url) in enumerate(crumbs,1)]}]
 if article:graph.append({'@type':'Article','@id':ORIGIN+path+'#article','headline':title,'description':description,'inLanguage':'ru-RU','publisher':{'@id':ORIGIN+'/#organization'},'author':{'@id':ORIGIN+'/#organization'},'dateModified':str(date(2026,10,31)),'image':ORIGIN+f'/r103/assets/{image}-1536.webp','mainEntityOfPage':{'@id':ORIGIN+path+'#webpage'}})
 s.select_one('script[type="application/ld+json"]').string=json.dumps({'@context':'https://schema.org','@graph':graph},ensure_ascii=False).replace('</','<\\/')
 s.head.append(BeautifulSoup('<link rel="stylesheet" href="/r103/reading.css">','html.parser'))
 if region:s.body.append(BeautifulSoup('<script type="module" src="/r103/region-context.mjs"></script>','html.parser'))
 f=OUT/path.strip('/')/'index.html';f.parent.mkdir(parents=True,exist_ok=True);f.write_text(str(s),encoding='utf-8');new_routes.append(path)

for slug,a in ARTICLES.items():
 content=BeautifulSoup(expand(a['body']),'html.parser');toc=[]
 for i,title in enumerate(content.select('h2'),1):title['id']='section-'+str(i);toc.append('<a href="#section-'+str(i)+'">'+e(title.get_text())+'</a>')
 related='<section class="reading-related"><h2>Читайте также</h2>'+''.join(link('/journal/'+r+'/',e(ARTICLES[r]['title'])) for r in a['related'])+'</section>'
 body='<article class="reading"><header class="reading-head"><nav class="reading-breadcrumbs" aria-label="Хлебные крошки"><a href="/">Главная</a><span>/</span><a href="/journal/">Журнал</a></nav><h1>'+e(a['title'])+'</h1><p class="lede">'+e(a['lead'])+'</p><p class="reading-meta">ДачаПар · Обновлено 31 октября 2026</p></header>'+figure(a['image'],a['alt'],a['caption'])+'<div class="reading-layout"><div class="reading-body"><div class="reading-summary"><strong>Главное</strong><p>'+expand(a['summary'])+'</p></div>'+str(content)+cta()+related+'</div><nav class="reading-toc" aria-label="Содержание статьи"><strong>В этой статье</strong>'+''.join(toc)+'</nav></div></article>'
 render('/journal/'+slug+'/',a['title'],a['lead'],body,article=True,image=a['image'])

regionlinks='<nav class="region-links" aria-label="Регионы доставки">'+''.join(link('/regiony/'+slug+'/',r['short']) for slug,r in REGIONS.items())+'</nav>'
prices='<ul class="region-prices">'+''.join('<li>'+link('/bani/'+slug+'/',name)+' — от '+money(price(model,size))+'<span>'+desc+'</span></li>' for slug,name,model,size,desc in [('kvadro','Квадро','kvadro','400','Ширина 2,1 м, длина 4–6 м'),('parus','Парус','parus','400','Ширина 2,4 м, длина 4–6 м'),('viking','Викинг','viking','400','Ширина 2,4 м, длина 4–6 м'),('kvadro-haus','Квадро Хаус','kvadro-house','4x4','Размеры от 4 × 4 до 6 × 6 м')])+'</ul>'
for slug,r in REGIONS.items():
 body='<article class="reading"><header class="reading-head"><nav class="reading-breadcrumbs" aria-label="Хлебные крошки"><a href="/">Главная</a><span>/</span><a href="/regiony/">География доставки</a></nav><h1>'+e(r['title'])+'</h1><p class="lede">'+e(r['lead'])+'</p></header><div class="reading-body">'+p(r['intro'])+h('Выберите свою баню')+prices+p('Цены указаны для минимального размера каждой модели в комплектации «Комфорт». В неё уже входят печь и дымоход, полки, мебель, электрика, свет, окна и вентиляция. '+link('/komplektaciya/','Посмотрите полный состав')+' и '+link('/planirovki/','примеры планировок')+'.')+h(r['focus_title'])+p(r['focus'])+h('Что поможет подготовить доставку')+ul(r['checks'])+p('Основание и подключения согласуют для выбранной модели. Начать можно с '+link('/journal/dostavka-i-osnovanie/','списка подготовки участка')+'. Заранее закупать материалы для универсальной схемы основания не нужно.')+h('От первого разговора до предложения')+p('Выберите модель и размер или расскажите, каким представляете отдых. Затем обсудим планировку, нужное оснащение, подъезд и место установки. Полная стоимость и порядок получения заказа будут согласованы до оформления. Индивидуальную мебель, розетки, свет и другие дополнения можно продумать вместе с менеджером.')+h('Вопросы о заказе')+'<details><summary>'+e(r['question'])+'</summary>'+p(r['answer'])+'</details><details><summary>Можно узнать стоимость доставки без выбора бани?</summary>'+p('Можно начать с консультации по вашему участку. Для полного предложения потребуется определить модель, габариты и способ размещения. Так условия будут относиться именно к вашей бане и адресу.')+'</details><details><summary>В регионе есть офис или выставочная баня?</summary>'+p('Производство ДачаПар находится в Вологде. Здесь вы можете обсудить заказ по телефону или через заявку на сайте. Адреса представительств в этом регионе мы не указываем.')+'</details>'+cta('Обсудим баню для вашего участка','Получите бесплатную консультацию по доставке и размещению. В заявке уже будет указан ваш регион.',delivery=True)+h('Другие направления доставки')+regionlinks+'</div></article>'
 # Do not put absence-of-office messaging into the sales path; retain only verified location in contacts.
 start=body.index('<details><summary>В регионе есть офис')
 end=body.index('</details>',start)+len('</details>');body=body[:start]+body[end:]
 render('/regiony/'+slug+'/',r['title'],r['lead'],body,region=r['name'])
body='<article class="reading"><header class="reading-head"><nav class="reading-breadcrumbs"><a href="/">Главная</a></nav><h1>Готовые бани из Вологды — на вашу дачу</h1><p class="lede">Производим в Вологде. Доставляем в Москву и Подмосковье, Петербург и Ленобласть, Вологодскую и Ярославскую области.</p></header>'+regionlinks+'<div class="reading-body">'+h('Выберите направление доставки')+p('На страницах регионов — модели и цены, вопросы по подъезду и размещению, порядок подготовки предложения. Для первого разговора достаточно населённого пункта: фотографии и размеры проезда можно прислать после выбора бани.')+h('Четыре модели в комплектации «Комфорт»')+prices+h('Подготовим предложение для вашего адреса')+p('Выбранная модель, габариты, оснащение и условия подъезда определяют порядок доставки. Обсудим размещение и согласуем полную стоимость до заказа. '+link('/dostavka-i-ustanovka/','Как подготовить участок')+'.')+cta(delivery=True)+'</div></article>'
render('/regiony/','Готовые бани с доставкой из Вологды в Москву, Петербург и области','Производство ДачаПар в Вологде. Модели и цены готовых бань, доставка в Москву и Подмосковье, Петербург и Ленобласть, Ярославскую и Вологодскую области.',body)
cards='';journal_images=set()
for slug,a in ARTICLES.items():
 visual=''
 if a['image'] not in journal_images:
  visual='<img src="/r103/assets/'+a['image']+'-640.webp" width="640" height="427" loading="lazy" alt="'+e(a['alt'])+'">';journal_images.add(a['image'])
 cards+='<article class="journal-card"><a href="/journal/'+slug+'/">'+visual+'<h2>'+e(a['title'])+'</h2></a><p>'+e(a['lead'])+'</p><a class="textlink" href="/journal/'+slug+'/">Читать статью →</a></article>'
render('/journal/','Как выбрать готовую баню: размеры, цены, доставка и уход','Практические материалы ДачаПар: сравнение моделей и размеров, комплектация, стоимость, подготовка участка, приёмка и уход за деревянной баней.','<section class="reading"><header class="reading-head"><nav class="reading-breadcrumbs"><a href="/">Главная</a></nav><h1>Выбираем баню со знанием дела</h1><p class="lede">Сравнения, понятные схемы и списки, которые помогут выбрать баню и подготовить дачу к её появлению.</p></header><div class="journal-cards">'+cards+'</div></section>')

titles={'/':'Готовые бани для дачи с печью от '+money(price('kvadro','400')),'/bani/':'Готовые бани для дачи — модели, размеры и цены','/bani/kvadro/':'Баня Квадро — размеры и цены от '+money(price('kvadro','400')),'/bani/parus/':'Баня Парус — размеры и цены от '+money(price('parus','400')),'/bani/viking/':'Баня Викинг — размеры и цены от '+money(price('viking','400')),'/bani/kvadro-haus/':'Баня Квадро Хаус — планировки и цены от '+money(price('kvadro-house','4x4'))}
protected={'privacy.html','consent.html','requisites.html','manager.html'}
routes=[]
for f in OUT.rglob('*.html'):
 if f.relative_to(OUT).as_posix() in protected or f.name.startswith('yandex_'):continue
 s=BeautifulSoup(f.read_text('utf-8'),'html.parser')
 if not s.select_one('body[data-release]'):continue
 route='/' if f==OUT/'index.html' else '/'+f.parent.relative_to(OUT).as_posix()+'/'
 if f.name!='404.html':routes.append(route)
 for old in s.select('link[rel="icon"],link[rel="apple-touch-icon"]'):old.decompose()
 s.head.append(BeautifulSoup(favicon,'html.parser'))
 s.body['data-release']='R103-CANDIDATE'
 if route in titles:
  title=titles[route];s.title.string=title+' | ДачаПар';s.select_one('meta[property="og:title"]')['content']=title+' | ДачаПар'
 graph=json.loads(s.select_one('script[type="application/ld+json"]').string)['@graph']
 for node in graph:
  if node.get('@type')=='Organization' and not any(a.get('name')=='Санкт-Петербург' for a in node['areaServed']):node['areaServed'].append({'@type':'City','name':'Санкт-Петербург'})
  if route in titles and node.get('@type')=='WebPage':node['name']=titles[route]
 s.select_one('script[type="application/ld+json"]').string=json.dumps({'@context':'https://schema.org','@graph':graph},ensure_ascii=False).replace('</','<\\/')
 for node in s.select('.footer-bottom p'):
  if 'Производство' in node.get_text():node.string='Производство — Вологда. Доставка: Москва и Подмосковье, Петербург и Ленобласть, Вологодская и Ярославская области.'
 if route=='/kontakty/':
  node=s.select_one('.notice')
  if node:node.string='Москва и Московская область, Санкт-Петербург и Ленинградская область, Вологодская и Ярославская области. Подготовим предложение с доставкой по вашему адресу.'
 if route=='/dostavka-i-ustanovka/':
  node=s.select_one('main .delivery-consultation')
  node.insert_before(BeautifulSoup(regionlinks,'html.parser'))
 if route=='/raboty/':
  # Existing URL remains available and is linked contextually rather than added as another sales catalogue.
  pass
 if route=='/bani/':
  anchor=BeautifulSoup('<p class="wrap catalog-note"><a href="/raboty/">Рассмотреть помещения четырёх моделей →</a></p>','html.parser');s.select_one('main').append(anchor)
 f.write_text(str(s),encoding='utf-8')

js=(OUT/'r101/site.mjs').read_text('utf-8')
js=js.replace("const consultationPage=['/dostavka-i-ustanovka/','/regiony/'].includes(location.pathname);","const consultationPage=location.pathname.startsWith('/regiony/')||location.pathname==='/dostavka-i-ustanovka/';")
(OUT/'r101/site.mjs').write_text(js,encoding='utf-8')
canonicals=sorted({r for r in routes if r not in ['/ceny/','/komplektacii/']})
(OUT/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>'+ORIGIN+r+'</loc>'+('<lastmod>2026-10-31</lastmod>' if r in new_routes else '')+'</url>' for r in canonicals)+'</urlset>',encoding='utf-8')
manifest={'release':'R103-CANDIDATE','routes':sorted(routes),'canonicalRoutes':canonicals,'articles':list(ARTICLES),'regions':list(REGIONS),'images':sources,'productionChanged':False}
(ROOT/'output/r103-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'candidate':str(OUT),'routes':len(routes),'canonicalPages':len(canonicals),'articles':len(ARTICLES),'regions':len(REGIONS),'generatedImages':len(sources)},ensure_ascii=False))

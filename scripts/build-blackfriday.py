"""Build the approved landing and shared catalog promotion over verified live sources."""
import hashlib,json,re,shutil
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/blackfriday-20261110';BASE=OUT/'baseline/web';WEB=ROOT/'web'
proposal=json.loads((ROOT/'concepts/black-friday-2026/proposed-prices.json').read_text('utf8'))
packages=json.loads((ROOT/'content/packages-20261109.json').read_text('utf8'))
def write(path,text):
 p=WEB/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(text.encode())
rows=[{'model':r['model'],'modelName':r['modelName'],'size':r['size'],'sizeLabel':r['sizeLabel'],'package':r['package'],'packageName':r['packageName'],'source':r['currentDisplayedPriceRub'],'reference':r['proposedReferencePriceRub'],'discount':r['blackFridayDiscountRub']} for r in proposal['rows']]
assert len(rows)==40 and all(r['additionalDeluxeDiscountRub']==0 for r in proposal['rows'])
campaign={'id':'black_friday_2026','start':proposal['startInclusive'],'end':proposal['endExclusive'],'timeZone':'Europe/Moscow','rows':rows}
write('campaigns/blackfriday-data.mjs','// One campaign price source for the catalog and landing. No extra Deluxe discount.\nexport const CAMPAIGN='+json.dumps(campaign,ensure_ascii=False,separators=(',',':'))+';\n')
for model in ['kvadro','parus','viking','kvadro-house']:
 source=ROOT/'concepts/black-friday-2026/v4/assets'/('scene-'+model+'.png')
 dest=WEB/'blackfriday/assets'/('scene-'+model+'.webp');dest.parent.mkdir(parents=True,exist_ok=True)
 with Image.open(source) as image:
  image.save(dest,'WEBP',lossless=True,method=6)
  with Image.open(dest) as check:assert check.convert('RGB').tobytes()==image.convert('RGB').tobytes()
css=(ROOT/'concepts/black-friday-2026/v4/style.css').read_text('utf8').replace("url('assets/manrope-","url('/assets/manrope-")
css+='\n.primary:disabled{opacity:.65;cursor:wait}.campaign-status{margin:0 0 14px;color:#a45123;font-size:13px;font-weight:650}.review-footer{font-size:12px}.review-footer a{margin-left:16px}.inquiry-help{font-size:13px;color:#625b51}.bf-page .lead-success-shown,.bf-page #receipt-success{color:#2d2b28}.bf-page .lead-success-shown .btn{background:#b65b27}.bf-page .receipt-success-icon{color:#a45123;background:#f2e6d6}.bf-page .receipt-success-steps p,.bf-page .receipt-success-intro{color:#625b51}@media(min-width:1101px){.offer{width:37%;max-width:640px}.scene img{mask-image:linear-gradient(to bottom,transparent 0,#000 6%,#000 95%,transparent 100%)}}\n'
css+='\n@media(max-width:1100px){.scene{height:auto;aspect-ratio:1672/941}.scene img{position:absolute;width:100%;height:auto;right:0;top:0;object-fit:contain;transform:none}}@media(max-width:560px){.scene{aspect-ratio:1672/1411.5}.scene img{width:150%}}\n'
css+='\n'+(ROOT/'content/blackfriday-scene.css').read_text('utf8')
write('blackfriday/style.css',css)
html=(ROOT/'concepts/black-friday-2026/v4/index.template.html').read_text('utf8')
html=html.replace('noindex,nofollow','noindex,follow').replace('<body>','<body class="bf-page">').replace('href="style.css"','href="/blackfriday/style.css?v=20261110"')
head='<meta name="description" content="Чёрная пятница в ДачаПар: выберите модель и размер бани, сравните Комфорт и Делюкс. Скидки при заключении договора 11–21 ноября 2026."><link rel="canonical" href="https://xn--80aaan1dh9b.xn--p1ai/blackfriday/">'
head+='<meta property="og:title" content="Чёрная пятница · Бани ДачаПар"><meta property="og:description" content="Квадро, Парус, Викинг и Квадро Хаус. Выберите размер и комплектацию. 11–21 ноября 2026."><meta property="og:url" content="https://xn--80aaan1dh9b.xn--p1ai/blackfriday/"><meta property="og:image" content="https://xn--80aaan1dh9b.xn--p1ai/blackfriday/assets/scene-parus.webp">'
html=html.replace('</head>',head+'</head>').replace('href="#main" aria-label="ДачаПар, на первый экран"','href="/" aria-label="ДачаПар, на главный сайт"')
html=html.replace('src="assets/scene-parus.png" width="1920" height="1080"','src="/blackfriday/assets/scene-parus.webp" width="1672" height="941"')
html=html.replace('<p class="selection"','<p class="campaign-status" data-campaign-status>11–21 ноября 2026</p><p class="selection"')
html=html.replace('<footer class="review-footer"><span>Макет для согласования. Отправка заявок отключена.</span><a href="../PRICES-REVIEW.md">Расчёт всех цен</a></footer>','<footer class="review-footer"><span>ДачаПар · Производство в Вологде</span><div><a href="/">Основной сайт</a><a href="/privacy.html">Политика обработки данных</a></div></footer>')
html=html.replace('<form id="inquiry-form">','<form id="inquiry-form" data-lead-entry="model_offer">').replace('<p id="inquiry-status" role="status" hidden>','<p id="inquiry-status" role="alert" hidden>')
html=html.replace('https://дачапар.рф/consent.html','/consent.html').replace('https://дачапар.рф/privacy.html','/privacy.html')
html=html.replace('</form></dialog>','</form><p class="inquiry-help">Можно позвонить: <a href="tel:+79517349999">+7 (951) 734-99-99</a></p></dialog>')
html=re.sub(r'<script id="campaign-data".*?</body>', '<script type="module" src="/blackfriday/app.mjs?v=20261110"></script><noscript><p>Для выбора модели включите JavaScript или позвоните: <a href="tel:+79517349999">+7 (951) 734-99-99</a>. Цены акции действуют только 11–21 ноября 2026.</p></noscript></body>',html,flags=re.S)
for key in ['comfort','deluxe']:
 r=next(r for r in rows if r['model']=='parus' and r['size']=='550' and r['package']==key)
 money=lambda n:f'{n:,}'.replace(',',' ')+' ₽'
 html=html.replace('data-reference="'+key+'"></del>','data-reference="'+key+'">'+money(r['reference'])+'</del>')
 html=html.replace('data-saving="'+key+'"></p>','data-saving="'+key+'">Скидка '+money(r['discount'])+'</p>')
 html=html.replace('data-price="'+key+'"></strong>','data-price="'+key+'">от '+money(r['reference']-r['discount'])+'</strong>')
 html=html.replace('data-description="'+key+'"></p>','data-description="'+key+'">'+packages['short'][key]+'</p>')
write('blackfriday/index.html',html)
# Preserve the actual current home page and its imports; patch only campaign surfaces.
state=(BASE/'choice/state.mjs').read_text('utf8')
state="import {campaignChoiceQuote} from '/campaigns/blackfriday.mjs';\n"+state
state=state.replace("  const row=book.r85.models[state.model].sizes[state.size];\n  return", "  const promotion=campaignChoiceQuote(book,state);if(promotion)return promotion.priceRub;\n  const row=book.r85.models[state.model].sizes[state.size];\n  return")
write('choice/state.mjs',state)
app=(BASE/'choice/app.mjs').read_text('utf8')
app="import {campaignChoiceQuote,campaignPhase,syncCampaignClock} from '/campaigns/blackfriday.mjs';\n"+app
app=app.replace("if(!r.ok)throw Error('LOAD');return r.json();","if(!r.ok)throw Error('LOAD');syncCampaignClock(r);return r.json();")
app=app.replace("selection.append(radio,heading,price,node('p',PACKAGE_COPY[key],'choice-package-description'));", "const campaign=node('div',null,'choice-campaign');campaign.dataset.campaign=key;\n selection.append(radio,heading,campaign,price,node('p',PACKAGE_COPY[key],'choice-package-description'));")
anchor="  $('[data-package-price=\"'+key+'\"]').textContent='от '+money.format(choicePrice(book,{...state,package:key}));"
assert app.count(anchor)==1
render="""  const q=campaignChoiceQuote(book,{...state,package:key}),campaign=$('[data-campaign="'+key+'"]');campaign.replaceChildren();
  if(q&&q.phase!=='ended'){
   const badge=node('a',q.phase==='active'?'Чёрная пятница':'Чёрная пятница · с 11 ноября','choice-campaign-badge');badge.href='/blackfriday/?model='+state.model+'&size='+state.size+'&package='+key;campaign.append(badge);
   if(q.phase==='active'){campaign.append(node('del','от '+money.format(q.reference),'choice-campaign-reference'),node('span','Скидка '+money.format(q.discountRub),'choice-campaign-saving'));}
   campaign.append(node('small','При заключении договора 11–21 ноября 2026.'));
  }
"""
app=app.replace(anchor,render+anchor)
app=app.replace('reason,opener});}',"reason,opener,campaignOffer:campaignChoiceQuote(book,selected)});}")
app+="\nlet campaignWindow=campaignPhase();setInterval(()=>{const next=campaignPhase();if(next!==campaignWindow){campaignWindow=next;render(state);}},15000);\n"
write('choice/app.mjs',app)
request=(BASE/'choice/home-hero/model-request.mjs').read_text('utf8')
request=request.replace('reason,opener})','reason,opener,campaignOffer})')
request=request.replace("  attachPhoneMask(form.elements.phone);","  if(campaignOffer?.phase==='active'){if(!action)dialog.querySelector('h2 + p').textContent='Пришлём варианты планировок и комплектаций с ценами.';dialog.querySelector('h2 + p').textContent+=' Чёрная пятница: скидка '+new Intl.NumberFormat('ru-RU').format(campaignOffer.discountRub)+' ₽ при заключении договора 11–21 ноября 2026.';}\n  attachPhoneMask(form.elements.phone);")
# Replace the default Deluxe slogan only for this promotion; retain other existing offers.
old="+'Прислать расширенные планировки, комплектации и цены. Скидка 20 000 ₽ при выборе «Делюкса».';"
new="+'Прислать расширенные планировки, комплектации и цены. '+(campaignOffer?.phase==='active'?'Чёрная пятница: цена по прайсу '+campaignOffer.reference+' ₽; скидка '+campaignOffer.discountRub+' ₽; цена модели от '+campaignOffer.priceRub+' ₽; договор 11–21.11.2026.':'Скидка 20 000 ₽ при выборе «Делюкса».');"
assert old in request;request=request.replace(old,new)
request=request.replace("      payload.journeyContext =", "      payload.comment=payload.comment.slice(0,500);\n      payload.journeyContext =")
write('choice/home-hero/model-request.mjs',request)
home=(BASE/'index.html').read_text('utf8')
home=home.replace('</head>','<link rel="stylesheet" href="/campaigns/blackfriday.css?v=20261110"></head>')
home=home.replace('/choice/app.mjs?v=packages-contact-20261106','/choice/app.mjs?v=blackfriday-20261110')
home=home.replace('Готовые бани для дачи с печью от 410 000 ₽ | ДачаПар','Готовые бани для дачи под ключ | ДачаПар')
write('index.html',home)
files=['web/index.html','web/choice/state.mjs','web/choice/app.mjs','web/choice/home-hero/model-request.mjs']
files += ['web/'+p.relative_to(WEB).as_posix() for folder in ['campaigns','blackfriday'] for p in (WEB/folder).rglob('*') if p.is_file()]
(OUT/'overlay-files.json').write_bytes(json.dumps(sorted(files),indent=2).encode())
print(json.dumps({'landing':'/blackfriday/','models':4,'prices':40,'assets':'lossless WebP, identical decoded RGB','overlay_files':len(files),'api_modified':False}))

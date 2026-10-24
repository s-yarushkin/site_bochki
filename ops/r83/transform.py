#!/usr/bin/env python3
"""R8.3 site-only exact-copy editorial patch, idempotent and guarded. Never modifies pricebook."""
from __future__ import annotations
import re, html, json, hashlib
from pathlib import Path
from collections import defaultdict

MODEL_KIT = [
 'Печь, дымоход и штатный бак для воды',
 'Полки и лежаки в парной',
 'Лавки и место для вещей в комнате отдыха',
 'Окна и двери выбранного варианта',
 'Внутреннее освещение, электрика и предусмотренная электрическая защита',
 'Вентиляция и слив',
 'Конструкция пола',
]
MODEL_SPEC = {
 'kvadro': 'Центральный вынесенный вход входит в цену.',
 'parus': 'Расположение входа зависит от выбранной планировки.',
 'viking': 'Арочный вход по центру входит в цену.',
 'kvadro-haus': 'Сборка на участке уже включена в показанную стоимость.',
}
MODEL_NAMES={'kvadro':'Квадро','parus':'Парус','viking':'Викинг','kvadro-haus':'Квадро Хаус'}
MODEL_URLS=['bani/'+x+'/index.html' for x in MODEL_NAMES]
P0=[10,11,12,13,14,15,16]
EDITABLE=set(MODEL_URLS+[
'index.html','bani/index.html','raboty/index.html','voprosy/index.html','kontakty/index.html','dostavka-i-ustanovka/index.html','journal/index.html','app.mjs','viking-built-media/catalog.json',
'journal/kvadro-5-komfort/index.html','journal/iz-chego-skladyvaetsya-tsena/index.html','journal/banya-4-5-6-metrov/index.html','journal/kak-chitat-komplektatsiyu-bani/index.html','journal/kak-prinyat-gotovuyu-banyu/index.html','journal/ventilyatsiya-i-fortochka/index.html','journal/dostavka-i-osnovanie/index.html','journal/kak-vybrat-gotovuyu-banyu/index.html','journal/el-ili-sosna-dlya-bani/index.html'
])

# Change visible HTML text nodes only; never rename `base`/`comfort` keys or JavaScript contracts.
node_re=re.compile(r'(?<=>)[^<>]+(?=<)',re.S)
def replace_visible(s,old,new):
 if old==new:return s,0
 count=0
 def sub(m):
  nonlocal count
  raw=m.group(0); visible=html.unescape(raw)
  # Russian publication values can contain nbsp as thousands separators
  n=visible.count(old)
  if not n and (' ' in old or '\u00a0' in visible):
   # require canonical space sequence, no logic/code substitutions
   pattern=re.escape(old).replace(r'\ ',r'[ \u00a0]+')
   modified,k=re.subn(pattern,lambda _m:new,visible)
  else: modified,k=visible.replace(old,new),n
  if not k:return raw
  count+=k
  return html.escape(modified,quote=False)
 s=node_re.sub(sub,s)
 return s,count

def replace_str(s,old,new,visible=True):
 return replace_visible(s,old,new) if visible else (s.replace(old,new),s.count(old))

# List of audited groups. Other audit text that depends on changing layout is handled by custom transforms.
REPLACEMENTS={
1: [('bani/kvadro/index.html','Квадро: один реальный объект снаружи и внутри','Рассмотрите Квадро снаружи и внутри')],
2: [('bani/kvadro/index.html',' В галерее — разные ракурсы одной бани.','')],
3: [('raboty/index.html','Все 10 объектов','Все модели'),('raboty/index.html','Все 13 объектов','Все модели'),('raboty/index.html','Квадро · 1','Квадро'),('raboty/index.html','Парус · 4','Парус'),('raboty/index.html','Квадро Хаус · 5','Квадро Хаус'),('raboty/index.html','Викинг · 3','Викинг')],
4: [('bani/viking/index.html','Три построенные бани — с разной отделкой и устройством пространства. Выберите объект и рассмотрите его снаружи и внутри.','Посмотрите отделку, парные и комнаты отдыха готовых Викингов. Выберите вариант, который хочется рассмотреть ближе.')],
7: [('bani/viking/index.html','Фотографии показывают отдельные объекты. Размер, планировку, отделку и оснащение вашего заказа согласуем отдельно. Настил, уличная мебель и благоустройство не входят в стандартную стоимость бани.','Понравилась отделка или интерьер? Подберём вариант для вашего участка. Настил, уличную мебель и благоустройство рассчитаем дополнительно.')],
8: [(x,'Посмотреть этот объект ↗','Рассмотреть баню ↗') for x in ['index.html','raboty/index.html']],
9: [('index.html','Смотреть реальные бани →','Посмотреть готовые бани →')],
10: [('voprosy/index.html','Чем «Комфорт» отличается от базы?','Чем Делюкс отличается от Комфорта?'),('voprosy/index.html','Для Квадро 5 м база стоит 505\u00a0000 ₽, Комфорт — 618\u00a0022 ₽.','Квадро 5 м в комплектации Комфорт стоит 505 000 ₽, Делюкс — 618 022 ₽.'),('voprosy/index.html','Для Квадро 5 м база стоит 505 000 ₽, Комфорт — 618 022 ₽.','Квадро 5 м в комплектации Комфорт стоит 505 000 ₽, Делюкс — 618 022 ₽.'),('voprosy/index.html','Посмотреть весь состав Комфорта','Весь состав Делюкс')],
11: [('journal/iz-chego-skladyvaetsya-tsena/index.html','Квадро 5 м с базовым оснащением','Квадро 5 м · Комфорт'),('journal/iz-chego-skladyvaetsya-tsena/index.html','Свет, хранение и другое оснащение Комфорт','Дополнения Делюкс: свет, хранение и оснащение'),('journal/iz-chego-skladyvaetsya-tsena/index.html','Баня в комплектации Комфорт','Баня в комплектации Делюкс')],
12: [('journal/banya-4-5-6-metrov/index.html','база Квадро 5 м стоит 505 000 ₽, а Комфорт той же длины — 618 022 ₽','Квадро 5 м в комплектации Комфорт стоит 505 000 ₽, а Делюкс той же длины — 618 022 ₽'),('journal/banya-4-5-6-metrov/index.html','база Квадро 5 м стоит 505 000 ₽, а Комфорт той же длины — 618 022 ₽','Квадро 5 м в комплектации Комфорт стоит 505 000 ₽, а Делюкс той же длины — 618 022 ₽')],
13: [('journal/index.html','Комфорт для Квадро 5 м добавляет к оснащённой базе','Делюкс для Квадро 5 м добавляет к Комфорту')],
14: [('journal/kvadro-5-komfort/index.html','чем Комфорт отличается от базы','чем Делюкс отличается от Комфорта')],
15: [('journal/kak-chitat-komplektatsiyu-bani/index.html','лавка-рундук в Комфорте для Квадро 5 м','лавка с местом для хранения в Делюкс для Квадро 5 м'),('journal/kak-prinyat-gotovuyu-banyu/index.html','в Комфорте для Квадро 5 м есть лавка-рундук, шкаф и дополнительный свет','в Делюкс для Квадро 5 м есть лавка с хранением, шкаф и дополнительный свет')],
16: [('journal/ventilyatsiya-i-fortochka/index.html','включена в пакет Комфорт для Квадро 5 м','включена в Делюкс для Квадро 5 м'),('voprosy/index.html','утепление пола в Комфорте относится именно к пакету Квадро 5 м','утепление пола в Делюкс предусмотрено именно для Квадро 5 м')],
17: [('journal/kvadro-5-komfort/index.html','; условий акции или отдельной скидки в этот расчёт не добавлено','')],
18: [('journal/kvadro-5-komfort/index.html','Иллюстрация света показывает атмосферу, а не монтажную схему.','Свет и расположение светильников согласуем для вашей бани.')],
19: [('journal/kvadro-5-komfort/index.html','В пакете нет обливного устройства «Обливаста»;','Обливное устройство можно добавить отдельно;')],
20: [('journal/kvadro-5-komfort/index.html','без скрытого пакета дополнений','по открытому списку дополнений')],
21: [(x,'Изображение показывает общий вид модели, а не все варианты размеров и оснащения.','На фото — пример отделки. Размер и оснащение выберем для вашей бани.') for x in MODEL_URLS],
22: [('index.html','Общий вид модели. На изображении может быть показано дополнительное оснащение. Размер и отделку согласуем для вашего заказа.','На фото — пример отделки. Ваша комплектация и её стоимость указаны в расчёте.')],
23: [(x,'по каталогу от 19 октября 2026.','') for x in MODEL_URLS],
24: [('bani/index.html','Стоимость каждого варианта открыта.','Выберите модель, размер и оснащение.'),('bani/kvadro-haus/index.html','Стоимость каждого варианта открыта.','Пять размеров от 4 × 4 до 6 × 6 м.')],
25: [(x,'обязательная сборка','сборка на участке') for x in ['bani/index.html','bani/kvadro-haus/index.html','dostavka-i-ustanovka/index.html','voprosy/index.html','journal/iz-chego-skladyvaetsya-tsena/index.html','journal/banya-4-5-6-metrov/index.html','journal/kak-chitat-komplektatsiyu-bani/index.html','journal/kak-prinyat-gotovuyu-banyu/index.html','journal/kak-vybrat-gotovuyu-banyu/index.html','journal/dostavka-i-osnovanie/index.html']],
26: [('bani/viking/index.html','Индивидуальные широкие исполнения рассчитываем по запросу, без цены стандартной модели.','Для ширины 2,45 и 3 м подготовим отдельный расчёт.')],
27: [(x,'Фото помогают выбрать отделку, а схемы — расположение помещений. Площади ориентировочные. Планировку и оснащение согласуем для вашей бани.','Выберите удобное расположение помещений. Планировку и оснащение согласуем под ваши пожелания. Площади указаны ориентировочно.') for x in ['bani/parus/index.html','bani/kvadro-haus/index.html']],
28: [('bani/kvadro-haus/index.html','Напольная конструкция по спецификации выбранного варианта','Пол входит в комплектацию. Его устройство обсудим для выбранной бани.')],
29: [(x,'Частые вопросы о '+label,'Вопросы о бане '+label) for x,label in [('bani/kvadro/index.html','Квадро'),('bani/parus/index.html','Парус'),('bani/viking/index.html','Викинг'),('bani/kvadro-haus/index.html','Квадро Хаус')]],
31: [(x,'По вашему запросу бесплатно подберём индивидуальную комплектацию, подготовим планировку, чертёж и расчёт и пришлём вам.','Подберём комплектацию и бесплатно подготовим планировку и расчёт. Чертёж также пришлём по вашему запросу.') for x in ['index.html']+MODEL_URLS+['kontakty/index.html']],
32: [('index.html','Модель печи и расположение подсветки уточним при заказе.','')],
33: [('dostavka-i-ustanovka/index.html','Стоимость изделия, логистика и подготовка участка согласуются по отдельным строкам.','Расскажите, где будет стоять баня. Уточним подъезд, способ разгрузки и стоимость доставки до оформления заказа.')],
34: [('dostavka-i-ustanovka/index.html','Общая цена модели не определяет стоимость доставки на участок.','Стоимость доставки зависит от адреса и подъезда. Рассчитаем её для вашего участка.')],
35: [('dostavka-i-ustanovka/index.html','Возможность, маршрут, сроки и стоимость доставки подтверждаются индивидуально.','Укажите область и населённый пункт. Уточним доставку и разгрузку по вашему адресу.')],
36: [('kontakty/index.html','электронная почта из реквизитов. Для заявки используйте форму или телефон.','По вопросам заказа — форма на сайте или телефон. Электронная почта для обращений: Vologdagarant@yandex.ru.')],
37: [('kontakty/index.html','До оплаты уточните окончательный состав, сумму, сроки, порядок передачи и письменные условия гарантии.','До оформления заказа согласуем комплектацию, стоимость, сроки и условия передачи. Условия гарантии укажем в документах заказа.')],
38: [('voprosy/index.html','Срок изготовления и доставки согласуется для конкретного заказа.','Уточним ближайшую дату изготовления и доставки для выбранной комплектации и вашего адреса.')],
39: [('journal/banya-4-5-6-metrov/index.html','Оно не доказывает, сколько человек поместится внутри или какие помещения добавятся','Чтобы понять, сколько места будет внутри, сравните планировки выбранного размера')],
40: [('journal/dostavka-i-osnovanie/index.html','Единого готового решения по одной фотографии здесь нет.','Тип основания выбирают по требованиям выбранной бани и условиям участка.')],
41: [('journal/el-ili-sosna-dlya-bani/index.html','Доска с лунным пазом — это не круглый брус и не цельное бревно','Доски соединяются по профилю «лунный паз»')],
42: [('journal/ventilyatsiya-i-fortochka/index.html','Это общий инженерный принцип; схему из примера электрической сауны нельзя автоматически переносить на изделие с другой печью.','Для выбранной бани уточните схему вентиляции и порядок просушки: они зависят от печи и планировки.')],
43: [('app.mjs','Начнём с телефонного звонка, затем подготовим планировку и расчёт.','Расскажите, что важно в вашей бане. Уточним пожелания и подготовим подходящий вариант.')],
}

# These substitutions must operate only on HTML visible text; JSON and JS are plain source strings.
def patch_file(name, source):
 report=[]; updated=source
 for group,rows in REPLACEMENTS.items():
  for path,old,new in rows:
   if path!=name:continue
   if name.endswith('.mjs'):
    modified,count=replace_str(updated,old,new,visible=False)
   else:
    modified,count=replace_str(updated,old,new)
   updated=modified
   if count:report.append({'id':group,'result':'CHANGED','count':count,'old':old[:90]})
   else:
    present=new and (new in html.unescape(updated))
    report.append({'id':group,'result':'ALREADY' if present else 'NOT_FOUND','old':old[:90]})

 # Correct FAQ by adding clear composition before other questions
 if name in MODEL_URLS:
  # Audit #30: repeat of entire first-screen lead immediately below in scene section.
  scene=re.search(r'(<section class="r81-scenes"><h2>Когда подойдёт [^<]+</h2>)(<p>(.*?)</p>)',updated)
  if scene:
   description=html.unescape(scene.group(3)).strip()
   preceding=html.unescape(updated[:scene.start()])
   if description and description in preceding:
    updated=updated[:scene.start()]+scene.group(1)+updated[scene.end():]
    report.append({'id':30,'result':'CHANGED','reason':'Repeated lead removed'})
   else:report.append({'id':30,'result':'ALREADY_OR_DISTINCT'})
  else:report.append({'id':30,'result':'ALREADY_OR_UNCHANGED'})

 if name=='voprosy/index.html':
  faq=('''<details class="r83-comfort-faq" id="comfort-included-faq"><summary>Что входит в комплектацию Комфорт?<span aria-hidden="true" class="plus">+</span></summary>'''
       '<p>Комфорт — стандартная оснащённая баня, не пустой корпус. В указанную стоимость уже входят:</p><ul>'
       +''.join('<li>'+html.escape(item)+'</li>' for item in MODEL_KIT)+'</ul>'
       '<p>В Квадро предусмотрен центральный вход, в Викинге — арочный. В цену Квадро Хауса также включена сборка на участке. Доставка, разгрузка, основание и внешние подключения рассчитываются отдельно.</p></details>')
  if 'id="comfort-included-faq"' not in updated:
   m=re.search(r'<div class="faq-list">',updated)
   if m:
    updated=updated[:m.end()]+faq+updated[m.end():];report.append({'id':'COMFORT_FAQ','result':'CHANGED'})
   else:report.append({'id':'COMFORT_FAQ','result':'NOT_FOUND'})
  else:report.append({'id':'COMFORT_FAQ','result':'ALREADY'})
  # Correct FAQ main first answer's final base name; preserves already updated paragraphs
  updated,_=replace_visible(updated,'Дополнения к базе показаны отдельно.','Дополнения к Комфорту можно выбрать отдельно.')
  updated,_=replace_visible(updated,'Что входит в указанную цену?','Что уже включено в Комфорт?')
  updated,_=replace_visible(updated,'Печь, дымоход и штатный бак входят в базу.','Печь, дымоход и штатный бак входят в Комфорт.')
  updated,_=replace_visible(updated,'баня с базовым оснащением','баня в комплектации Комфорт')
  updated,_=replace_visible(updated,'Для Квадро Хаус сборка на участке бани уже включена в показанные цены','Для Квадро Хауса сборка на участке уже включена в показанные цены')
  updated,_=replace_visible(updated,'Для Квадро Хаус в опубликованную сумму также входит сборка на участке на участке','Для Квадро Хауса в опубликованную сумму также включена сборка на участке')
  updated,_=replace_visible(updated,'в опубликованную сумму также входит сборка на участке на участке','в опубликованную сумму также входит сборка на участке')

 if name in MODEL_URLS:
  model=name.split('/')[1]
  section=('''<section class="r83-comfort-block" id="comfort-included" aria-labelledby="r83-comfort-title"><div class="r83-comfort-head"><p class="r83-comfort-overline">Оснащение без доплат за основные элементы</p><h2 id="r83-comfort-title">Что входит в Комфорт</h2><p>В стандартную цену включена готовая баня с печью и основным оснащением парной и комнаты отдыха.</p></div>'''
     '<ul class="r83-comfort-list">'+''.join('<li>'+html.escape(x)+'</li>' for x in MODEL_KIT)+'</ul>'
     '<p class="r83-comfort-specific">'+html.escape(MODEL_SPEC[model])+'</p>'
     '<p class="r83-comfort-separator">Доставку, разгрузку, основание и внешние подключения рассчитаем по вашему адресу.</p>'
     '<a class="r83-comfort-next" href="/#configure">Рассчитать свою баню →</a></section>')
  if 'id="comfort-included"' not in updated:
   m=re.search(r'<h2 class="r81-prices-heading">',updated)
   if m:
    updated=updated[:m.start()]+section+updated[m.start():];report.append({'id':'COMFORT_MODEL','result':'CHANGED'})
   else:report.append({'id':'COMFORT_MODEL','result':'NOT_FOUND'})
  else:report.append({'id':'COMFORT_MODEL','result':'ALREADY'})
  if '<style id="r83-comfort-style">' not in updated:
   css='<style id="r83-comfort-style">.r83-comfort-block{margin:2rem 0;padding:clamp(1.1rem,3vw,2.2rem);background:#f7f6f0;color:#273c32;border:1px solid #d6ded4;border-radius:20px}.r83-comfort-block h2{margin:.3rem 0 1rem;font-size:clamp(1.45rem,2.4vw,2rem)}.r83-comfort-overline{font-size:.85rem;letter-spacing:.04em;text-transform:uppercase}.r83-comfort-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem 1.8rem;padding-left:1.2rem;margin:1.3rem 0}.r83-comfort-list li{line-height:1.5}.r83-comfort-specific{font-weight:650}.r83-comfort-separator{font-size:.94rem;opacity:.85}.r83-comfort-next{display:inline-block;padding:.7rem 1rem;border:1px solid currentColor;border-radius:8px;font-weight:650;margin-top:.45rem}@media(max-width:650px){.r83-comfort-list{grid-template-columns:1fr}.r83-comfort-block{padding:1.1rem}}</style>'
   if '</head>' in updated:
    updated=updated.replace('</head>',css+'</head>',1)
  # clear short within-card callout, link to composition to expose answer near price
  if 'href="#comfort-included"' not in updated:
   p=re.search(r'(<p class="r81-included-assembly">[^<]+</p>)',updated)
   if p: updated=updated[:p.end()]+'<p class="r83-quick-comfort"><a href="#comfort-included">Что входит в Комфорт ↓</a></p>'+updated[p.end():]

 if name=='journal/kak-chitat-komplektatsiyu-bani/index.html':
  if 'id="comfort-guide"' not in updated:
   piece='<section id="comfort-guide" class="r83-article-kit"><h2>Комфорт: что входит в стандартную баню</h2><p>Комфорт — прежняя База с основным оснащением: печью, дымоходом и баком, полками, лавками, окнами и дверями, освещением и электрикой, вентиляцией, сливом и конструкцией пола. Окончательные размеры и исполнение деталей указываются в спецификации выбранной модели.</p><p>Делюкс для Квадро 5 м — уже расширенная комплектация: 505 000 ₽ за Комфорт плюс 113 022 ₽ дополнений, итого 618 022 ₽.</p><p><a href="/voprosy/#comfort-included-faq">Посмотреть полный список Комфорт →</a></p></section>'
   pos=re.search(r'<section\b',updated)
   if pos:updated=updated[:pos.start()]+piece+updated[pos.start():];report.append({'id':'COMFORT_ARTICLE','result':'CHANGED'})

 if name=='journal/iz-chego-skladyvaetsya-tsena/index.html':
  updated,_=replace_visible(updated,'База, оснащение, доставка и основание:','Комфорт, дополнительные удобства, доставка и основание:')
 if name=='journal/banya-4-5-6-metrov/index.html':
  updated,_=replace_visible(updated,'цены бань с базовым оснащением','цены бань в комплектации Комфорт')
  updated,_=replace_visible(updated,'базовую цену','цену Комфорта')
 if name=='journal/banya-4-5-6-metrov/index.html':
  updated,_=replace_visible(updated,'Квадро 6 м в базе','Квадро 6 м в Комфорте')
  updated,_=replace_visible(updated,'уже включают обязательную сборку','уже включают сборку на участке')
 if name=='journal/ventilyatsiya-i-fortochka/index.html':
  updated,_=replace_visible(updated,'входит в оснащённую базу','входит в стандартную комплектацию Комфорт')
 if name=='journal/kvadro-5-komfort/index.html':
  updated,_=replace_visible(updated,'составу базы','составу Комфорта')
  updated,_=replace_visible(updated,'по открытому списку дополнений','по списку выше')
 if name=='journal/kvadro-5-komfort/index.html':
  updated,_=replace_visible(updated,'Также в базе учтены','Также в Комфорте предусмотрены')
 if name=='raboty/index.html':
  updated,_=replace_visible(updated,'Фотографии десяти реальных бань','Фотографии готовых бань')
  updated,_=replace_visible(updated,'Реальные бани: фотографии готовых объектов','Готовые бани: фотографии выполненных работ')
  updated,_=replace_visible(updated,'Дача Пар · реальные работы','Дача Пар · фотографии бань')
 # Visible one-line "Comfort includes" in model cards on homepage and catalog.
 if name=='index.html' and 'class="r83-model-preview"' not in updated:
  def inject_home(m):
   model=m.group(1); start=m.group(2); middle=m.group(3)
   if 'class="r83-model-preview"' in middle:return m.group(0)
   preview='<p class="r83-model-preview">Комфорт уже с печью, полками, светом и электрикой. <a href="/bani/'+('kvadro-haus' if model=='kvadro-house' else model)+'/#comfort-included">Весь состав →</a></p>'
   end='<p class="model-description">'
   if end not in middle:return m.group(0)
   return '<article class="model-item" data-model-card="'+model+'"'+start+middle.replace(end,preview+end,1)+'</article>'
  updated,n=re.subn(r'<article class="model-item" data-model-card="([^"]+)"([^>]*)>(.*?)</article>',inject_home,updated,flags=re.S)
  if n:
   style='<style id="r83-home-preview-style">.r83-model-preview{font-size:.88rem;line-height:1.45;margin:.45rem 0 .8rem;opacity:.92}.r83-model-preview a{text-decoration:underline;text-underline-offset:3px}</style>'
   if '</head>' in updated:updated=updated.replace('</head>',style+'</head>',1)
   report.append({'id':'COMFORT_HOMECARDS','result':'CHANGED','count':n})
 if name=='bani/index.html' and 'class="r83-catalog-kit"' not in updated:
  def inject_cat(m):
   body=m.group(1)
   if 'class="r83-catalog-kit"' in body:return m.group(0)
   return '<a class="journal-card"'+body.replace('</strong>', '</strong><small class="r83-catalog-kit">Комфорт: печь, полки, освещение и электрика. Полный состав — на странице модели.</small>',1)+'</a>'
  updated,n=re.subn(r'<a class="journal-card"(.*?)</a>',inject_cat,updated,flags=re.S)
  if n:
   style='<style id="r83-catalog-kit-style">.r83-catalog-kit{display:block;line-height:1.45;margin:.55rem 0;font-weight:500;opacity:.9}</style>'
   if '</head>' in updated:updated=updated.replace('</head>',style+'</head>',1)
   report.append({'id':'COMFORT_CATALOG_CARDS','result':'CHANGED','count':n})

 # Avoid awkward repeated prepositions from legacy mentions of assembly.
 if name.endswith('.html'):
  for old,new in [
   ('сборка на участке на участке','сборка на участке'),
   ('сборка на участке бани','сборка бани на участке'),
   ('со сборкой на участке на участке','со сборкой на участке'),
  ]:
   updated,_=replace_visible(updated,old,new)
 # JSON viking user facing note only
 if name=='viking-built-media/catalog.json':
  try:
   obj=json.loads(updated)
   changed=0
   def visit(v):
    nonlocal changed
    if isinstance(v,dict):
     for k,x in v.items():
      if k=='note' and isinstance(x,str):
       y=x.replace('Размер этого объекта уточняется.','Подберём размер, отделку и оснащение под ваш участок.')
       y=y.replace('Фотографии парной этой серии не предоставлены.','')
       y=re.sub(r'\s+',' ',y).strip()
       if y!=x:v[k]=y;changed+=1
      elif isinstance(x,(dict,list)):visit(x)
    elif isinstance(v,list):
     for x in v:visit(x)
   visit(obj)
   if changed:
    updated=json.dumps(obj,ensure_ascii=False,indent=2)+'\n'
    report.append({'id':5,'result':'CHANGED','count':changed})
    report.append({'id':6,'result':'CHANGED','count':changed})
   else:
    report.append({'id':5,'result':'ALREADY_OR_UNCHANGED'})
    report.append({'id':6,'result':'ALREADY_OR_UNCHANGED'})
  except (json.JSONDecodeError,UnicodeError):report.append({'id':5,'result':'INVALID_JSON'})
 return updated,report

def run(root,report_path=None):
 root=Path(root)
 changed=[]; groups=defaultdict(list); warnings=[]
 for f in sorted(EDITABLE):
  p=root/f
  if not p.exists():
   warnings.append('MISSING:'+f);continue
  try: original=p.read_text(encoding='utf-8')
  except UnicodeDecodeError as e: warnings.append('UTF8_ERROR:'+f);continue
  updated,entries=patch_file(f,original)
  for x in entries:groups[str(x['id'])].append({'file':f,**x})
  if updated!=original:
   p.write_text(updated,encoding='utf-8');changed.append(f)
 # mandatory: leave prices, calculation and security unchanged by construction
 for f in ('quote.mjs','lead-client.mjs','data/catalog-pricebook.json','manager.html','privacy.html','consent.html'):
  if f in changed:raise RuntimeError('PROTECTED_FILE_CHANGED_'+f)
 data={'status':'LOCAL_PATCH_CREATED','changed_files':changed,'changed_count':len(changed),'groups':dict(groups),'warnings':warnings}
 if report_path:Path(report_path).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 return data

if __name__=='__main__':
 import argparse
 a=argparse.ArgumentParser();a.add_argument('root');a.add_argument('--report');x=a.parse_args()
 print(json.dumps(run(x.root,x.report),ensure_ascii=False))

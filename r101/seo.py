"""Search metadata uses only confirmed business facts and visible page content."""
from html import unescape
import re
ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
ALIASES={'/ceny/':'/bani/','/komplektacii/':'/komplektaciya/','/404-temp/':'/404.html'}
AREAS=[{'@type':'City','name':'Москва'}]+[{'@type':'AdministrativeArea','name':name} for name in ['Московская область','Вологодская область','Ярославская область','Ленинградская область']]
DESCRIPTIONS={
 '/':'Готовые бани с печью, полками, мебелью и светом в комплектации Комфорт. Производство в Вологде. Доставка в Москву, Подмосковье, Вологодскую, Ярославскую и Ленинградскую области.',
 '/bani/':'Четыре модели готовых бань ДачаПар: Квадро, Парус, Викинг и Квадро Хаус. Все размеры и цены Комфорта, примеры планировок и помощь с выбором.',
 '/komplektaciya/':'Что входит в комплектацию Комфорт: печь, обустройство парной, мебель, свет, электрика, окна и вентиляция. Варианты дополнительного оснащения вашей бани.',
 '/planirovki/':'Восемь примеров планировок бань ДачаПар: парная, отдых и душевая зона. По два варианта для каждой модели. Поможем продумать пространство под ваши привычки.',
 '/dostavka-i-ustanovka/':'Доставка и размещение готовой бани на вашем участке. Производство в Вологде, поставки в пять регионов. Бесплатная консультация по подъезду, месту и подготовке участка.',
 '/regiony/':'Производство бань ДачаПар в Вологде. Доставка в Москву и Подмосковье, Вологодскую, Ярославскую и Ленинградскую области. Модели, цены и консультация по размещению.',
 '/kontakty/':'Свяжитесь с ДачаПар: +7 (951) 734-99-99. Производство в Вологде. Поможем выбрать готовую баню и подготовим предложение с доставкой по вашему адресу.',
 '/compare/':'Сравните четыре модели бань ДачаПар: габариты, форму, включённое оснащение и цены Комфорта. Выберите размер или получите помощь с подбором.',
 '/voprosy/':'Ответы на вопросы о готовых банях ДачаПар: цена Комфорта, планировки, дополнительное оснащение, доставка и персональное предложение.',
 '/journal/':'Статьи ДачаПар о выборе бани для дачи: размеры, комплектация, древесина, доставка, проветривание и уход. Понятные ответы перед заказом.'}

def canonical_path(path):return ALIASES.get(path,path)
def metadata(path,title,description,body_text):
 path=canonical_path(path)
 description=description or DESCRIPTIONS.get(path) or body_text or title
 description=re.sub(r'\s+',' ',unescape(description)).strip()
 if len(description)>260:description=description[:257].rsplit(' ',1)[0]+'.'
 return title,description,path

def structured(path,title,description,extra=None):
 canonical=ORIGIN+canonical_path(path)
 organization={'@type':'Organization','@id':ORIGIN+'/#organization','name':'ДачаПар','url':ORIGIN+'/','telephone':'+79517349999','areaServed':AREAS,
  'location':{'@type':'Place','name':'Производство ДачаПар','address':{'@type':'PostalAddress','addressLocality':'Вологда','addressRegion':'Вологодская область','addressCountry':'RU'}}}
 website={'@type':'WebSite','@id':ORIGIN+'/#website','url':ORIGIN+'/','name':'ДачаПар','inLanguage':'ru-RU','publisher':{'@id':ORIGIN+'/#organization'}}
 page={'@type':'WebPage','@id':canonical+'#webpage','url':canonical,'name':title,'description':description,'inLanguage':'ru-RU','isPartOf':{'@id':ORIGIN+'/#website'}}
 graph=[organization,website,page]
 if path!='/':
  crumbs=[('Главная','/')]
  if path.startswith('/bani/') and path!='/bani/':crumbs.append(('Бани и цены','/bani/'))
  if path.startswith('/journal/') and path!='/journal/':crumbs.append(('Журнал','/journal/'))
  crumbs.append((title,canonical_path(path)))
  graph.append({'@type':'BreadcrumbList','@id':canonical+'#breadcrumbs','itemListElement':[{'@type':'ListItem','position':i,'name':name,'item':ORIGIN+url} for i,(name,url) in enumerate(crumbs,1)]})
  page['breadcrumb']={'@id':canonical+'#breadcrumbs'}
 if path.startswith('/journal/') and path!='/journal/':graph.append({'@type':'Article','@id':canonical+'#article','headline':title,'description':description,'inLanguage':'ru-RU','mainEntityOfPage':{'@id':canonical+'#webpage'},'author':{'@id':ORIGIN+'/#organization'},'publisher':{'@id':ORIGIN+'/#organization'}})
 if extra:
  extra={k:v for k,v in extra.items() if k!='@context'}
  extra['@id']=canonical+'#product';extra['url']=canonical;extra['brand']={'@type':'Brand','name':'ДачаПар'}
  if 'offers' in extra:extra['offers']={**extra['offers'],'url':canonical}
  graph.append(extra);page['mainEntity']={'@id':extra['@id']}
 return {'@context':'https://schema.org','@graph':graph}

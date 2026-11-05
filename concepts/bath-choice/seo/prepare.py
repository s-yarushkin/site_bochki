from pathlib import Path
import hashlib,json,re,shutil,xml.etree.ElementTree as ET,zipfile
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
AUDIT=ROOT/'output/seo-audit-20261105';OUT=ROOT/'output/seo-update-20261105';SITE=OUT/'package/site'
ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def clean(value):
 if isinstance(value,dict):return {k:clean(v) for k,v in value.items() if k!='preFinalComfortPriceRub'}
 if isinstance(value,list):return [clean(v) for v in value]
 return value
def main():
 SITE.mkdir(parents=True,exist_ok=True);before={};changed_pages=set()
 def write(rel,text,source=None):
  p=SITE/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text,'utf8',newline='\n')
  before[rel]=sha(source) if source else None
 source=AUDIT/'public/index.html';page=source.read_text('utf8')
 bases=json.loads((ROOT/'concepts/bath-choice/pricing/public-package-base.json').read_text('utf8'))['models']
 names={'kvadro':'Квадро','parus':'Парус','viking':'Викинг','kvadro-house':'Квадро Хаус'}
 products=[];fallback=[]
 for model,sizes in bases.items():
  key=next(iter(sizes));price=sizes[key]['comfortCents']//100;slug='kvadro-haus' if model=='kvadro-house' else model
  url=ORIGIN+'/bani/'+slug+'/'
  asset='house' if model=='kvadro-house' else model
  products.append({'@type':'Product','@id':url+'#comfort','name':'Баня '+names[model]+' в комплектации «Комфорт»','url':url,'image':ORIGIN+'/choice/assets/'+asset+'-1920.webp','brand':{'@type':'Brand','name':'ДачаПар'},'offers':{'@type':'Offer','price':str(price),'priceCurrency':'RUB','url':url}})
  fallback.append(f'<li><a href="/bani/{slug}/">{names[model]}</a> — от {price:,} ₽ в комплектации «Комфорт».</li>'.replace(',',' '))
 schema='<script type="application/ld+json">'+json.dumps({'@context':'https://schema.org','@graph':products},ensure_ascii=False)+'</script>'
 page=page.replace('</head>',schema+'\n</head>')
 page=page.replace('</main>','<noscript><section aria-label="Модели и цены"><h2>Бани в комплектации «Комфорт»</h2><ul>'+''.join(fallback)+'</ul><p>Бесплатно подготовим планировку под ваши пожелания. Доставку и основание рассчитаем для вашего участка.</p></section></noscript></main>')
 page=page.replace('/choice/app.mjs?v=phone-callback-20261105','/choice/app.mjs?v=seo-20261105')
 write('index.html',page,source);changed_pages.add(ORIGIN+'/')
 # The tested release already contains the phone fix. Only change comparison cache URLs.
 old=ROOT/'output/callback-fix/package/site'
 for rel,find,replacement in [('choice/app.mjs',"'./comparison.mjs'","'./comparison.mjs?v=seo-20261105'"),('choice/comparison.mjs',"'./packages.mjs'","'./packages.mjs?v=seo-20261105'")]:
  src=old/rel;text=src.read_text('utf8');assert text.count(find)==1;write(rel,text.replace(find,replacement),src)
 src=ROOT/'concepts/bath-choice/packages.mjs';original=old/'choice/packages.mjs'
 write('choice/packages.mjs',src.read_text('utf8'),original)
 for rel,file in [('data/catalog-pricebook.json','catalog-pricebook.json'),('data/r85-public-pricebook.json','r85-public-pricebook.json'),('choice/catalog-pricebook.json','choice-pricebook.json')]:
  src=AUDIT/file;data=json.loads(src.read_text('utf8'));new=clean(data);assert new!=data
  write(rel,json.dumps(new,ensure_ascii=False,indent=2)+'\n',src)
  assert json.loads((SITE/rel).read_text('utf8'))==clean(data)
 # Build from canonical, indexable documents only; preserve true old modification dates.
 oldmap=ET.parse(AUDIT/'public/sitemap.xml');ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}
 dates={u.find('s:loc',ns).text:u.find('s:lastmod',ns).text for u in oldmap.getroot() if u.find('s:lastmod',ns) is not None}
 urls=[]
 for file in sorted((AUDIT/'public').rglob('*.html')):
  t=file.read_text('utf8');head=t.split('</head>')[0]
  if re.search(r'<meta[^>]*noindex',head,re.I):continue
  canonical=re.search(r'<link\b(?=[^>]*rel=[\"\x27]canonical)(?=[^>]*href=[\"\x27]([^\"\x27]+))[^>]*>',head,re.I)
  if not canonical:continue
  rel=file.relative_to(AUDIT/'public').as_posix();url=ORIGIN+('/' if rel=='index.html' else '/'+rel.removesuffix('index.html'))
  if canonical[1]!=url:continue
  urls.append(url)
 assert len(urls)==len(set(urls))==31
 ET.register_namespace('',ns['s']);tree=ET.Element('{'+ns['s']+'}urlset')
 for url in sorted(urls):
  node=ET.SubElement(tree,'url');ET.SubElement(node,'loc').text=url
  date='2026-11-05' if url in changed_pages else dates.get(url)
  if date:ET.SubElement(node,'lastmod').text=date
 ET.indent(tree);xml='<?xml version="1.0" encoding="UTF-8"?>\n'+ET.tostring(tree,encoding='unicode')+'\n'
 write('sitemap.xml',xml,AUDIT/'public/sitemap.xml')
 robots=(AUDIT/'public/robots.txt').read_text('utf8').replace('yclid&callback&request /','yclid&callback&request&bath&bathSize&package&layout /')
 write('robots.txt',robots,AUDIT/'public/robots.txt')
 llms='# ДачаПар\n\nАктуальные сведения на 05.11.2026.\n\nМодели и стартовые цены в комплектации «Комфорт»:\n'
 for product in products:llms+='- '+product['name']+': от '+product['offers']['price']+' ₽. '+product['url']+'\n'
 llms+='\nВ комплектации «Комфорт» предусмотрены печь с дымоходом и камнями, полки, мебель, свет и вентиляция. В комплектации «Делюкс» — расширенное оснащение. По вашему желанию сделаем стол откидным, если позволяют его размеры.\n\nБесплатно подготовим планировку под ваши пожелания. Производство — в среднем 25 календарных дней; сборка на участке — в среднем 2–3 дня, в зависимости от размеров и конфигурации. Доставку и основание рассчитываем для участка.\n\nАктуальные варианты: '+ORIGIN+'/#bath-model\nКомплектации: '+ORIGIN+'/komplektaciya/\nДоставка: '+ORIGIN+'/dostavka-i-ustanovka/\nКонтакты: '+ORIGIN+'/kontakty/\nКарта сайта: '+ORIGIN+'/sitemap.xml\n\nИсторические справочные значения не являются действующими ценами.\n'
 write('llms.txt',llms,AUDIT/'public/llms.txt' if (AUDIT/'public/llms.txt').exists() else None)
 manifest={'baseline':'/srv/sites/dachapar-preview/releases/BC-45bb11dcf8b51b79','before':before,'files':{p:sha(SITE/p) for p in before},'urls':sorted(urls),'metadataOnlyPriceFiles':['data/catalog-pricebook.json','data/r85-public-pricebook.json','choice/catalog-pricebook.json']}
 package=SITE.parent;(package/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,sort_keys=True,indent=2)+'\n','utf8');shutil.copy2(HERE/'install.py',package/'install.py')
 digest=sha(package/'manifest.json')[:16];archive=OUT/f'seo-{digest}.zip'
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
  for p in sorted(package.rglob('*')):
   if p.is_file():z.write(p,p.relative_to(package).as_posix())
 report={'id':digest,'sha256':sha(archive),'archive':str(archive),'files':len(before),'sitemapUrls':len(urls),'remote':'/tmp/dachapar-seo-'+digest,'candidate':'/srv/sites/dachapar-preview/releases/SEO-'+digest}
 (OUT/'package-info.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8');print(json.dumps(report,ensure_ascii=False))
if __name__=='__main__':main()

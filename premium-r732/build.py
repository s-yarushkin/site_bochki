"""Deterministic R73.2 content overlay, using the exact public R73.1 baseline.

Standard library only: same code runs locally, on Windows and in the installer.
Never reads customer records or changes photos/plans/pricing/application modules.
"""
import argparse
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from html import escape
from pathlib import Path

import content as c

ROOT=Path(__file__).resolve().parent
MANIFEST=json.loads((ROOT/'baseline-manifest.json').read_text(encoding='utf-8'))
ORIGIN=MANIFEST['origin']
MARKER='r732-text-only-2026-10-21'
SCHEMA=re.compile(r'<script\b[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',re.S)
MAJOR={'index.html','bani/index.html','compare/index.html','voprosy/index.html','kontakty/index.html','dostavka-i-ustanovka/index.html','journal/index.html'}
MAJOR.update('bani/'+s+'/index.html' for s in c.SLUGS.values())
MAJOR.update('journal/'+s+'/index.html' for s in ['kak-vybrat-gotovuyu-banyu','iz-chego-skladyvaetsya-tsena','kvadro-5-komfort','dostavka-i-osnovanie'])

def require(ok,code):
    if not ok:raise RuntimeError(code)

def sha(raw):return hashlib.sha256(raw).hexdigest()

def one(s,old,new,code):
    require(s.count(old)==1,code+'_COUNT_'+str(s.count(old)))
    return s.replace(old,new,1)

def span(s,tag,attribute='',value=''):
    matches=[]
    for m in re.finditer(r'<'+tag+r'\b[^>]*>',s):
        attrs=dict(re.findall(r'([\w-]+)="([^"]*)"',m.group(0)))
        if not attribute or (value in attrs.get(attribute,'').split() if attribute=='class' else attrs.get(attribute)==value):matches.append(m)
    require(len(matches)==1,'ELEMENT_ANCHOR_'+tag+'_'+value+'_'+str(len(matches)))
    start=matches[0].start();depth=0
    for m in re.finditer(r'</?'+tag+r'\b[^>]*>',s[start:]):
        depth+=-1 if m.group(0).startswith('</') else 1
        if depth==0:return start,start+m.end()
    raise RuntimeError('UNCLOSED_ELEMENT_'+tag+'_'+value)

def element(s,tag,attribute='',value=''):
    a,b=span(s,tag,attribute,value);return s[a:b]

def replace_element(s,tag,attribute,value,new):
    a,b=span(s,tag,attribute,value);return s[:a]+new+s[b:]

def append_main(s,block):return one(s,'</main>',block+'</main>','MAIN_END')

def objects(x):
    if isinstance(x,dict):
        yield x
        for v in x.values():yield from objects(v)
    elif isinstance(x,list):
        for v in x:yield from objects(v)

def global_schema(s,major=False):
    def change(m):
        graph=json.loads(m.group(1))
        for o in objects(graph):
            if o.get('@type')=='Organization' and o.get('@id')==ORIGIN+'/#organization':o['areaServed']=c.REGIONS
            if major and o.get('@type')=='Article':o['dateModified']=c.DATE
        return m.group(0).replace(m.group(1),json.dumps(graph,ensure_ascii=False,separators=(',',':')))
    return SCHEMA.sub(change,s)

def global_changes(s,path,major=False):
    require(MARKER not in s,'ALREADY_APPLIED_'+path)
    s=global_schema(s,major)
    s=one(s,'</head>','<meta name="dachapar-content-release" content="'+MARKER+'"><link rel="stylesheet" href="/r732-content.css?v=r732-20261021"></head>','HEAD')
    footer=element(s,'footer');new=footer
    old=ORIGIN+'/privacy.html'
    require(new.count('href="/voprosy/"')==0,'FAQ_LINK_ALREADY_PRESENT')
    # Keep the already approved contact/privacy/legal URLs; add navigable FAQ.
    needle=re.search(r'<a\b[^>]*href="'+re.escape(old)+r'"[^>]*>',new)
    require(needle is not None,'FOOTER_PRIVACY_ANCHOR')
    new=new[:needle.start()]+c.link('/voprosy/','Вопросы и ответы')+new[needle.start():]
    old_region='+7 (951) 734-99-99 · Доставка обсуждается для вашего населённого пункта'
    if old_region in new:new=one(new,old_region,c.FOOTER_REGION,'FOOTER_REGIONS')
    return one(s,footer,new,'FOOTER_BLOCK')

def home(s,book):
    s=replace_element(s,'div','class','faq-list',c.faq_html(book))
    block=element(s,'section','id','questions')
    fixed=block[:-len('</section>')]+c.p(c.link('voprosy/','Все вопросы о выборе, доставке и заказе'))+'</section>'
    return one(s,block,fixed,'HOME_FAQ')

def models(s,book,model):
    s=replace_element(s,'section','class','model-page-extra',c.model_content(book,model))
    s=replace_element(s,'section','class','dp-model-truth','')
    s=one(s,'<div class="model-page-grid">','<div class="model-page-grid" id="r732-size-prices">','PRICE_ANCHOR')
    crumb=element(s,'nav','class','breadcrumbs')
    replacement=one(crumb,'<a href="../../#models">Коллекция</a>','<a href="../">Каталог бань</a>','MODEL_BREADCRUMB')
    s=one(s,crumb,replacement,'BREADCRUMB_BLOCK')
    # Product row CTAs keep their exact known model/size destinations.
    s=one(s,'<meta property="og:type" content="article">','<meta property="og:type" content="website">','MODEL_OG_TYPE')
    return s

def comparison(s,book):
    s=one(s,'Цена изделия от','Цена с базовым оснащением от','COMPARE_PRICE_LABEL')
    old='Стоимость с базовым оснащением по каталогу от 20 октября 2026. Доставка, разгрузка, основание и внешние подключения согласуются отдельно. Для «Квадро Хаус» монтаж 10% базы уже учтён в показанных ценах.'
    new='Для Квадро, Паруса и Викинга показана цена бани с базовым оснащением. Для Квадро Хаус сумма включает обязательную сборку на участке. Доставка, разгрузка, основание и внешние подключения рассчитываются отдельно.'
    s=one(s,old,new,'COMPARE_ASSEMBLY')
    s=replace_element(s,'div','class','delivery-grid','')
    return replace_element(s,'section','class','model-page-extra',c.compare_content(book))

def faq(s,book):
    s=replace_element(s,'div','class','faq-list',c.faq_html(book,full=True))
    return one(s,'<h1>Ответы на ваши вопросы.</h1>','<h1>Вопросы о готовых банях</h1>','FAQ_H1')

def journal(s,articles):
    cards=''.join('<a class="journal-card journal-card--text-only r732-new-story" data-category="'+a['category']+'" href="../journal/'+a['slug']+'/"><span class="article-category">'+a['category']+' · '+str(a['minutes'])+' минут чтения</span><h3>'+a['title']+'</h3>'+c.p(a['description'])+'<span class="read-story">Читать</span></a>' for a in articles)
    m=re.search(r'<div\b[^>]*\bid="journal-index"[^>]*>',s)
    require(m is not None,'JOURNAL_LIST_ANCHOR')
    return s[:m.end()]+cards+s[m.end():]

def existing_article(s,book,slug):
    addition=c.existing_article_additions(book,slug)
    if addition:s=one(s,'</article>',addition+'</article>','ARTICLE_END_'+slug)
    if addition:
        meta=element(s,'div','class','article-meta')
        # Retain publication date; visibly identify this actual content update.
        s=one(s,meta,meta[:-6]+' · Обновлено '+c.DATE_RU+'</div>','ARTICLE_UPDATE_DATE')
    return s

def set_meta(s,key,value,prop=False):
    found=[]
    def update(m):
        attrs=dict(re.findall(r'([\w-]+)="([^"]*)"',m.group(0)))
        if attrs.get('property' if prop else 'name')!=key:return m.group(0)
        found.append(True)
        return re.sub(r'(\bcontent=")[^"]*(")',lambda a:a.group(1)+escape(value,quote=True)+a.group(2),m.group(0))
    s=re.sub(r'<meta\b[^>]*>',update,s)
    require(len(found)==1,'META_ANCHOR_'+key)
    return s

def new_article(template,a):
    s=template;url=ORIGIN+'/journal/'+a['slug']+'/'
    s,n=re.subn(r'<title>.*?</title>','<title>'+escape(a['title'])+' | Дача Пар</title>',s,flags=re.S)
    require(n==1,'ARTICLE_TITLE')
    s=set_meta(s,'description',a['description'])
    s=set_meta(s,'og:title',a['title'],True)
    s=set_meta(s,'og:description',a['description'],True)
    s=set_meta(s,'og:url',url,True)
    s,n=re.subn(r'<link\b(?=[^>]*\brel="canonical")[^>]*>','<link rel="canonical" href="'+url+'">',s)
    require(n==1,'NEW_CANONICAL')
    # New articles are text-only, including their own metadata; no new photo use.
    s=re.sub(r'<meta\b[^>]*property="og:image"[^>]*>','',s)
    graph={'@context':'https://schema.org','@graph':[
        {'@type':'Organization','@id':ORIGIN+'/#organization','name':'Дача Пар','url':ORIGIN+'/','telephone':'+79517349999','areaServed':c.REGIONS},
        {'@type':'Article','headline':a['title'],'description':a['description'],'url':url,'mainEntityOfPage':url,'inLanguage':'ru-RU','datePublished':c.DATE,'dateModified':c.DATE,'author':{'@type':'Organization','name':'Редакция Дача Пар'},'publisher':{'@id':ORIGIN+'/#organization'}},
        {'@type':'BreadcrumbList','itemListElement':[
            {'@type':'ListItem','position':1,'name':'Главная','item':ORIGIN+'/'},
            {'@type':'ListItem','position':2,'name':'Журнал о бане','item':ORIGIN+'/journal/'},
            {'@type':'ListItem','position':3,'name':a['title'],'item':url},
        ]}
    ]}
    s,n=SCHEMA.subn('<script type="application/ld+json">'+json.dumps(graph,ensure_ascii=False,separators=(',',':'))+'</script>',s)
    require(n==1,'NEW_ARTICLE_SCHEMA')
    body='<main class="wrap content-shell" id="content"><nav class="breadcrumbs" aria-label="Навигационная цепочка">'+c.link('../../','Главная')+'<span aria-hidden="true">/</span>'+c.link('../','Журнал о бане')+'<span aria-hidden="true">/</span><span aria-current="page">'+a['category']+'</span></nav>'
    body+='<header class="content-header"><p class="eyebrow">'+a['category']+'</p><h1>'+a['title']+'</h1>'+c.p(a['description'])+'<div class="article-meta">Редакция Дача Пар · '+c.DATE_RU+' · '+str(a['minutes'])+' минут чтения</div></header>'
    body+='<div class="article-layout"><article class="article-body"><p class="quick-answer">'+a['answer']+'</p>'
    body+=''.join(c.section(title,content,ident) for ident,title,content in a['sections'])
    body+=c.callout(*a['cta'])+'</article><aside class="article-sidebar" aria-label="Содержание"><p>В материале</p>'
    body+=''.join(c.link('#'+ident,title) for ident,title,_ in a['sections'])+'</aside></div></main>'
    return replace_element(s,'main','','',body)

def load_baseline(source):
    raw={}
    for path,expected in MANIFEST['files'].items():
        p=source/path
        require(p.is_file() and not p.is_symlink(),'SOURCE_FILE_MISSING_'+path)
        value=p.read_bytes();require(sha(value)==expected['sha256'],'SOURCE_CHANGED_'+path)
        raw[path]=value
    return raw

def render(source):
    raw=load_baseline(source);book=json.loads(raw['data/catalog-pricebook.json'])
    require(book['version']=='2026-10-19-v74-sheet-round-up-5000-r1','PRICEBOOK_VERSION_CHANGED')
    require(sum(len(v) for v in book['prices'].values())==20,'SKU_COUNT_CHANGED')
    require(book['models']['kvadro']['widthM']==2.1 and book['models']['parus']['widthM']==2.4 and book['models']['viking']['widthM']==2.4,'MODEL_WIDTH_CHANGED')
    articles=c.article_data(book);outputs={}
    for path,value in raw.items():
        if not path.endswith('.html'):continue
        s=value.decode('utf-8')
        if path=='index.html':s=home(s,book)
        elif path=='bani/index.html':s=append_main(s,c.catalog_content(book))
        elif path.startswith('bani/'):
            slug=path.split('/')[1];model=next(k for k,v in c.SLUGS.items() if v==slug);s=models(s,book,model)
        elif path=='compare/index.html':s=comparison(s,book)
        elif path=='voprosy/index.html':s=faq(s,book)
        elif path=='dostavka-i-ustanovka/index.html':s=append_main(s,c.delivery_content())
        elif path=='kontakty/index.html':s=append_main(s,c.contacts_content())
        elif path=='journal/index.html':s=journal(s,articles)
        elif path.startswith('journal/'):s=existing_article(s,book,path.split('/')[1])
        outputs[path]=global_changes(s,path,path in MAJOR).encode('utf-8')
    for a in articles:
        path='journal/'+a['slug']+'/index.html'
        require(path not in raw,'NEW_ARTICLE_ALREADY_EXISTS')
        s=new_article(raw['journal/iz-chego-skladyvaetsya-tsena/index.html'].decode('utf-8'),a)
        outputs[path]=global_changes(s,path,True).encode('utf-8')
    outputs['r732-content.css']=(ROOT/'r732-content.css').read_bytes()
    ns='http://www.sitemaps.org/schemas/sitemap/0.9';ET.register_namespace('',ns)
    xml=ET.fromstring(raw['sitemap.xml'])
    for node in xml:
        url=node.find('{'+ns+'}loc').text
        rel=url[len(ORIGIN)+1:]+'index.html'
        if rel in MAJOR:
            last=node.find('{'+ns+'}lastmod')
            if last is None:last=ET.SubElement(node,'{'+ns+'}lastmod')
            last.text=c.DATE
    for a in articles:
        node=ET.SubElement(xml,'{'+ns+'}url');ET.SubElement(node,'{'+ns+'}loc').text=ORIGIN+'/journal/'+a['slug']+'/'
        ET.SubElement(node,'{'+ns+'}lastmod').text=c.DATE
    outputs['sitemap.xml']=ET.tostring(xml,encoding='utf-8',xml_declaration=True)
    return outputs

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,default=ROOT/'baseline');parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args();outputs=render(args.source)
    for path,raw in outputs.items():
        target=args.out/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
    print('R732_BUILD=PASS; HTML=24; ARTICLES_NEW=3; PHOTOS_NEW=0; FLOORPLANS_NEW=0; FILES='+str(len(outputs)))

if __name__=='__main__':main()

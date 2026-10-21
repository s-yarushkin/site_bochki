#!/usr/bin/env python3
"""WEB-ONLY R73.1 overlay on the exact installed R73-LEGAL premium release.

No API restart, SQLite access, MAX call, manager auth or catalogue mutation.
Read-only preflight by default. --activate copies active WEB, stages and swaps.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

WEB=Path('/srv/sites/dachapar-preview/current')
API=Path('/srv/services/garant-bani-relay/current')
WEB_RELEASE='R73-LEGAL-db5d49445661-1792566478879449075'
API_RELEASE='R73-LEGAL-db5d49445661-1792566478879449075'
INDEX_SHA='b114e439070b09b3e96450585dcb8e582e92e30241540b6bf0988a7110b4f37d'
APP_SHA='928a705e7c758e741c89829a0dc5fc802ead6f814193de432a6141dec57d99ee'
BODY=('pine','teak','rosewood','larch','redwood','walnut_wood','iceberg','north_sea','scandinavian_gray','oak_dufa','licorice','ral_7024')
ROOF=('green','brown','red','gray')
GEO='''<section class="r731-regions" aria-labelledby="r731-regions-title"><div class="r731-region-inner"><h2 class="r731-regions-head" id="r731-regions-title">Где мы работаем</h2><p class="r731-regions-intro">Подберём готовую баню для вашего участка и поможем согласовать условия доставки и сборки.</p><ul class="r731-region-list"><li>Москва и Московская область</li><li>Вологодская область</li><li>Ярославская область</li><li>Ленинградская область</li></ul><p class="r731-region-terms">Стоимость и возможность доставки, разгрузки и сборки уточняются по адресу участка, условиям подъезда и выбранной комплектации. <a href="dostavka-i-ustanovka/">Как проходит доставка и установка →</a></p></div></section>
'''
SEO_GEO='<section class="r731-search-regions" aria-labelledby="r731-service-regions"><h2 id="r731-service-regions">Регионы работы</h2><p>Принимаем заказы из Москвы и Московской области, Вологодской, Ярославской и Ленинградской областей. Стоимость доставки, разгрузки, основания и сборки зависит от адреса, условий участка и выбранной бани; условия уточнит менеджер.</p></section>'

def require(ok,message):
    if not ok: raise RuntimeError(message)

def digest(b): return hashlib.sha256(b).hexdigest()

def change(s,old,new,code):
    require(s.count(old)==1,code+'_COUNT_'+str(s.count(old)))
    return s.replace(old,new,1)

def active(link):
    require(link.is_symlink(),'CURRENT_NOT_SYMLINK')
    target=link.resolve(strict=True)
    require(target.is_dir() and target.parent==link.parent/'releases','RELEASE_LAYOUT_CHANGED')
    return target

def src_bytes(src,name):
    file=src/name
    require(file.is_file() and not file.is_symlink(),'MISSING_SOURCE_'+name)
    return file.read_bytes()

def home(s):
    require(s.count('id="relay-lead-form"')==1 and s.count('id="relay-submit"')==1 and
            s.count('id="relay-consent"')==1,'LIVE_FORM_CHANGED')
    s=change(s,'id="installation-label">Монтаж «Квадро Хаус» · обязательно, 10% базы',
             'id="installation-label">Сборка бани на участке','INSTALL_LABEL_HTML')
    s=change(s,'<script src="app.mjs?v=r73-legal-20261021" type="module"></script>',
             '<script src="app.mjs?v=r731-ux-20261021" type="module"></script>\n  <script src="r731-finish-picker.mjs?v=r731-20261021" type="module"></script>',
             'APP_SCRIPT_ANCHOR')
    s=change(s,'<link rel="stylesheet" href="choice-r7.css">',
             '<link rel="stylesheet" href="choice-r7.css">\n  <link rel="stylesheet" href="r731-supplement.css?v=r731-20261021">',
             'CSS_ANCHOR')
    s=change(s,'"Ярославская область"]}', '"Ярославская область","Ленинградская область"]}',
             'HOMEPAGE_AREA_SERVED')
    s=change(s,'Москва и область · Вологда · Ярославль',
             'Москва и Подмосковье · Вологодская, Ярославская и Ленинградская области',
             'FOOTER')
    s=change(s,'    <section class="journal-teaser section wrap"',GEO+'    <section class="journal-teaser section wrap"',
             'JOURNAL_ANCHOR')
    require('10% базы' not in s and s.count('id="r731-regions-title"')==1,
            'HOMEPAGE_OUTPUT_INVALID')
    return s

def app(s):
    require("payload.consentVersion = '2026-10-21';" in s and
            'analytics.confirmed(result.receipt,{flow,requestId:payload.requestId})' in s,
            'LEGAL_CONSENT_OR_ANALYTICS_CHANGED')
    return change(s,
            "$('#installation-label').textContent = q.installation?'Монтаж «Квадро Хаус» · обязательно, 10% базы':'';",
            "$('#installation-label').textContent = q.installation?'Сборка бани на участке':'';",
            'INSTALL_LABEL_JS')

def seo(s):
    require('id="r731-service-regions"' not in s,'SEO_ALREADY_APPLIED')
    require('<main' in s and '</main>' in s and '</head>' in s,'SEO_STRUCTURE_UNKNOWN')
    s=change(s,'</head>',
             '<link rel="stylesheet" href="/r731-supplement.css?v=r731-20261021"></head>','SEO_CSS')
    s=change(s,'</main>',SEO_GEO+'</main>','SEO_CONTENT')
    match=re.search(r'"areaServed"\s*:\s*\[([^\]]+)\]',s)
    if match and 'Ленинградская область' not in match.group(1):
        add='{"@type":"AdministrativeArea","name":"Ленинградская область"}' if '@type' in match.group(1) else '"Ленинградская область"'
        s=change(s,match.group(0),match.group(0)[:-1]+','+add+']','SEO_STRUCTURED_DATA')
    return s

def check(source,live,api):
    require(live.name==WEB_RELEASE and api.name==API_RELEASE,'RELEASE_BASELINE_CHANGED')
    require(digest((live/'index.html').read_bytes())==INDEX_SHA,'INDEX_BASELINE_CHANGED')
    require(digest((live/'app.mjs').read_bytes())==APP_SHA,'APP_BASELINE_CHANGED')
    catalog=json.loads((live/'data/catalog-pricebook.json').read_text(encoding='utf-8'))
    published=json.loads(src_bytes(source,'data/catalog-pricebook.json'))
    require(catalog['version']=='2026-10-19-v74-sheet-round-up-5000-r1',
            'CATALOG_VERSION_CHANGED')
    require(catalog['prices']==published['prices'] and len(catalog['prices'])==4,
            'BASE_PRICES_CHANGED')
    require(tuple(x['id'] for x in catalog['finishes']['body'])==BODY and
            tuple(x['id'] for x in catalog['finishes']['roof'])==ROOF,
            'COLOR_CATALOG_CHANGED')
    manifest=json.loads(src_bytes(source,'assets/catalog-v66/MEDIA-MANIFEST.json'))
    media={x['file']:x for x in manifest['images']}
    samples=[]
    for kind,ids in (('body',BODY),('roof',ROOF)):
        for id in ids:
            name=kind+'-'+id+'.webp'
            meta=media.get(name)
            require(meta is not None and meta.get('visualProvenance')==
                    'CATALOG_PALETTE_SAMPLE_NOT_AN_EXACT_PHYSICAL_COLOR_REFERENCE',
                    'NOT_AN_APPROVED_SAMPLE_'+name)
            data=src_bytes(source,'assets/catalog-v66/'+name)
            require(digest(data)==meta['sha256'],'SOURCE_SAMPLE_HASH_CHANGED_'+name)
            exists=live/'assets/catalog-v66'/name
            if exists.exists():
                require(exists.is_file() and not exists.is_symlink() and digest(exists.read_bytes())==digest(data),
                        'ACTIVE_SWATCH_ASSET_CONFLICT_'+name)
            samples.append((name,data))
    for name in ('r731-finish-picker.mjs','r731-supplement.css'):
        data=src_bytes(source,'premium-r731/'+name)
        require(500<len(data)<16000,'OVERLAY_SIZE_INVALID_'+name)
    pages={}
    for name in ('dostavka-i-ustanovka/index.html','kontakty/index.html'):
        p=live/name
        require(p.is_file() and not p.is_symlink(),'MISSING_SEO_PAGE_'+name)
        pages[name]=seo(p.read_text(encoding='utf-8')).encode('utf-8')
    index=home((live/'index.html').read_text(encoding='utf-8')).encode('utf-8')
    application=app((live/'app.mjs').read_text(encoding='utf-8')).encode('utf-8')
    require((live/'journal').is_dir() and (live/'manager.html').is_file(),
            'JOURNAL_OR_MANAGER_MISSING')
    require(not any(p.is_symlink() for p in live.rglob('*')),'NESTED_SYMLINK_UNSAFE')
    require(shutil.disk_usage(live.parent).free>250*1024*1024,'DISK_LOW')
    return index,application,pages,samples

def atomic(target):
    temp=WEB.parent/'current.r731.swap'
    require(not temp.exists() and not temp.is_symlink(),'SWAP_EXISTS')
    temp.symlink_to(target)
    os.replace(temp,WEB)

def activate(source,pin,oldweb,oldapi,index,application,pages,samples):
    nxt=oldweb.parent/('R731-WEB-'+pin[:12]+'-'+str(time.time_ns()))
    require(not nxt.exists(),'TARGET_EXISTS')
    shutil.copytree(oldweb,nxt,symlinks=True)
    for name,data in [('index.html',index),('app.mjs',application)]+list(pages.items()):
        p=nxt/name
        require(p.is_file() and not p.is_symlink(),'TARGET_UNSAFE_'+name)
        p.write_bytes(data)
    for name in ('r731-finish-picker.mjs','r731-supplement.css'):
        path=nxt/name
        require(not path.exists(),'ADDITION_ALREADY_EXISTS_'+name)
        path.write_bytes(src_bytes(source,'premium-r731/'+name))
    dest=nxt/'assets/catalog-v66'
    dest.mkdir(parents=True,exist_ok=True)
    for name,data in samples:
        p=dest/name
        if not p.exists():p.write_bytes(data)
        require(digest(p.read_bytes())==digest(data),'STAGED_PALETTE_FAILED_'+name)
    for file in (nxt/'app.mjs',nxt/'r731-finish-picker.mjs'):
        subprocess.run(['node','--check',str(file)],check=True,timeout=15)
    require((nxt/'journal').is_dir() and (nxt/'manager.html').is_file(),
            'JOURNAL_OR_MANAGER_NOT_STAGED')
    for name in ('privacy.html','consent.html','requisites.html'):
        require(digest((oldweb/name).read_bytes())==digest((nxt/name).read_bytes()),
                'LEGAL_DOCUMENT_CHANGED_'+name)
    require(API.resolve()==oldapi,'ACTIVE_API_CHANGED_DURING_STAGE')
    switched=False
    try:
        atomic(nxt);switched=True
        require(WEB.resolve()==nxt and API.resolve()==oldapi,'POST_SWITCH_POINTER_CHANGED')
        require('Сборка бани на участке' in (WEB/'app.mjs').read_text(encoding='utf-8'),
                'LIVE_INSTALLATION_MISSING')
        require('Ленинградская область' in (WEB/'index.html').read_text(encoding='utf-8'),
                'LIVE_REGION_MISSING')
        print('R731_WEB_DEPLOY=PASS; ACTIVE_WEB='+str(nxt))
        print('API_UNCHANGED=YES; SQLITE_UNTOUCHED=YES; MAX_TEST_CALLS=0; JOURNAL=RETAINED; MANAGER=RETAINED')
    except BaseException:
        if switched:atomic(oldweb)
        print('R731_WEB_ROLLBACK=EXECUTED',file=sys.stderr)
        raise

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--source',type=Path,required=True)
    p.add_argument('--source-sha',required=True)
    p.add_argument('--activate',action='store_true')
    a=p.parse_args()
    require(bool(re.fullmatch('[a-f0-9]{40}',a.source_sha)),'BAD_SOURCE_PIN')
    current=active(WEB)
    api=active(API)
    index,application,pages,samples=check(a.source,current,api)
    print('R731_WEB_PREFLIGHT=PASS')
    print('CURRENT_WEB='+str(current)+'; CURRENT_API='+str(api))
    print('COLOR_SAMPLES_VERIFIED='+str(len(samples))+'; SEO_PAGES='+str(len(pages)))
    print('NEW_INDEX_SHA256='+digest(index)+'; NEW_APP_SHA256='+digest(application))
    if a.activate:activate(a.source,a.source_sha,current,api,index,application,pages,samples)
    else:print('READ_ONLY=YES; NO_PRODUCTION_WRITES=YES')

if __name__=='__main__':
    try:main()
    except Exception as ex:
        print('R731_WEB_ABORT='+str(ex),file=sys.stderr)
        sys.exit(1)

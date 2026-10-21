#!/usr/bin/env python3
"""Premium R73.1 EXACT-LIVE WEB-only commercial SEO/UX overlay.

Default: read-only preflight. --activate copies the current release, patches
8 public pages, atomically swaps the WEB symlink. Does not modify
API, customer data, manager, consent, robots/sitemap or Yandex verification.
No photo fabrication and no price changes.
"""
import argparse
import hashlib
import html
import json
import os
import re
import shutil
import sys
import time
from pathlib import Path

WEB_LINK=Path("/srv/sites/dachapar-preview/current")
API_LINK=Path("/srv/services/garant-bani-relay/current")
EXPECTED_WEB="R731-YANDEX-VERIFY-20261021T132857-fa05b89b"
EXPECTED_API="R73-LEGAL-db5d49445661-1792566478879449075"
CATALOG_VERSION="2026-10-19-v74-sheet-round-up-5000-r1"
PROOF_FILE="yandex_b6454ce0d283ef63.html"
EXPECTED={
    "bani/index.html":"c83056a3bae91303dd068448fab5a8ab9a5a061e34b99870138a76c9d17cf15a",
    "bani/kvadro/index.html":"be3a5ffdc3adc1f73a3ed7b4b50afeb99a9943c08e212b44f2ccef7847cdddf0",
    "bani/parus/index.html":"f312b09ccf27cfede8d6800b01093e1715e032fe1d2e327d739e19dfa76c1458",
    "bani/viking/index.html":"609c99d5fa0132df4288f49e8d4e593390d40f7214ab8242f2483d085ea60043",
    "bani/kvadro-haus/index.html":"2f4f34884208b0bcb617970ebd5a5f5679703cf9fab48513661ef7d836ddd3fe",
    "journal/kak-vybrat-gotovuyu-banyu/index.html":"50d3374626eb62eec30e36227ea231f4c046a3391b8c42a2c312499ca0f76787",
    "journal/iz-chego-skladyvaetsya-tsena/index.html":"b55213f1481389c8c988c7871283e93e6ac236d65624fe93f34fa6882553771b",
    "journal/kvadro-5-komfort/index.html":"ac9631fb59394758912374accb48b61f438a13feb41460700e18b885e7d31b67",
}
MODEL_FACTS={
    "kvadro":(
        "Квадро: компактная ширина и центральный вход",
        "У Квадро ширина 2,1 м, а вход вынесен по центру. В каталоге доступны длины 4, 4,5, 5, 5,5 и 6 м. Для выбора внутреннего пространства попросите планировку именно выбранного размера: внешние габариты не показывают полезную площадь помещений.",
        "Если вы сравниваете Квадро с более широкой моделью, посмотрите Викинг и Парус (ширина 2,4 м). Внешние размеры и варианты входа различаются, а особенности парной и комнаты отдыха подтверждаются спецификацией."
    ),
    "viking":(
        "Викинг: арочный вход по центру",
        "Викинг отличается арочным входом по центру и шириной 2,4 м. По текущему каталогу предусмотрено пять длин от 4 до 6 м. Состав окон, планировку и полезные размеры помещений нужно сверить со спецификацией выбранного исполнения.",
        "Если решаете, какой силуэт и ширину выбрать для дачи, сравните Викинг с Квадро (ширина 2,1 м) и Парусом (ширина 2,4 м). Сопоставляйте одинаковые размеры и оснащение."
    ),
    "parus":(
        "Парус: форма фасада и исполнение под выбранный размер",
        "Парус имеет ширину 2,4 м и пять длин от 4 до 6 м. На странице показан общий вид модели. Расположение входа, состав остекления и планировку нельзя переносить с одного размера на другой без проверки спецификации.",
        "Парус удобно сопоставить с Викингом той же ширины 2,4 м и Квадро шириной 2,1 м. Сначала выбирайте подходящий внешний размер, затем уточняйте конфигурацию помещений."
    ),
    "kvadro-haus":(
        "Квадро Хаус: стоимость изделия и сборки",
        "Для Квадро Хаус доступны размеры 4 × 4, 5 × 4, 6 × 4, 6 × 5 и 6 × 6 м. Итоговые цены на этой странице включают баню с базовым оснащением и обязательную сборку на участке. Доставка, разгрузка, основание и внешние подключения рассчитываются отдельно.",
        "Для сравнения с вытянутыми моделями Квадро, Викинг и Парус учитывайте не только размеры снаружи: полезную площадь, состав помещений и планировку каждого исполнения необходимо согласовать по спецификации."
    )
}
PRICE_COPY="Цены изделия с базовым оснащением по каталогу от 19 октября 2026. Доставка, разгрузка, основание, внешние подключения и необходимый монтаж согласуются отдельно."
NONHOUSE_PRICE_COPY="Цены бани с базовым оснащением — по каталогу от 19 октября 2026. Доставка, разгрузка, основание, внешние подключения и необходимые работы на участке рассчитываются отдельно."
HOUSE_PRICE_COPY="Цены включают баню с базовым оснащением и обязательную сборку на участке по каталогу от 19 октября 2026. Доставка, разгрузка, основание и внешние подключения рассчитываются отдельно."

def must(ok,code):
    if not ok:raise RuntimeError(code)

def sha(data):return hashlib.sha256(data).hexdigest()

def one(s,old,new,code):
    n=s.count(old)
    must(n==1,code+"_COUNT_"+str(n))
    return s.replace(old,new,1)

def active(link,expected):
    must(link.is_symlink(), "NOT_A_RELEASE_SYMLINK_"+str(link))
    dest=link.resolve(strict=True)
    must(dest.name==expected and dest.parent==link.parent/"releases", "ACTIVE_RELEASE_CHANGED_"+str(dest))
    return dest

def money(n):return f"{n:,}".replace(",","\u00a0")+" ₽"

def catalog_patch(s,pricebook):
    must(s.count('href="../bani/kvadro-haus/"')==1,"CATALOG_HOUSE_CARD_CHANGED")
    base=pricebook["prices"]["kvadro-house"]["4x4"]
    must(base==590000,"HOUSE_BASE_CHANGED")
    fee=base//10
    total=base+fee
    # Page-only microcopy adjustment, preserving card and URL.
    s=one(s,
       "Все цены относятся к изделию с базовой комплектацией; доставку и работы на участке согласуем отдельно.",
       "Для Квадро, Паруса и Викинга показана цена бани с базовым оснащением. Для Квадро Хаус цена включает обязательную сборку на участке. Доставка, основание и другие работы рассчитываются отдельно.",
       "CATALOG_PRICE_HEADER")
    before=re.search(r'<a class="journal-card" href="\.\./bani/kvadro-haus/">.*?</a>',s,re.S)
    must(before is not None,"CATALOG_HOUSE_CARD_NOT_FOUND")
    card=before.group(0)
    expected_price=f"<strong>от {money(base)}</strong>"
    must(card.count(expected_price)==1,"CATALOG_HOUSE_PRICE_CHANGED")
    replacement=(f"<strong>от {money(total)} с учётом сборки</strong>"
                 f"<p class=\"dp-price-explanation\">Баня {money(base)} + сборка на участке {money(fee)}. "
                 "Доставка и основание отдельно.</p>")
    newcard=card.replace(expected_price,replacement,1)
    return one(s,card,newcard,"CATALOG_HOUSE_CARD_REPLACEMENT")

def breadcrumbs(s):
    # Include existing collection breadcrumb in structured data; preserve rest.
    pat=re.compile(r'<script type="application/ld\+json">(.*?)</script>',re.S)
    changed=False
    def update(m):
        nonlocal changed
        raw=m.group(1)
        try:data=json.loads(raw)
        except (ValueError,TypeError):return m.group(0)
        objs=data if isinstance(data,list) else data.get("@graph",[data]) if isinstance(data,dict) else []
        for obj in objs:
            if not isinstance(obj,dict) or obj.get("@type")!="BreadcrumbList":continue
            crumb=obj.get("itemListElement",[])
            if not isinstance(crumb,list) or len(crumb)!=2:continue
            if crumb[0].get("name")!="Главная":continue
            # Use existing breadcrumb item URL shape, don't invent siblings.
            final=crumb[-1]
            must(isinstance(final,dict) and "item" in final,"BREADCRUMB_LAST_ITEM_UNKNOWN")
            new={"@type":"ListItem","position":2,"name":"Каталог бань",
                 "item":"https://xn--80aaan1dh9b.xn--p1ai/bani/"}
            final["position"]=3
            obj["itemListElement"]=[crumb[0],new,final]
            changed=True
            return '<script type="application/ld+json">'+json.dumps(data,ensure_ascii=False,separators=(',',':'))+'</script>'
        return m.group(0)
    s=pat.sub(update,s)
    must(changed,"SCHEMA_BREADCRUMBS_ANCHOR_CHANGED")
    return s

def model_patch(s,model,pricebook):
    must(model in MODEL_FACTS,"MODEL_NOT_KNOWN")
    heading,a,b=MODEL_FACTS[model]
    replacement=HOUSE_PRICE_COPY if model=="kvadro-haus" else NONHOUSE_PRICE_COPY
    s=one(s,PRICE_COPY,replacement,"MODEL_PRICE_COPY_"+model)
    must('class="related-posts"' in s,"MODEL_RELATED_LINKS_CHANGED_"+model)
    must(s.count('<section class="related-posts">')==1,"MODEL_RELATED_SECTION_DUPLICATE")
    model_ref={
      "kvadro":'<a href="../viking/">Сравнить с Викингом</a><a href="../parus/">Сравнить с Парусом</a>',
      "viking":'<a href="../kvadro/">Сравнить с Квадро</a><a href="../parus/">Сравнить с Парусом</a>',
      "parus":'<a href="../viking/">Сравнить с Викингом</a><a href="../kvadro/">Сравнить с Квадро</a>',
      "kvadro-haus":'<a href="../kvadro/">Сравнить с Квадро</a><a href="../viking/">Сравнить с Викингом</a>',
    }[model]
    extra=(f'<section class="related-posts dp-model-truth" aria-label="Отличия модели">'
           f'<h2>{html.escape(heading)}</h2><p>{html.escape(a)}</p><p>{html.escape(b)}</p>'
           f'<div class="related-links">{model_ref}<a href="../../compare/">Сравнить все четыре модели</a></div>'
           f'</section>')
    if model=="kvadro-haus":
        p=pricebook["prices"]["kvadro-house"]
        sizes=[("4x4","4 × 4"),("5x4","5 × 4"),("6x4","6 × 4"),("6x5","6 × 5"),("6x6","6 × 6")]
        must(len(p)==len(sizes),"HOUSE_SIZES_CHANGED")
        rows=[]
        for code,label in sizes:
            base=p[code];fee=base//10;final=base+fee
            rows.append(f'<tr><th scope="row">{label} м</th><td>{money(base)}</td><td>{money(fee)}</td><td><strong>{money(final)}</strong></td></tr>')
        extra+=(('<section class="related-posts dp-house-price-split"><h2>Что входит в стоимость Квадро Хаус</h2>'
            '<p>Стоимость указана вместе со сборкой бани на участке. Доставка, основание и внешние подключения рассчитываются отдельно.</p>'
            '<div class="table-scroll"><table class="content-table"><thead><tr>'
            '<th scope="col">Размер</th><th scope="col">Баня с базовым оснащением</th>'
            '<th scope="col">Сборка на участке</th><th scope="col">Итого</th>'
            '</tr></thead><tbody>')+"".join(rows)+'</tbody></table></div></section>')
    s=one(s,'<section class="related-posts">',extra+'<section class="related-posts">',"MODEL_ADD_UNIQUE_"+model)
    s=breadcrumbs(s)
    return s

def journal_cta(s,slug):
    linksets={
     "kak-vybrat-gotovuyu-banyu":[
        ("../../bani/kvadro/","Квадро: вход по центру, ширина 2,1 м"),
        ("../../bani/viking/","Викинг: арочный вход, ширина 2,4 м"),
        ("../../bani/parus/","Парус: пять вариантов длины"),
        ("../../bani/kvadro-haus/","Квадро Хаус: пять форматов"),
       ],
     "iz-chego-skladyvaetsya-tsena":[
        ("../../bani/","Сравнить цены всех моделей"),
        ("../../bani/kvadro-haus/","Квадро Хаус: цена бани и сборки"),
        ("../../bani/kvadro/","Квадро: пять размеров и цен"),
       ],
     "kvadro-5-komfort":[
        ("../../bani/kvadro/","Квадро: все размеры и базовые цены"),
        ("../../compare/","Сравнить Квадро с другими моделями"),
       ],
    }
    links=linksets[slug]
    must(s.count('</article>')==1,"ARTICLE_ANCHOR_CHANGED_"+slug)
    block=('<section class="related-posts dp-article-to-products" aria-label="Модели бань">'
           '<h2>Выбрать подходящую баню</h2>'
           '<p>Переходите к реальным размерам, составу базы и открытым ценам каждой модели.</p>'
           '<div class="related-links">'+''.join('<a href="'+p+'">'+html.escape(text)+'</a>' for p,text in links)+'</div></section>')
    s=one(s,'</article>',block+'</article>',"ARTICLE_LINKS_"+slug)
    if slug=="kak-vybrat-gotovuyu-banyu":
        s=one(s,
         "Для «Квадро Хаус» монтаж уже включён в указанную стоимость (+10% от базовой цены); для остальных моделей возможные работы обсуждаются отдельно.",
         "Для «Квадро Хаус» обязательная сборка бани на участке уже входит в указанную итоговую стоимость; для остальных моделей необходимые работы на участке обсуждаются отдельно.",
         "ARTICLE_REMOVE_FORMULA")
    if slug=="iz-chego-skladyvaetsya-tsena":
        s=one(s,
          "с обязательным монтажом (590 000 ₽ база + 59 000 ₽ монтаж)",
          "с обязательной сборкой на участке (590 000 ₽ баня + 59 000 ₽ сборка)",
          "PRICE_ARTICLE_LABEL")
        s=one(s,"Цена «от» показывает только начальный вариант изделия.",
          "Стартовая цена относится к конкретной модели и размеру; для Квадро Хаус опубликованный итог включает обязательную сборку на участке.",
          "PRICE_ARTICLE_INTRO")
    return s

def transform(path,s,book):
    if path=="bani/index.html":return catalog_patch(s,book)
    if path.startswith("bani/"):
        model=path.split("/")[1]
        return model_patch(s,model,book)
    slug=path.split("/")[1]
    return journal_cta(s,slug)

def preflight(web,api):
    must((web/PROOF_FILE).is_file(),"WEBMASTER_PROOF_MISSING")
    proof=(web/PROOF_FILE).read_bytes().decode("utf-8")
    must("b6454ce0d283ef63" in proof,"WEBMASTER_PROOF_CHANGED")
    must((web/"journal").is_dir() and (web/"manager.html").is_file(),"PAGES_MISSING")
    must((web/"app.mjs").is_file() and (web/"data/catalog-pricebook.json").is_file(),"SITE_SCRIPTS_MISSING")
    must(not any(p.is_symlink() for p in web.rglob("*")),"NESTED_SYMLINK_NOT_SAFE")
    must(shutil.disk_usage(web.parent).free>250*1024*1024,"INSUFFICIENT_DISK")
    book=json.loads((web/"data/catalog-pricebook.json").read_text(encoding="utf-8"))
    must(book.get("version")==CATALOG_VERSION,"CATALOG_VERSION_CHANGED")
    must(len(book.get("prices",{}))==4 and all(len(v)==5 for v in book["prices"].values()),"CATALOG_SIZES_CHANGED")
    for name,expected in EXPECTED.items():
        p=web/name
        must(p.is_file() and not p.is_symlink(),"PAGE_NOT_REGULAR_"+name)
        raw=p.read_bytes()
        must(sha(raw)==expected,"LIVE_PAGE_CHANGED_"+name)
    fixed={}
    for name in EXPECTED:
        original=(web/name).read_text(encoding="utf-8")
        after=transform(name,original,book)
        must(after!=original,"NO_CHANGE_"+name)
        must(after.count("<main")==original.count("<main"),"MAIN_REPLACED_"+name)
        must(after.count('id="relay-lead-form"')==original.count('id="relay-lead-form"'),"FORM_CHANGED_"+name)
        must(after.count('name="robots"')==original.count('name="robots"'),"META_ROBOTS_CHANGED_"+name)
        must(after.count('rel="canonical"')==original.count('rel="canonical"'),"CANONICAL_CHANGED_"+name)
        fixed[name]=after.encode("utf-8")
    return fixed,book

def atomically_switch(target, suffix):
    tmp=WEB_LINK.parent/("current."+suffix+".swap")
    must(not tmp.exists() and not tmp.is_symlink(),"SWAP_EXISTS")
    tmp.symlink_to(target)
    os.replace(tmp,WEB_LINK)

def activate(web,api,fixed,version):
    dest=web.parent/("R731-SEO-P0-"+version[:12]+"-"+str(time.time_ns()))
    must(not dest.exists(),"DEST_EXISTS")
    shutil.copytree(web,dest,symlinks=True)
    for name,data in fixed.items():
        p=dest/name
        must(p.is_file() and not p.is_symlink(),"STAGED_PAGE_UNSAFE_"+name)
        p.write_bytes(data)
    protected=("index.html","app.mjs","analytics-runtime.mjs","lead-client.mjs",
               "manager.html","robots.txt","sitemap.xml",PROOF_FILE,
               "privacy.html","consent.html","requisites.html","data/catalog-pricebook.json")
    for name in protected:
        must(sha((web/name).read_bytes())==sha((dest/name).read_bytes()),"PROTECTED_FILE_CHANGED_"+name)
    must((dest/"journal").is_dir() and (dest/"manager.html").is_file(),"STAGED_JOURNAL_OR_MANAGER_MISSING")
    must(API_LINK.resolve()==api,"API_CHANGED_DURING_STAGING")
    done=False
    try:
        atomically_switch(dest,"seo");done=True
        must(WEB_LINK.resolve()==dest and API_LINK.resolve()==api,"ACTIVE_POINTER_FAILED")
        for name,data in fixed.items():
            must(sha((WEB_LINK/name).read_bytes())==sha(data),"DEPLOYED_FILE_SHA_BAD_"+name)
        print("R731_SEO_DEPLOY=PASS")
        print("WEB_RELEASE="+str(dest))
        print("API=UNCHANGED; SQLITE=UNTOUCHED; MAX_CALLS=0; MANAGER=RETAINED; WEBMASTER=RETAINED")
    except BaseException:
        if done:atomically_switch(web,"seo-rollback")
        print("R731_SEO_ROLLBACK=EXECUTED",file=sys.stderr)
        raise

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--activate",action="store_true")
    parser.add_argument("--source-sha",required=True)
    args=parser.parse_args()
    must(bool(re.fullmatch("[a-f0-9]{40}",args.source_sha)),"INVALID_SOURCE_SHA")
    web=active(WEB_LINK,EXPECTED_WEB)
    api=active(API_LINK,EXPECTED_API)
    fixed,_=preflight(web,api)
    print("R731_SEO_PREFLIGHT=PASS")
    print("FILES="+str(len(fixed))+"; LIVE_WEB="+str(web)+"; LIVE_API="+str(api))
    for name,data in fixed.items():print("STAGED_"+name+"="+sha(data))
    if args.activate:activate(web,api,fixed,args.source_sha)
    else:print("READ_ONLY=YES; LIVE_UNCHANGED=YES")

if __name__=="__main__":
    try:main()
    except Exception as e:
        print("R731_SEO_ABORT="+str(e),file=sys.stderr)
        sys.exit(1)

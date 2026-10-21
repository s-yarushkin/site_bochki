#!/usr/bin/env python3
"""Independent read-only live R73.1 model-page SEO / conversion audit.

Only GET to public website. Never requests /api, manager, customer data,
and no submissions or tracking. Structured public metadata and text excerpts.
"""
import json
import re
import ssl
import urllib.request
import urllib.parse
from collections import Counter
from bs4 import BeautifulSoup, NavigableString

SITE = "https://xn--80aaan1dh9b.xn--p1ai"
PATHS = [
 "/","/bani/","/bani/kvadro/","/bani/viking/","/bani/parus/","/bani/kvadro-haus/",
 "/dostavka-i-ustanovka/","/kontakty/","/journal/","/journal/iz-chego-skladyvaetsya-tsena/",
 "/journal/kak-vybrat-gotovuyu-banyu/",
]
MODELS = ("/bani/kvadro/","/bani/viking/","/bani/parus/","/bani/kvadro-haus/")
USER_AGENT="DachaPar-Independent-SEO-Review/2026-10-21"
MAX_SIZE=2_200_000

def get(path, method="GET"):
    url=SITE+path
    assert path.startswith("/") and path not in ("/manager.html","/api/lead")
    req=urllib.request.Request(url,headers={"User-Agent":USER_AGENT,"Accept-Encoding":"identity"},method=method)
    with urllib.request.urlopen(req,timeout=14,context=ssl.create_default_context()) as res:
        body=res.read(MAX_SIZE+1) if method=="GET" else b""
        assert len(body)<=MAX_SIZE,"HTML unexpectedly large"
        final=res.geturl()
        assert urllib.parse.urlsplit(final).hostname in ("xn--80aaan1dh9b.xn--p1ai","дачапар.рф")
        return body.decode("utf-8",errors="replace"),res.status,dict(res.headers),final

def tidy(s):
    return re.sub(r"\s+"," ",s).strip()

def schema_nodes(soup):
    vals=[]
    for node in soup.select('script[type="application/ld+json"]'):
        try:
            data=json.loads(node.string or node.text)
        except Exception:continue
        stack=[data]
        while stack:
            current=stack.pop()
            if isinstance(current,list):stack.extend(current);continue
            if not isinstance(current,dict):continue
            stack.extend(current.get('@graph',[]))
            tp=current.get('@type')
            if tp:
                vals.append({
                    "type":tp,"name":current.get("name"),"description":current.get("description"),
                    "brand":current.get("brand"),"sku":current.get("sku"),
                    "offers":current.get("offers"),"image":current.get("image"),
                    "itemListElement_count":len(current.get("itemListElement",[])),
                })
    return vals

def full_schema_facts(path):
    html, status, _, _=get(path)
    soup=BeautifulSoup(html,"html.parser")
    facts=[]
    for script in soup.select('script[type="application/ld+json"]'):
        try:obj=json.loads(script.string or script.text)
        except:continue
        stack=[obj]
        while stack:
            node=stack.pop()
            if isinstance(node,list):stack.extend(node);continue
            if not isinstance(node,dict):continue
            stack.extend(node.get("@graph",[]))
            tp=node.get("@type")
            if tp not in ("ProductGroup","Product","Offer","AggregateOffer","BreadcrumbList"):continue
            variants=node.get("hasVariant",[])
            if isinstance(variants,dict):variants=[variants]
            product_variants=[]
            for variant in variants:
                if not isinstance(variant,dict):continue
                v_offers=variant.get("offers",{})
                product_variants.append({
                  "name":variant.get("name"),"sku":variant.get("sku"),
                  "url":variant.get("url"),
                  "offer":({k:v_offers.get(k) for k in ("price","priceCurrency","availability","url")} if isinstance(v_offers,dict) else v_offers),
                })
            offers=node.get("offers",{})
            breadcrumbs=node.get("itemListElement",[])
            facts.append({"type":tp,"keys":list(node.keys()),
                          "variesBy":node.get("variesBy"),"productGroupID":node.get("productGroupID"),
                          "variants_count":len(variants),
                          "variants":product_variants,
                          "offer":({k:offers.get(k) for k in ("price","priceCurrency","availability","url")} if isinstance(offers,dict) else offers),
                          "breadcrumb_names":[x.get("name") for x in breadcrumbs if isinstance(x,dict)]})
    return facts

def price_numbers(text):
    return sorted(set(re.findall(r"\b(?:\d{2,3}[ \u00a0\u202f]?){1,2}\d{3}\s*(?:₽|руб(?:лей|ля)?)",text,re.IGNORECASE)))

def normalize_link(href,path):
    absolute=urllib.parse.urljoin(SITE+path,href or "")
    u=urllib.parse.urlsplit(absolute)
    if u.hostname not in ("xn--80aaan1dh9b.xn--p1ai","дачапар.рф"):return None
    return u.path or "/"

def inspect_page(path):
    html,status,headers,final=get(path)
    soup=BeautifulSoup(html,"html.parser")
    body=soup.select_one("main") or soup.body
    for sel in ["script","style","noscript","svg"]:
        for el in body.select(sel):el.decompose()
    paragraphs=[tidy(x.get_text(" ",strip=True)) for x in body.select("p, li") if x.get_text(" ",strip=True)]
    headings=[{"tag":h.name,"text":tidy(h.get_text(" ",strip=True))[:140]} for h in body.select("h1,h2,h3")]
    links=[]
    for a in soup.select("a[href]"):
        href=a.get("href","")
        t=tidy(a.get_text(" ",strip=True))[:90]
        path2=normalize_link(href,path)
        links.append({"text":t,"href":href[:160],"internal_path":path2})
    images=[]
    for im in body.select("img"):
        images.append({
            "alt":(im.get("alt") if im.has_attr("alt") else None),
            "src":(im.get("src") or im.get("data-src") or "")[:180],
            "width":im.get("width"),"height":im.get("height"),
            "loading":im.get("loading"),"decoding":im.get("decoding"),
        })
    canonical=[e.get("href") for e in soup.select('link[rel="canonical"]')]
    og={e.get("property"):e.get("content") for e in soup.select('meta[property^="og:"]')}
    desc=soup.select_one('meta[name="description"]')
    title=soup.select_one("title")
    features=tidy(body.get_text(" ",strip=True))
    model_paths=Counter(x["internal_path"] for x in links if x["internal_path"] in MODELS)
    journal_paths=Counter(x["internal_path"] for x in links if x["internal_path"] and x["internal_path"].startswith("/journal/"))
    action_links=[l for l in links if any(w in l["text"].lower() for w in ("выбрать","собрать","рассчит","заказ","купить","получить","заяв","связаться","обсудить","позвонить","комплект","сравнит"))]
    signals={k:bool(re.search(v,features,re.IGNORECASE)) for k,v in {
       "price":"цена|стоимость|₽|руб", "sizes":"размер|длин|ширин|метр",
       "base_kit":"комплект|печь|отделк|оснащение","delivery":"доставк",
       "foundation":"основани|фундамент","assembly":"сборк|монтаж|установк",
       "warranty":"гаранти","manufacturer":"производств|изготавл|производител",
       "lead":"заявк|расч[её]т|связаться|звонок","regions":"Моск|Волог|Ярослав|Ленинград",
       "photos":"фото|галере|снимок","faq":"вопрос|ответ",
    }.items()}
    main_word_count=len(re.findall(r"\w+",features,flags=re.UNICODE))
    result={
        "path":path,"status":status,"bytes":len(html.encode("utf-8")),
        "title":tidy(title.get_text(" ",strip=True)) if title else None,
        "description":desc.get("content") if desc else None,
        "canonical":canonical,"h":headings,"main_words":main_word_count,
        "paragraphs":paragraphs[:45],
        "public_text_excerpt":features[:4000],
        "price_strings":price_numbers(features)[:25],
        "schema":schema_nodes(soup),
        "og":og,
        "images":{"count":len(images),"first":images[:8],
                  "missing_alt":sum(1 for x in images if x["alt"] is None),
                  "empty_alt":sum(1 for x in images if x["alt"] == "")},
        "link_count":len(links),
        "to_models":dict(model_paths),"to_journal":dict(journal_paths),
        "internal_link_destinations":sorted(set(l["internal_path"] for l in links if l["internal_path"]))[:60],
        "action_links":action_links[:20],
        "signals":signals,
        "headings_counts":dict(Counter(x["tag"] for x in headings)),
    }
    return result

def main():
    print("LIVE_COMMERCIAL_SEO_AUDIT=READ_ONLY; ALLOWED=GET_ONLY; SUBMISSIONS=0")
    outputs=[]
    for path in PATHS:
        try:r=inspect_page(path);outputs.append(r)
        except Exception as e:
            outputs.append({"path":path,"error":type(e).__name__+":"+str(e)[:140]})
    pricebook_txt,status,_,_=get("/data/catalog-pricebook.json")
    pricebook=json.loads(pricebook_txt)
    print("LIVE_PRICEBOOK="+json.dumps({"version":pricebook.get("version"),"models":pricebook.get("prices")},ensure_ascii=False))
    for x in outputs:
        if x.get("error"):
            print("PAGE_ERROR="+json.dumps(x,ensure_ascii=False));continue
        print("PAGE_AUDIT="+json.dumps(x,ensure_ascii=False,separators=(',',':')))
    commercial=[p for p in outputs if p.get("path") in MODELS and p.get("status")==200]
    if len(commercial)==4:
        for a in commercial:
            for b in commercial:
                if a["path"]>=b["path"]:continue
                sa={re.sub(r"[^а-яёa-z0-9]","",p.lower()) for p in a["paragraphs"] if len(p)>35}
                sb={re.sub(r"[^а-яёa-z0-9]","",p.lower()) for p in b["paragraphs"] if len(p)>35}
                j=(len(sa&sb)/len(sa|sb)) if (sa or sb) else 0
                print("MODEL_TEXT_OVERLAP="+json.dumps({"a":a["path"],"b":b["path"],"same_long_paragraphs":len(sa&sb),"jaccard":round(j,3)},ensure_ascii=False))
    for path in ("/bani/",)+MODELS:
        print("FULL_SCHEMA="+json.dumps({"path":path,"facts":full_schema_facts(path)},ensure_ascii=False))
    print("AUDIT_COMPLETE; PAGES="+str(len(outputs)))
if __name__=="__main__":main()

"""Browser visual regression for R73.1 exact-live commercial SEO overlay.

GET-only public source, renders sanitized HTML with scripts stripped to avoid
analytics/lead calls. Compares original vs candidate overflow at 4 viewports.
"""
import importlib.util
import json
import re
import urllib.request
import ssl
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

SPEC=importlib.util.spec_from_file_location("seo_overlay","premium-r731/r731-commercial-seo-install.py")
m=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)
BASE="https://xn--80aaan1dh9b.xn--p1ai"
OUT=Path("artifacts/r731-commercial-visual")
OUT.mkdir(parents=True,exist_ok=True)
PATHS=["bani/index.html","bani/kvadro/index.html","bani/viking/index.html","bani/parus/index.html","bani/kvadro-haus/index.html"]

def get(path):
    u=BASE+"/"+path.replace("index.html","")
    req=urllib.request.Request(u,headers={"Accept-Encoding":"identity","User-Agent":"DachaPar-SEO-Chromium-ReadOnly"})
    with urllib.request.urlopen(req,timeout=15,context=ssl.create_default_context()) as r:
        assert r.status==200
        return r.read().decode("utf-8")

def sanitized(s,path):
    # Preserve actual document layout and external stylesheet/approved media URLs.
    # Do NOT run site JS, analytics, external pixels or POST.
    soup=BeautifulSoup(s,"html.parser")
    for script in soup.select("script"):script.decompose()
    for iframe in soup.select("iframe"):iframe.decompose()
    for element in soup.select('link[rel="preconnect"],link[rel="prefetch"],link[rel="dns-prefetch"]'):element.decompose()
    head=soup.head
    if head:
        base=soup.new_tag("base",href=BASE+"/"+path.replace("index.html",""))
        head.insert(0,base)
    return str(soup)

def main():
    catalog=json.loads(get("data/catalog-pricebook.json"))
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        for path in PATHS:
            old=get(path)
            new=m.transform(path,old,catalog)
            for width in (360,390,768,1366):
                vals=[]
                for phase,markup in (("before",old),("after",new)):
                    context=browser.new_context(viewport={"width":width,"height":850})
                    page=context.new_page()
                    errors=[]
                    page.on("pageerror",lambda err:errors.append(str(err)))
                    page.set_content(sanitized(markup,path),wait_until="domcontentloaded",timeout=30000)
                    page.wait_for_timeout(550)
                    metrics=page.evaluate("""() => ({
                        width:innerWidth,
                        overflow:document.documentElement.scrollWidth-innerWidth,
                        has_h1:document.querySelectorAll('h1').length === 1,
                        h1:document.querySelector('h1')?.innerText || '',
                        price_count:document.querySelectorAll('strong').length,
                    })""")
                    assert not errors,errors
                    assert metrics["has_h1"],path
                    if phase=="after" and width in (390,1366):
                        page.screenshot(path=str(OUT/(path.split('/')[1] if path.startswith('bani/') and path.count('/')>1 else "catalog")+"-"+str(width)+".png"),full_page=True)
                    vals.append(metrics)
                    context.close()
                assert vals[1]["overflow"]<=max(0,vals[0]["overflow"])+1,(path,width,vals)
                print("COMMERCIAL_VISUAL=PASS; PAGE=%s; WIDTH=%s; OVERFLOW_BEFORE=%s; OVERFLOW_AFTER=%s"%(path,width,vals[0]["overflow"],vals[1]["overflow"]))
        browser.close()
    print("COMMERCIAL_BROWSER_QA=PASS; PAGES="+str(len(PATHS))+"; VIEWPORTS=4; API_POST=0; METRIKA=0")
if __name__=="__main__":main()

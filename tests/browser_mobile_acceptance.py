"""MOBILE-01 browser acceptance on local checkout only; no production POSTs or MAX."""
import functools
import http.server
import os
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
WIDTHS = [(320,700),(360,780),(375,812),(390,844),(430,932),(768,900),(851,900),(1440,900)]
class Silent(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

server = http.server.ThreadingHTTPServer(
    ('127.0.0.1',0),functools.partial(Silent,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base = 'http://127.0.0.1:'+str(server.server_address[1])+'/'
try:
    with sync_playwright() as p:
        options = {'headless': True}
        for exe in [
            Path(os.environ.get('PROGRAMFILES',r'C:\Program Files'))/'Google/Chrome/Application/chrome.exe',
            Path(os.environ.get('PROGRAMFILES(X86)',r'C:\Program Files (x86)'))/'Microsoft/Edge/Application/msedge.exe',
            Path('/usr/bin/chromium')
        ]:
            if exe.is_file():
                options['executable_path']=str(exe)
                break
        browser=p.chromium.launch(**options)
        for width,height in WIDTHS:
            page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
            errors=[]
            leads=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.route('**/api/lead',lambda route:(
                leads.append(route.request.url),
                route.abort()))
            page.route('https://fonts.googleapis.com/**',lambda route:route.abort())
            page.route('https://fonts.gstatic.com/**',lambda route:route.abort())
            page.goto(base,wait_until='networkidle')
            assert page.locator('#catalogGrid .product-card').count()==4,(width,'catalog render')
            assert page.locator('.mobile-cta a[href="tel:+79517349999"]').count()==1
            for theme in ['sun','rain']:
                page.locator('[data-weather="'+theme+'"]').first.click()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2'),(width,theme,'document overflow')
                if width<=850:
                    bar=page.locator('.mobile-cta-dual')
                    assert bar.is_visible(),(width,theme,'missing sticky CTA')
                    metrics=bar.evaluate("""el=>{
                        let r=el.getBoundingClientRect(),s=getComputedStyle(el);
                        return {position:s.position,bottom:r.bottom,height:r.height,viewport:innerHeight};
                    }""")
                    assert metrics['position']=='fixed',(width,theme,metrics)
                    assert abs(metrics['bottom']-metrics['viewport'])<=2,(width,theme,'CTA at viewport bottom')
                    for selector in [
                        'a[href="tel:+79517349999"]',
                        'button[data-flow="callback"]'
                    ]:
                        button=bar.locator(selector)
                        box=button.bounding_box()
                        assert box and box['height']>=49,(width,theme,selector,box)
                    if width<=550:
                        sizes=page.locator('.product-card[data-model="kvadro-house"] .product-sizes')
                        assert sizes.evaluate('el=>getComputedStyle(el).whiteSpace')=='normal',(width,theme,'sizes nowrap')
                        assert sizes.evaluate('el=>el.scrollWidth<=el.clientWidth+2'),(width,theme,'sizes overflow')
                    if theme=='rain':
                        for selector in [
                            '[data-slot="catalog-kvadro-house-rain"].media-ready',
                            '[data-slot="bundle-comfort-rain"].media-ready'
                        ]:
                            frame=page.locator(selector)
                            if frame.count():
                                assert frame.first.evaluate('el=>getComputedStyle(el,"::before").content')=='none',(width,selector,'photo blend')
                    bar.locator('button[data-flow="callback"]').click()
                    assert page.locator('#contactDialog').evaluate('el=>el.open'),(width,theme,'callback did not open')
                    assert not bar.is_visible(),(width,theme,'CTA obscures dialog')
                    assert page.locator('#dialogClose').bounding_box()['height']>=43
                    page.locator('#dialogClose').click()
                    card=page.locator('.product-card[data-model="kvadro-house"] .gallery-cover')
                    card.click()
                    assert page.locator('#modelGallery').evaluate('el=>el.open'),(width,theme,'gallery did not open')
                    page.locator('[data-gallery-close]').click()
                else:
                    assert not page.locator('.mobile-cta-dual').is_visible(),(width,theme,'desktop bar visible')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2'),(width,theme,'overflow after interactions')
            assert not errors,(width,errors)
            assert not leads,(width,'UNEXPECTED_LEAD_POSTS')
            print('MOBILE_BROWSER_PASS',width,'SUN_RAIN','LEADS=0',flush=True)
            page.close()
        browser.close()
finally:
    server.shutdown()
print('MOBILE_BROWSER_QA=PASS_8_WIDTHS_2_THEMES; PRODUCTION_WRITES=0')

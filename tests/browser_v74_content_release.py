"""Limited release acceptance on local source only. No live leads or messages."""
import functools
import http.server
import json
import os
import re
import tempfile
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
CATALOG=json.loads((ROOT/'data/catalog-pricebook.json').read_text('utf-8'))
OUT=Path(tempfile.gettempdir())/'dachapar-v74-content-evidence'
OUT.mkdir(exist_ok=True)
metrics=[]
class Local(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_POST(self):self.send_error(405,'All test submissions must be intercepted')
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Local,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_address[1]}/'
try:
    with sync_playwright() as p:
        opts={'headless':True}
        for candidate in [Path(os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE','/__not_configured__')),Path(os.environ.get('PROGRAMFILES',r'C:\Program Files'))/'Google/Chrome/Application/chrome.exe',Path(os.environ.get('PROGRAMFILES(X86)',r'C:\Program Files (x86)'))/'Microsoft/Edge/Application/msedge.exe',Path('/usr/bin/chromium')]:
            if candidate.is_file():opts['executable_path']=str(candidate);break
        browser=p.chromium.launch(**opts)
        for width,height in [(320,700),(390,844),(768,900),(1366,768),(1920,1080)]:
            page=browser.new_page(viewport={'width':width,'height':height},reduced_motion='reduce')
            errors=[];calls=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            def accept(route):
                calls.append(route.request.post_data_json)
                route.fulfill(status=200,content_type='application/json',body=json.dumps({'ok':True,'delivered':True,'leadId':'LOCAL-MOCK'}))
            page.route('**/api/lead',accept)
            page.route('https://fonts.googleapis.com/**',lambda route:route.abort())
            page.route('https://fonts.gstatic.com/**',lambda route:route.abort())
            page.goto(base,wait_until='networkidle')
            expect(page.locator('.product-card')).to_have_count(4)
            for theme in ['sun','rain']:
                page.locator(f'[data-weather="{theme}"]').first.click()
                for model in ['kvadro','parus','viking','kvadro-house']:
                    card=page.locator(f'.product-card[data-model="{model}"]')
                    card.scroll_into_view_if_needed()
                    image=card.locator('img[data-v5-photo]')
                    expected='hero-sun.webp' if model=='kvadro-house' else model+'-outside-v68.webp'
                    expect(image).to_have_attribute('src',re.compile(re.escape(expected)))
                    assert image.evaluate('im=>im.decode().then(()=>im.naturalWidth>0)')
                    card.locator('.gallery-cover').click()
                    gallery=page.locator('#modelGallery')
                    expect(gallery).to_be_visible()
                    expect(page.locator('#modelGalleryImage')).to_have_attribute('src',re.compile(re.escape(expected)))
                    if model=='kvadro-house':
                        assert gallery.locator('.model-gallery-thumb').count()==3
                        gallery.locator('[data-gallery-next]').click()
                        assert 'outside-01.jpg' in page.locator('#modelGalleryImage').get_attribute('src')
                    page.keyboard.press('Escape')
                assert page.locator('#base .base-kit-list li').count()==19
                page.locator('[data-weather-scene="skyline"] a[href="#bundle"]').click()
                assert page.url.endswith('#bundle')
                total=int(''.join(ch for ch in page.locator('#bundleNew').inner_text() if ch.isdigit()))
                assert total==618022
                page.locator('[data-bundle="summary"]').click()
                state=page.evaluate('window.__GARANT_DEMO__.getState()')
                assert state['modelId']=='kvadro' and state['sizeId']=='500'
                assert set(state['optionIds'])==set(CATALOG['featuredBundle']['selectedOptionIds'])
                assert page.evaluate('window.__GARANT_DEMO__.quote().total')==618022
                page.locator('.builder-aside [data-flow="quote"]').click()
                form=page.locator('#contactForm')
                expect(form).to_be_visible()
                assert form.locator('input[type="checkbox"]').count()==0
                assert form.locator('input[required]').count()==1
                previous=len(calls)
                form.locator('#submitButton').click()
                expect(page.locator('#formError')).to_contain_text('номер')
                assert len(calls)==previous
                form.locator('[name="phone"]').fill('+79991234567')
                form.locator('#submitButton').click()
                expect(page.locator('#formResult')).to_be_visible()
                assert len(calls)==previous+1 and calls[-1]['consent'] is True
                assert calls[-1]['configuration']['pricebookVersion']==CATALOG['version']
                assert set(calls[-1]['configuration']['optionIds'])==set(CATALOG['featuredBundle']['selectedOptionIds'])
                page.locator('#dialogClose').click()
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
                assert page.evaluate('getComputedStyle(document.documentElement).scrollSnapType')=='none'
                rows=page.locator('main > section').evaluate_all("els=>els.map(el=>({id:el.id||el.dataset.weatherScene||el.className,height:Math.round(el.getBoundingClientRect().height),heading:el.querySelector('h1,h2')?.textContent.trim()}))")
                metrics.append(dict(width=width,height=height,theme=theme,sections=rows))
                for selector,label in [('#base','base'),('#why-us','construction'),('#bundle','bundle')]:
                    page.locator(selector).scroll_into_view_if_needed()
                    page.screenshot(path=str(OUT/f'{width}-{theme}-{label}.png'),animations='disabled')
                assert not errors,errors
            page.close()
            print('V74_CONTENT_BROWSER_PASS',width,height,'BOTH_THEMES; LEADS_INTERCEPTED_LOCALLY',flush=True)
        browser.close()
finally:
    server.shutdown()
(OUT/'sections.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2),encoding='utf-8')
print('V74_CONTENT_BROWSER=PASS; REAL_LEADS=0; EVIDENCE='+str(OUT))

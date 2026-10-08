"""Local browser smoke; intercepts personal-data POSTs with a test receipt."""
import contextlib, functools, http.server, threading, json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
httpd = http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
threading.Thread(target=httpd.serve_forever,daemon=True).start()
base='about:blank'
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--allow-file-access-from-files'])
    for width,height,label in [(1440,900,'desktop'),(390,844,'mobile'),(320,720,'compact')]:
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
        errors=[];posts=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('request',lambda req:posts.append(req.url) if req.method=='POST' else None)
        html=(ROOT/'index.html').read_text(encoding='utf-8')
        import re
        html=re.sub(r'<link[^>]+(?:fonts.googleapis|fonts.gstatic|assets/css/site.css)[^>]*>', '', html)
        html=html.replace('<script type="module" src="assets/js/app.js"></script>', '')
        page.goto('about:blank')
        page.set_content(html.replace('<head>', '<head><base href="https://xn----7sbbigeqcfm8bq.xn--p1ai/bani-preview/">', 1))
        css=(ROOT/'assets/css/site.css').read_text(encoding='utf-8')
        page.add_style_tag(content=css)
        pb=(ROOT/'data/pricebook.js').read_text(encoding='utf-8').replace('export const PRICEBOOK', 'const PRICEBOOK')
        qe=(ROOT/'assets/js/quote-engine.js').read_text(encoding='utf-8').replace("import {PRICEBOOK} from '../../data/pricebook.js';",'').replace('export const ', 'const ').replace('export function ','function ')
        js=(ROOT/'assets/js/app.js').read_text(encoding='utf-8')
        js=js.replace("import {PRICEBOOK} from '../../data/pricebook.js';",'').replace("import {calculateQuote,formatMoney,getModel,getOption} from './quote-engine.js';",'')
        page.add_script_tag(content=pb+'\n'+qe+'\n'+js)
        
        page.evaluate("""() => {
          window.__leadCalls = [];
          window.fetch = async (url, options) => {
            window.__leadCalls.push({url:String(url), data:JSON.parse(options.body)});
            return {ok:true,status:200,json:async()=>({ok:true,delivered:true})};
          };
        }""")
        page.wait_for_selector('#catalogGrid .product-card')
        page.locator('[data-weather="rain"]').click()
        assert 'За окном дождь' in page.locator('#heroTitle').inner_text()
        page.locator('[data-weather="sun"]').click()
        assert 'Растопили баню' in page.locator('#heroTitle').inner_text()
        page.locator('[data-bundle="summary"]').click()
        state=page.evaluate('window.__GARANT_DEMO__.getState()')
        assert state['step']==6 and len(state['optionIds'])==5 and state['bundleId']=='family-comfort-demo',state
        assert '857' in page.locator('#quoteTotal').inner_text()
        page.locator('#builderBack').click()  # go back from summary to delivery
        page.locator('#builderBack').click()  # comfort options
        page.locator('[data-option="window"]').click()
        assert '857' not in page.locator('#quoteTotal').inner_text()
        # Test callback flow; mock delivery captures data without contacting a live server.
        page.locator('.faq [data-flow="callback"]').click()
        assert page.locator('#contactDialog').evaluate('(d)=>d.open')
        page.locator('#contactForm input[name="phone"]').fill('abc')
        page.locator('#contactForm input[name="leadConsent"]').check()
        page.locator('#contactForm button[type=submit]').click()
        assert 'номер' in page.locator('#formError').inner_text().lower()
        page.locator('#contactForm input[name="phone"]').fill('+7 999 123-45-67')
        assert page.locator('#contactForm input[name="phone"]').input_value()=='+7 (999) 123-45-67'
        assert page.locator('#phoneHint').get_attribute('data-valid')=='true'
        assert page.locator('#contactChannel option').count()==3
        page.locator('#contactForm button[type=submit]').click()
        page.locator('#formResult').wait_for(state='visible')
        assert 'Заявка отправлена' in page.locator('#formResult').inner_text()
        page.locator('#dialogClose').click()
        # full quote, ensure no public contact info and full validation
        page.locator('.builder-aside [data-flow="quote"]').click()
        form=page.locator('#contactForm')
        form.locator('[name="customerName"]').fill('Тестовый клиент')
        form.locator('[name="phone"]').fill('+7 999 123-45-67')
        form.locator('[name="district"]').fill('Вологодский район')
        form.locator('[name="contactChannel"]').select_option('max')
        form.locator('[name="contactAccount"]').fill('https://max.ru/id1234567')
        form.locator('[name="leadConsent"]').check()
        form.locator('button[type="submit"]').click()
        page.locator('#formResult').wait_for(state='visible')
        assert 'Заявка отправлена' in page.locator('#formResult').inner_text()
        calls=page.evaluate('window.__leadCalls')
        assert len(calls)==2,calls
        assert calls[0]['data']['flow']=='callback',calls
        assert calls[1]['data']['flow']=='quote',calls
        assert calls[1]['data']['configuration']['modelId']=='kvadro-house',calls
        assert calls[0]['data']['contactChannel']=='phone',calls
        assert calls[1]['data']['contactChannel']=='max',calls
        assert calls[1]['data']['contactAccount']=='https://max.ru/id1234567',calls
        assert calls[0]['url'].endswith('/api/lead'),calls
        assert posts==[],posts
        page.locator('#dialogClose').click()
        bounds=page.evaluate('({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth})')
        assert bounds['document']<=bounds['viewport']+1,bounds
        assert errors==[],errors
        if label=='desktop':
            page.screenshot(path=str(ROOT/'docs'/'qa-desktop.png'),full_page=True)
        if label=='mobile':
            page.screenshot(path=str(ROOT/'docs'/'qa-mobile.png'),full_page=True)
        results.append({'viewport':width,'weather':True,'bundle':True,'forms':True,'post_count':len(posts),'js_errors':errors,'scroll':bounds})
        page.close()
    browser.close()
httpd.shutdown()
print(json.dumps({'status':'PASS','views':results},ensure_ascii=False))

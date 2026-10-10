"""Local browser smoke; intercepts personal-data POSTs with a test receipt."""
import contextlib, functools, http.server, threading, json, os, sys, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
httpd = http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
threading.Thread(target=httpd.serve_forever,daemon=True).start()
base='http://127.0.0.1:'+str(httpd.server_address[1])+'/'
SHOT_DIR = Path(tempfile.gettempdir()) / 'garant-bani-mobile-qa'
SHOT_DIR.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
    binary=os.environ.get('CHROME_BIN') or shutil.which('chromium') or shutil.which('chromium-browser')
    if not binary and sys.platform.startswith('win'):
        for candidate in [
            Path(os.environ.get('PROGRAMFILES',r'C:\Program Files'))/'Google'/'Chrome'/'Application'/'chrome.exe',
            Path(os.environ.get('PROGRAMFILES(X86)',r'C:\Program Files (x86)'))/'Google'/'Chrome'/'Application'/'chrome.exe',
            Path(os.environ.get('LOCALAPPDATA',''))/'Google'/'Chrome'/'Application'/'chrome.exe',
            Path(os.environ.get('PROGRAMFILES',r'C:\Program Files'))/'Microsoft'/'Edge'/'Application'/'msedge.exe'
        ]:
            if candidate.is_file():
                binary=str(candidate)
                break
    launch_args={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
    if binary: launch_args['executable_path']=binary
    browser=p.chromium.launch(**launch_args)
    for width,height,label in [(1440,900,'desktop'),(390,844,'mobile'),(320,720,'compact')]:
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
        errors=[];posts=[];calls=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('request',lambda req:posts.append(req.url) if req.method=='POST' else None)
        # Fully exercise actual HTML, stylesheet, and ES module imports via local HTTP.
        # No requests to the production website or real MAX service.
        page.route('https://fonts.googleapis.com/**',lambda route:route.abort())
        page.route('https://fonts.gstatic.com/**',lambda route:route.abort())
        def mock_lead(route):
            request=route.request
            assert request.method=='POST',request.method
            assert request.url.startswith(base),request.url
            calls.append({'url':request.url,'data':request.post_data_json})
            route.fulfill(status=200,content_type='application/json',
                          body='{"ok":true,"delivered":true}')
        page.route('**/api/lead',mock_lead)
        page.goto(base,wait_until='domcontentloaded')
        page.wait_for_selector('#catalogGrid .product-card')
        assert page.locator('.footer-legal a').count()==2
        assert page.locator('.footer-legal a[href="privacy.html"]').count()==1
        assert page.locator('.footer-legal a[href="consent.html"]').count()==1
        assert page.locator('.footer-links a[href="manager.html"]').count()==1
        assert page.locator('.footer-legal a[href="manager.html"]').count()==0
        assert page.locator('input[name="leadConsent"]').count()==0
        assert page.locator('input[name="contactAccount"]').count()==0
        if label!='desktop':
            assert page.locator('#menuToggle').is_visible()
            page.locator('#menuToggle').click()
            assert page.locator('#menuToggle').get_attribute('aria-expanded')=='true'
            page.locator('.primary-nav a[href="#builder"]').click()
            assert page.locator('#menuToggle').get_attribute('aria-expanded')=='false'
            page.screenshot(path=str(SHOT_DIR/('garant-bani-'+label+'-main.png')),full_page=True)
        # SUN/RAIN is a site-wide theme, not a hero-only picture/text swap.
        toggle=page.locator('.hero-weather').bounding_box()
        media=page.locator('#heroMedia').bounding_box()
        assert toggle and media, 'WEATHER_LAYOUT_MISSING'
        intersects=(toggle['x']<media['x']+media['width'] and
                    toggle['x']+toggle['width']>media['x'] and
                    toggle['y']<media['y']+media['height'] and
                    toggle['y']+toggle['height']>media['y'])
        assert not intersects, 'WEATHER_SWITCH_OVERLAPS_PRODUCT'
        assert page.locator('html').get_attribute('data-theme')=='sun'
        sun_colors=page.evaluate("""() => ({
          page:getComputedStyle(document.body).backgroundColor,
          catalog:getComputedStyle(document.querySelector('.catalog')).backgroundColor,
          builder:getComputedStyle(document.querySelector('.builder-section')).backgroundColor,
          footer:getComputedStyle(document.querySelector('.footer')).backgroundColor
        })""")
        page.locator('[data-weather="rain"]').click()
        assert 'За окном дождь' in page.locator('#heroTitle').inner_text()
        assert page.locator('html').get_attribute('data-theme')=='rain'
        assert page.locator('[data-weather="rain"]').get_attribute('aria-pressed')=='true'
        rain_colors=page.evaluate("""() => ({
          page:getComputedStyle(document.body).backgroundColor,
          catalog:getComputedStyle(document.querySelector('.catalog')).backgroundColor,
          builder:getComputedStyle(document.querySelector('.builder-section')).backgroundColor,
          footer:getComputedStyle(document.querySelector('.footer')).backgroundColor
        })""")
        for section in ('page','catalog','builder','footer'):
            assert sun_colors[section]!=rain_colors[section], (section,sun_colors,rain_colors)
        page.locator('[data-weather="sun"]').click()
        assert 'Растопили баню' in page.locator('#heroTitle').inner_text()
        assert page.locator('html').get_attribute('data-theme')=='sun'
        assert page.locator('[data-weather="sun"]').get_attribute('aria-pressed')=='true'
        page.locator('[data-bundle="summary"]').click()
        state=page.evaluate('window.__GARANT_DEMO__.getState()')
        assert state['step']==6 and len(state['optionIds'])==5 and state['bundleId']=='family-comfort-demo',state
        assert '857' in page.locator('#quoteTotal').inner_text()
        total_before_theme_change=page.locator('#quoteTotal').inner_text()
        page.locator('[data-weather="rain"]').click()
        assert page.locator('#quoteTotal').inner_text()==total_before_theme_change, 'THEME_CHANGED_PRICE'
        assert page.evaluate('window.__GARANT_DEMO__.getState()')['optionIds']==state['optionIds'], 'THEME_CHANGED_OPTIONS'
        page.locator('[data-weather="sun"]').click()
        page.locator('#builderBack').click()  # go back from summary to delivery
        page.locator('#builderBack').click()  # comfort options
        page.locator('[data-option="window"]').click()
        assert '857' not in page.locator('#quoteTotal').inner_text()
        # Test callback flow; mock delivery captures data without contacting a live server.
        page.locator('.faq [data-flow="callback"]').click()
        assert page.locator('#contactDialog').evaluate('(d)=>d.open')
        page.locator('#contactForm input[name="phone"]').fill('abc')
        page.locator('#contactForm button[type=submit]').click()
        assert 'номер' in page.locator('#formError').inner_text().lower()
        page.locator('#contactForm input[name="phone"]').fill('+7 999 123-45-67')
        assert page.locator('#contactForm input[name="phone"]').input_value()=='+7 (999) 123-45-67'
        assert page.locator('#formError').inner_text()==''  # stale red error must clear
        assert page.locator('#formError').is_hidden()
        assert page.locator('#phoneHint').get_attribute('data-valid')=='true'
        assert page.locator('#contactChannelField').is_hidden()
        assert page.locator('#contactForm a[href="privacy.html"]').count()==1
        assert page.locator('#contactForm a[href="consent.html"]').count()==1
        if label!='desktop':
            box=page.locator('#contactDialog').bounding_box()
            assert box and box['x']>=-1 and box['x']+box['width']<=width+1,box
            assert page.locator('#contactDialog').evaluate('(el)=>el.scrollWidth<=el.clientWidth+2')
            # Inline required marker must share the label's line on narrow screens.
            assert page.locator('#contactForm label').filter(has=page.locator('input[name="phone"]')).evaluate("""label=>{
                const star=label.querySelector('b');
                const text=label.firstChild;
                const range=document.createRange();
                range.selectNodeContents(text);
                const rect=range.getBoundingClientRect();
                return Math.abs(star.getBoundingClientRect().top-rect.top)<8;
            }"""),'REQUIRED_STAR_WRAPPED'
            page.locator('#contactDialog').evaluate('(el)=>{el.scrollTop=0}')
            page.screenshot(path=str(SHOT_DIR/('garant-bani-'+label+'-callback.png')),full_page=False)
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
        assert form.locator('#contactChannelField').is_visible()
        assert form.locator('[name="contactChannel"] option').count()==4
        form.locator('[name="contactChannel"]').select_option('whatsapp')
        assert form.locator('[name="phone"]').input_value()=='+7 (999) 123-45-67'
        chosen=page.evaluate('window.__GARANT_DEMO__.quote().options.map(x=>x.name)')
        summary=page.locator('#formQuote').inner_text()
        assert chosen and all(x in summary for x in chosen),(chosen,summary)
        if label!='desktop':
            assert page.locator('#contactDialog').evaluate('(el)=>el.scrollWidth<=el.clientWidth+2')
            page.locator('#contactDialog').evaluate('(el)=>{el.scrollTop=0}')
            page.screenshot(path=str(SHOT_DIR/('garant-bani-'+label+'-quote.png')),full_page=False)
            page.locator('#contactDialog').evaluate('(el)=>{el.scrollTop=el.scrollHeight}')
            assert form.locator('a[href="privacy.html"]').is_visible()
            assert form.locator('a[href="consent.html"]').is_visible()
            page.screenshot(path=str(SHOT_DIR/('garant-bani-'+label+'-quote-bottom.png')),full_page=False)
        form.locator('button[type="submit"]').click()
        page.locator('#formResult').wait_for(state='visible')
        assert 'Заявка отправлена' in page.locator('#formResult').inner_text()
        assert len(calls)==2,calls
        assert calls[0]['data']['flow']=='callback',calls
        assert calls[1]['data']['flow']=='quote',calls
        assert calls[1]['data']['configuration']['modelId']=='kvadro-house',calls
        assert calls[0]['data']['contactChannel']=='phone',calls
        assert calls[0]['data']['consent'] is True,calls
        assert calls[1]['data']['consent'] is True,calls
        assert calls[1]['data']['contactChannel']=='whatsapp',calls
        assert 'contactAccount' not in calls[1]['data'],calls
        assert 'contactAccount' not in calls[0]['data'],calls
        assert calls[0]['url'].endswith('/api/lead'),calls
        assert len(posts)==2,posts
        assert all(url.startswith(base) for url in posts),posts
        page.locator('#dialogClose').click()
        bounds=page.evaluate('({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth})')
        assert bounds['document']<=bounds['viewport']+1,bounds
        assert errors==[],errors
        if label=='desktop':
            page.screenshot(path=str(SHOT_DIR/'garant-bani-desktop-main.png'),full_page=True)
        results.append({'viewport':width,'weather':True,'bundle':True,'forms':True,'post_count':len(posts),'js_errors':errors,'scroll':bounds})
        page.close()
    for doc in ['privacy.html','consent.html']:
        page=browser.new_page(viewport={'width':320,'height':720})
        page.goto(base+doc,wait_until='domcontentloaded')
        assert page.locator('h1').is_visible(),doc
        bounds=page.evaluate('({viewport:innerWidth,document:document.documentElement.scrollWidth})')
        assert bounds['document']<=bounds['viewport']+1,(doc,bounds)
        page.screenshot(path=str(SHOT_DIR/('garant-bani-'+doc+'.png')),full_page=True)
        page.close()
    browser.close()
httpd.shutdown()
print(json.dumps({'status':'PASS','views':results,'screenshots':str(SHOT_DIR)},ensure_ascii=False))

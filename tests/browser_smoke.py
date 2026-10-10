"""Local browser smoke; intercepts personal-data POSTs with a test receipt."""
import contextlib, functools, http.server, threading, json, os, sys, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
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
    for width,height,label in [(1440,900,'desktop'),(1920,1080,'wide'),(768,1024,'tablet'),(390,844,'mobile'),(320,720,'compact')]:
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
        # Catalog markup may render before boot crashes: verify all init steps ran.
        page.wait_for_function(
            "() => Boolean(window.__GARANT_DEMO__ && typeof window.__GARANT_DEMO__.quote === 'function')",
            timeout=10000
        )
        assert errors==[], f'V5_BOOT_JAVASCRIPT_ERRORS: {errors}'
        # V5: the actual local media pack must be present before deployment.
        page.wait_for_function("""() => {
          const hero=document.querySelector('#heroMedia img[data-v5-photo]');
          return hero && hero.complete && hero.naturalWidth>0;
        }""",timeout=10000)
        sun_hero_src=page.locator('#heroMedia img[data-v5-photo]').get_attribute('src')
        catalog_src=[]
        for card in page.locator('#catalogGrid .product-card').all():
            card.scroll_into_view_if_needed()
            image=card.locator('img[data-v5-photo]')
            image.wait_for(state='visible')
            assert image.evaluate('(img)=>img.decode().then(()=>img.naturalWidth>0).catch(()=>false)'), 'CATALOG_MEDIA_BROKEN'
            catalog_src.append(image.get_attribute('src'))
        assert len(catalog_src)==4 and len(set(catalog_src))==4, catalog_src
        for image in page.locator('.media-frame img[data-v5-photo]').all():
            image.scroll_into_view_if_needed()
            assert image.evaluate('(img)=>img.decode().then(()=>img.naturalWidth>0).catch(()=>false)'), 'V5_PHOTO_FAILED_TO_LOAD'
        page.screenshot(path=str(SHOT_DIR/('garant-bani-'+label+'-sun.png')),full_page=True)
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
        assert not intersects, f'WEATHER_SWITCH_OVERLAPS_PRODUCT width={width} switch={toggle} media={media}'
        toolbar=page.locator('.hero-toolbar').bounding_box()
        assert toolbar and toolbar['y']+toolbar['height']<=media['y']+1, (
            f'WEATHER_TOOLBAR_NOT_SEPARATE width={width} toolbar={toolbar} media={media}')
        assert page.locator('html').get_attribute('data-theme')=='sun'
        assert page.locator('.weather-window').count()==2
        assert page.locator('.atmos-rain').count()==0
        assert page.locator('.site-clouds .cloud-bank').count()==2
        assert page.locator('.site-clouds').evaluate("(n)=>getComputedStyle(n).pointerEvents")=='none'
        # Each weather window uses the exact common content rail, not viewport width.
        rails=page.evaluate("""() => {
          const reference=document.querySelector('.hero-grid').getBoundingClientRect();
          return [...document.querySelectorAll('.weather-window-content')].map(n=>{
            const r=n.getBoundingClientRect();
            return {left:r.left,right:r.right,refLeft:reference.left,refRight:reference.right};
          });
        }""")
        for rail in rails:
            assert abs(rail['left']-rail['refLeft'])<=2, (width,rail)
            assert abs(rail['right']-rail['refRight'])<=2, (width,rail)
            assert rail['left']>=14,(width,rail)
        assert 'Солнце на участке' in page.locator('#skylineTitle').inner_text()
        expect(page.locator('html')).to_have_attribute('data-motion','on')
        sun_colors=page.evaluate("""() => ({
          page:getComputedStyle(document.body).backgroundColor,
          catalog:getComputedStyle(document.querySelector('.catalog')).backgroundColor,
          builder:getComputedStyle(document.querySelector('.builder-section')).backgroundColor,
          footer:getComputedStyle(document.querySelector('.footer')).backgroundColor
        })""")
        page.locator('[data-weather="rain"]').click()
        expect(page.locator('#heroTitle')).to_contain_text('Небо затянуло тучами')
        assert page.locator('html').get_attribute('data-theme')=='rain'
        assert page.locator('[data-weather="rain"]').get_attribute('aria-pressed')=='true'
        assert 'Тучи над дачей' in page.locator('#skylineTitle').inner_text()
        cloud_motion=page.evaluate("""() => getComputedStyle(
          document.querySelector('.cloud-bank-near')
        ).animationName""")
        assert 'v61-cloud-drift-near' in cloud_motion, f'CLOUDS_NOT_ANIMATING: {cloud_motion}'
        page.locator('#bundle').scroll_into_view_if_needed()
        page.wait_for_function("""() => parseFloat(
          document.documentElement.style.getPropertyValue('--v61-cloud-scroll')
        )>0""",timeout=10000)
        # Cloud motion is background-only, never injected on bathhouse photography.
        assert page.locator('.media-frame .cloud-bank').count()==0
        page.wait_for_function("""() => {
          const img=document.querySelector('#heroMedia img[data-v5-photo]');
          return img && img.complete && img.naturalWidth>0;
        }""",timeout=10000)
        assert page.locator('#heroMedia img[data-v5-photo]').get_attribute('src')==sun_hero_src, 'WEATHER_CHANGED_BATHHOUSE_PHOTO'
        assert page.locator('[data-slot="bundle-comfort"] img[data-v5-photo]').get_attribute('src')==sun_hero_src
        assert page.locator('[data-slot="catalog-kvadro-house"] img[data-v5-photo]').get_attribute('src')==sun_hero_src
        assert [c.locator('img[data-v5-photo]').get_attribute('src') for c in page.locator('#catalogGrid .product-card').all()]==catalog_src, 'CATALOG_IMAGE_CHANGED_WITH_WEATHER'
        # Wait for CSS transition completion before sampling computed colors.
        expect(page.locator('body')).to_have_css('background-color','rgb(12, 25, 42)')
        rain_colors=page.evaluate("""() => ({
          page:getComputedStyle(document.body).backgroundColor,
          catalog:getComputedStyle(document.querySelector('.catalog')).backgroundColor,
          builder:getComputedStyle(document.querySelector('.builder-section')).backgroundColor,
          footer:getComputedStyle(document.querySelector('.footer')).backgroundColor
        })""")
        for section in ('page','catalog','builder','footer'):
            assert sun_colors[section]!=rain_colors[section], (section,sun_colors,rain_colors)
        page.screenshot(path=str(SHOT_DIR/('garant-bani-'+label+'-rain.png')),full_page=True)
        if label=='mobile':
            page.emulate_media(reduced_motion='reduce')
            expect(page.locator('html')).to_have_attribute('data-motion','off')
            reduced_cloud=page.evaluate("""() => ({
              animation:getComputedStyle(document.querySelector('.cloud-bank-near')).animationName,
              shift:getComputedStyle(document.documentElement).getPropertyValue('--v61-cloud-scroll')
            })""")
            assert reduced_cloud['animation']=='none', f'REDUCED_MOTION_STILL_ANIMATING: {reduced_cloud}'
            assert float(reduced_cloud['shift'].strip().replace('px','') or '0')==0, reduced_cloud
            page.emulate_media(reduced_motion='no-preference')
            expect(page.locator('html')).to_have_attribute('data-motion','on')
        page.locator('[data-weather="sun"]').click()
        assert 'Растопили баню' in page.locator('#heroTitle').inner_text()
        assert page.locator('html').get_attribute('data-theme')=='sun'
        assert page.locator('[data-weather="sun"]').get_attribute('aria-pressed')=='true'
        expect(page.locator('body')).to_have_css('background-color','rgb(247, 250, 249)')
        # Full boot also needs working catalog selection; a static card alone is insufficient.
        page.locator('[data-catalog-select="viking"]').click()
        model_after_catalog=page.evaluate('window.__GARANT_DEMO__.getState()')
        assert model_after_catalog['modelId']=='viking' and model_after_catalog['step']==1, model_after_catalog
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

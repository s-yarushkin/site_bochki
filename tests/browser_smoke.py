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
SHOT_DIR = Path(tempfile.gettempdir()) / 'garant-bani-v65-legal-qa'
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
    for width,height,label in [(1440,900,'desktop'),(1366,768,'laptop'),(1280,720,'short'),(1920,1080,'wide'),(768,1024,'tablet'),(390,844,'mobile'),(320,720,'compact')]:
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
        # V6.4: the four-model construction story is an actual responsive
        # customer block, not just text buried in a test fixture.
        assert page.locator('#why-us').count()==1, ('OWNER_TRUST_SECTION_MISSING',width)
        assert page.locator('#why-us .difference-point').count()==4, ('OWNER_TRUST_PILLARS_MISSING',width)
        trust_sun_bg=page.locator('#why-us').evaluate(
            "(el)=>getComputedStyle(el).backgroundColor")
        page.locator('#why-us').evaluate(
            "(el)=>el.scrollIntoView({block:'start',behavior:'instant'})")
        page.screenshot(path=str(SHOT_DIR/('garant-bani-'+label+'-trust-sun.png')),full_page=False)
        # V6.5 operator footer: visible legal ID, link targets and no overflow.
        footer=page.locator('.footer-operator')
        assert footer.count()==1, 'OPERATOR_FOOTER_MISSING'
        assert footer.locator('strong').inner_text()=='ООО «ГАРАНТ-ГРУПП»'
        assert '1233500004650' in footer.inner_text()
        assert page.locator('.footer-legal a[href="privacy.html"]').count()==1
        assert page.locator('.footer-legal a[href="consent.html"]').count()==1
        footer.scroll_into_view_if_needed()
        assert footer.evaluate('(el)=>el.getBoundingClientRect().width<=window.innerWidth+1')
        page.screenshot(path=str(SHOT_DIR/('garant-bani-'+label+'-legal-footer-sun.png')),full_page=False)
        page.screenshot(path=str(SHOT_DIR/('garant-bani-'+label+'-sun.png')),full_page=True)
        assert page.locator('.footer-legal a').count()==2
        assert page.locator('.footer-legal a[href="privacy.html"]').count()==1
        assert page.locator('.footer-legal a[href="consent.html"]').count()==1
        assert page.locator('.footer-links a[href="manager.html"]').count()==0
        assert page.locator('.footer-legal a[href="manager.html"]').count()==0
        assert page.locator('input[name="leadConsent"]').count()==0
        assert page.locator('input[name="contactAccount"]').count()==0
        # The breakpoint is CSS max-width:850px, not the viewport label.
        # A 1920px 'wide' viewport must retain desktop navigation.
        assert page.locator('#menuToggle').is_visible()==(width<=850), ('MENU_BREAKPOINT',width)
        if width<=850:
            assert page.locator('#menuToggle').is_visible()
            page.locator('#menuToggle').click()
            assert page.locator('#menuToggle').get_attribute('aria-expanded')=='true'
            page.locator('.primary-nav a[href="#builder"]').click()
            assert page.locator('#menuToggle').get_attribute('aria-expanded')=='false'
            page.screenshot(path=str(SHOT_DIR/('garant-bani-'+label+'-main.png')),full_page=True)
        # V6.3: a menu jump must reveal the four catalog prices/CTAs
        # within the desktop/laptop viewport, under the sticky navigation.
        if width>=1100 and height<=900:
            page.locator('.primary-nav a[href="#models"]').click()
            # Wait for a *settled* anchor, not a transient position mid-smooth-scroll.
            # The old assertion could pass while #models crossed 88px on its way
            # to the wrong final 178px position (double header compensation).
            def wait_anchor_settled(selector):
                page.wait_for_function("""selector => {
                    const y=document.querySelector(selector).getBoundingClientRect().top;
                    const last=window.__gbAnchorSample;
                    const stable=last && last.selector===selector && Math.abs(last.y-y)<.3;
                    const count=(y>=70 && y<=110 && stable) ? last.count+1 : 0;
                    window.__gbAnchorSample={selector,y,count};
                    return count>=7;
                }""",arg=selector,timeout=12000)
            wait_anchor_settled('#models')
            for card in page.locator('#catalogGrid .product-card').all():
                price=card.locator('.product-price').bounding_box()
                action=card.locator('[data-catalog-select]').bounding_box()
                assert price and 0<=price['y'] and price['y']+price['height']<=height-8, (
                    'MODEL_PRICE_BELOW_VIEWPORT',width,height,price)
                assert action and 0<=action['y'] and action['y']+action['height']<=height-8, (
                    'MODEL_CTA_BELOW_VIEWPORT',width,height,action)
            page.screenshot(path=str(SHOT_DIR/('garant-bani-'+label+'-catalog-viewport.png')),full_page=False)
            # Recheck the remaining header anchors: each destination must stop
            # below the sticky header (without a 2x offset).
            for href,target in [('#bundle','#bundle'),('#delivery','#delivery'),
                                ('#builder','#builder')]:
                page.locator('.primary-nav a[href="'+href+'"]').click()
                wait_anchor_settled(target)
                dest=page.locator(target).bounding_box()
                assert dest and 70<=dest['y']<=110, (
                    'ANCHOR_DOUBLE_OFFSET_OR_HEADER_OVERLAP',width,height,target,dest)
            # Return to #models before the following theme/form assertions.
            page.locator('.primary-nav a[href="#models"]').click()
            wait_anchor_settled('#models')
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
        sun_cta=page.locator('.final-cta').evaluate("(e)=>getComputedStyle(e).backgroundImage")
        assert 'hero-sun.webp' in sun_cta, ('SUN_CTA_WRONG_IMAGE',width,sun_cta)
        assert 'side-kvadro-house.webp' not in sun_cta, ('SUN_CTA_OLD_IMAGE',width,sun_cta)
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
        # Check all Kvadro House presentations independently. The same SUN
        # slot legitimately exists twice (catalog and builder), so an
        # unscoped Playwright locator is ambiguous and fails strict mode.
        weather_frame_selectors={
            'hero':'#heroMedia img[data-v5-photo]',
            'catalog':'#catalogGrid .product-card[data-model="kvadro-house"] img[data-v5-photo]',
            'bundle':'.bundle-photo img[data-v5-photo]',
            'details':'.detail-photo[data-slot="side-kvadro-house"] img[data-v5-photo]',
            'builder':'#previewImage img[data-v5-photo]',
        }
        sun_crop={}
        for name,selector in weather_frame_selectors.items():
            assert page.locator(selector).count()==1, ('SUN_SCENE_SELECTOR_NOT_UNIQUE',width,name,selector)
            sun_crop[name]=page.locator(selector).evaluate(
                '(el)=>getComputedStyle(el).objectPosition')
        page.locator('[data-weather="rain"]').click()
        rain_crop={}
        for name,selector in weather_frame_selectors.items():
            if name=='details':
                selector='.detail-photo[data-slot="side-kvadro-house-rain"] img[data-v5-photo]'
            assert page.locator(selector).count()==1, ('RAIN_SCENE_SELECTOR_NOT_UNIQUE',width,name,selector)
            rain_crop[name]=page.locator(selector).evaluate(
                '(el)=>getComputedStyle(el).objectPosition')
            assert sun_crop[name]==rain_crop[name], (
                'WEATHER_CROP_DRIFT',width,name,sun_crop[name],rain_crop[name])
        expect(page.locator('#heroTitle')).to_contain_text('Небо затянуло тучами')
        assert page.locator('html').get_attribute('data-theme')=='rain'
        rain_cta=page.locator('.final-cta').evaluate("(e)=>getComputedStyle(e).backgroundImage")
        assert 'mood-evening.webp' in rain_cta, ('RAIN_CTA_IMAGE_REGRESSED',width,rain_cta)
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
        rain_hero_src=page.locator('#heroMedia img[data-v5-photo]').get_attribute('src')
        # Identical immutable geometry. Only a masked glass-light texture
        # from the approved dusk asset changes with the weather.
        assert rain_hero_src==sun_hero_src and rain_hero_src.endswith('/hero-sun.webp'), (
            'WEATHER_MASTER_GEOMETRY_DRIFT',width,sun_hero_src,rain_hero_src)
        night_layer=page.locator('#heroMedia').evaluate("""el => ({
            background:getComputedStyle(el,'::before').backgroundImage,
            mask:getComputedStyle(el,'::before').maskImage,
            visible:getComputedStyle(el,'::before').display,
            filter:getComputedStyle(el.querySelector('img[data-v5-photo]')).filter
        })""")
        assert 'hero-rain.webp' in night_layer['background'], ('NIGHT_LIGHT_LAYER_MISSING',width,night_layer)
        assert 'radial-gradient' in night_layer['mask'], ('NIGHT_LIGHT_NOT_WINDOW_MASKED',width,night_layer)
        assert night_layer['visible']!='none' and night_layer['filter']!='none', (
            'SAME_MASTER_NOT_DUSK_GRADED',width,night_layer)
        for target in [
            '[data-slot="bundle-comfort-rain"] img[data-v5-photo]',
            '#catalogGrid [data-slot="catalog-kvadro-house-rain"] img[data-v5-photo]',
            '.detail-photo[data-slot="side-kvadro-house-rain"] img[data-v5-photo]',
            '#previewImage[data-slot="catalog-kvadro-house-rain"] img[data-v5-photo]'
        ]:
            assert page.locator(target).count()==1,('RAIN_SLOT_MISSING',width,target)
            assert page.locator(target).get_attribute('src')==rain_hero_src,('RAIN_IMAGE_MISMATCH',width,target)
            assert page.locator(target).evaluate(
                "(img)=>img.complete && img.naturalWidth>0"), (
                'WEATHER_SHARED_MASTER_NOT_LOADED',width,target)
        rainy_catalog=[c.locator('img[data-v5-photo]').get_attribute('src') for c in page.locator('#catalogGrid .product-card').all()]
        assert rainy_catalog[:3]==catalog_src[:3], ('OTHER_MODELS_WEATHER_CHANGED',width,rainy_catalog)
        assert rainy_catalog[3]==rain_hero_src, ('KVADRO_HOUSE_STILL_SUN',width,rainy_catalog)
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
        # V6.3 visual-review regression: 320px RAIN screenshot once
        # lost the LEFT 50+ px of the hero after clicking the switch.
        # overflow:hidden is still a script-scrollable container even when
        # document scrollWidth == viewport width; overflow:clip is not.
        hero_alignment=page.evaluate("""() => {
            const hero=document.querySelector('.hero');
            const group=document.querySelector('.hero-weather').getBoundingClientRect();
            const copy=document.querySelector('.hero-copy').getBoundingClientRect();
            return {
                scrollLeft:hero.scrollLeft,
                overflow:getComputedStyle(hero).overflow,
                groupLeft:group.left,groupRight:group.right,
                copyLeft:copy.left,copyRight:copy.right,
                width:window.innerWidth
            };
        }""")
        assert hero_alignment['overflow']=='clip', (
            'HERO_HIDDEN_SCROLL_CONTAINER',width,hero_alignment)
        assert hero_alignment['scrollLeft']==0, (
            'RAIN_HERO_HORIZONTALLY_SCROLLED',width,hero_alignment)
        assert hero_alignment['groupLeft']>=-1 and hero_alignment['copyLeft']>=-1, (
            'RAIN_HERO_TEXT_CLIPPED_LEFT',width,hero_alignment)
        assert hero_alignment['groupRight']<=width+1 and hero_alignment['copyRight']<=width+1, (
            'RAIN_HERO_CONTENT_CLIPPED_RIGHT',width,hero_alignment)
        trust_rain_bg=page.locator('#why-us').evaluate(
            "(el)=>getComputedStyle(el).backgroundColor")
        assert trust_rain_bg!=trust_sun_bg, (
            'OWNER_TRUST_BLOCK_THEME_DID_NOT_SWITCH',width,trust_sun_bg,trust_rain_bg)
        page.locator('#why-us').evaluate(
            "(el)=>el.scrollIntoView({block:'start',behavior:'instant'})")
        page.screenshot(path=str(SHOT_DIR/('garant-bani-'+label+'-trust-rain.png')),full_page=False)
        page.locator('.footer-operator').scroll_into_view_if_needed()
        page.screenshot(path=str(SHOT_DIR/('garant-bani-'+label+'-legal-footer-rain.png')),full_page=False)
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
        assert page.locator('#heroMedia img[data-v5-photo]').get_attribute('src')==sun_hero_src
        assert page.locator('#previewImage').get_attribute('data-slot')=='catalog-kvadro-house'
        assert page.locator('[data-slot="bundle-comfort"] img[data-v5-photo]').get_attribute('src')==sun_hero_src
        assert page.locator('.detail-photo[data-slot="side-kvadro-house"]').count()==1
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
        assert page.evaluate('window.__GARANT_DEMO__.getState()')['modelId']==state['modelId'], 'THEME_CHANGED_MODEL'
        assert page.locator('#previewImage').get_attribute('data-slot')=='catalog-kvadro-house-rain'
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
        if width<=850:
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
        # Consent is separate, initially unchecked and never auto-submitted.
        consent=page.locator('#contactForm input[name="leadConsent"]')
        assert not consent.is_checked(), 'CONSENT_PRECHECKED_CALLBACK'
        page.locator('#contactForm button[type=submit]').click()
        assert 'согласие' in page.locator('#formError').inner_text().lower(), 'MISSING_CONSENT_NOT_REJECTED'
        assert len(calls)==0,'UNCONSENTED_CALLBACK_WAS_SENT'
        consent.check()
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
        if width<=850:
            assert page.locator('#contactDialog').evaluate('(el)=>el.scrollWidth<=el.clientWidth+2')
            page.locator('#contactDialog').evaluate('(el)=>{el.scrollTop=0}')
            page.screenshot(path=str(SHOT_DIR/('garant-bani-'+label+'-quote.png')),full_page=False)
            page.locator('#contactDialog').evaluate('(el)=>{el.scrollTop=el.scrollHeight}')
            assert form.locator('a[href="privacy.html"]').is_visible()
            assert form.locator('a[href="consent.html"]').is_visible()
            page.screenshot(path=str(SHOT_DIR/('garant-bani-'+label+'-quote-bottom.png')),full_page=False)
        assert not form.locator('[name="leadConsent"]').is_checked(), 'CONSENT_NOT_RESET_BETWEEN_FLOWS'
        form.locator('[name="leadConsent"]').check()
        form.locator('button[type="submit"]').click()
        page.locator('#formResult').wait_for(state='visible')
        assert 'Заявка отправлена' in page.locator('#formResult').inner_text()
        assert len(calls)==2,calls
        assert calls[0]['data']['flow']=='callback',calls
        assert calls[1]['data']['flow']=='quote',calls
        assert calls[0]['data']['consent'] is True and calls[1]['data']['consent'] is True,calls
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

"""V6.8 QA: seven viewport SUN/RAIN, seven vetted images, featured kit and consent.
Local static server and mock lead endpoint only; NEVER sends real customer requests.
"""
import functools, http.server, json, os, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
SHOT=Path(tempfile.gettempdir())/'garant-bani-v68-curated-concept-gallery-qa'
SHOT.mkdir(parents=True,exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

httpd=http.server.ThreadingHTTPServer(('127.0.0.1',0),
    functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=httpd.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{httpd.server_address[1]}/'

widths=[('wide',1920,1080),('desktop',1440,900),('laptop',1366,768),
        ('small-laptop',1280,800),('tablet',768,900),
        ('mobile',390,844),('mobile-small',320,700)]

try:
 with sync_playwright() as p:
  browser=None
  try:
   opts={'headless':True}
   candidates=[
    Path(os.environ.get('PROGRAMFILES',r'C:\Program Files'))/'Google'/'Chrome'/'Application'/'chrome.exe',
    Path(os.environ.get('PROGRAMFILES(X86)',r'C:\Program Files (x86)'))/'Microsoft'/'Edge'/'Application'/'msedge.exe']
   for f in candidates:
    if f.is_file():opts['executable_path']=str(f);break
   browser=p.chromium.launch(**opts)
   for label,w,h in widths:
    page=browser.new_page(viewport={'width':w,'height':h})
    errors=[];calls=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.route('https://fonts.googleapis.com/**',lambda r:r.abort())
    page.route('https://fonts.gstatic.com/**',lambda r:r.abort())
    def mock_lead(route):
     payload=route.request.post_data_json
     calls.append(payload)
     route.fulfill(status=200,content_type='application/json',
                   body=json.dumps({'ok':True,'delivered':True,'leadId':'GB-MOCK'}))
    page.route('**/api/lead',mock_lead)
    resp=page.goto(base,wait_until='domcontentloaded')
    assert resp.status==200,(label,resp.status)
    expect(page.locator('html')).to_have_attribute('data-theme','sun')
    assert not errors,('STARTUP_JS_ERROR',label,errors)
    assert page.locator('#builderStepLabel').inner_text()=='ШАГ 1 ИЗ 7',('BUILDER_STARTUP_FAILED',label)
    assert page.evaluate('typeof window.__GARANT_DEMO__')=='object',('BOOT_DID_NOT_COMPLETE',label)
    assert page.locator('.ai-visual-note').count()==0,('INTERNAL_MEDIA_DISCLOSURE_IN_UI',label)
    assert 'с использованием ИИ' not in page.locator('body').inner_text(),('TECHNICAL_AI_NOTES_VISIBLE',label)
    expect(page.locator('#heroMedia img[data-v5-photo]')).to_have_count(1)
    hero_sun=page.locator('#heroMedia img[data-v5-photo]').get_attribute('src')
    assert 'hero-sun.webp' in hero_sun,(label,hero_sun)
    assert page.locator('#catalogGrid .product-card').count()==4,label
    for model in ['kvadro','parus','viking','kvadro-house']:
      card=page.locator(f'.product-card[data-model="{model}"]')
      card.scroll_into_view_if_needed()
      expect(card.locator('img[data-v5-photo]')).to_have_count(1)
      assert f'{model}-outside-v68.webp' in card.locator('img[data-v5-photo]').get_attribute('src')
      sizes=card.locator('.product-sizes')
      size_text=sizes.inner_text()
      assert ('6×6 м' if model=='kvadro-house' else '6 м') in size_text,(model,size_text)
      assert sizes.evaluate('(el)=>el.scrollWidth<=el.clientWidth+2'),('SIZE_LABEL_CLIPPED',size_text,model)
      price=card.locator('.product-price')
      assert price.evaluate("""(el)=>{
        const node=[...el.childNodes].find(n=>n.nodeType===Node.TEXT_NODE && n.textContent.includes('₽'));
        if(!node)return false;
        const rng=document.createRange();rng.selectNodeContents(node);
        const rects=[...rng.getClientRects()].filter(r=>r.width>0);
        return rects.length===1 && rects[0].right<=el.getBoundingClientRect().right+2;
      }"""),('PRICE_RUBLE_SPLIT_OR_CLIPPED',model)
    assert page.locator('#model-interiors').count()==0,label
    assert page.locator('.ai-visual-note').count()==0,('TECHNICAL_DISCLAIMER_PRESENT',label)
    assert page.locator('.difference-experience-number').count()==0,('BIG_04_NOT_REMOVED',label)
    assert label in {'wide','desktop','laptop','small-laptop','tablet','mobile','mobile-small'},'VIEWPORT_FILENAME_ID_CORRUPTED'
    page.locator('#catalogGrid').screenshot(path=str(SHOT/f'{label}-catalog-sun.png'))
    for model,n in [('kvadro',3),('parus',2),('viking',1),('kvadro-house',1)]:
      cover=page.locator(f'.product-card[data-model="{model}"] [data-gallery-open]').first
      cover.click()
      dialog=page.locator('#modelGallery')
      expect(dialog).to_be_visible()
      assert {'kvadro':'Квадро','parus':'Парус','viking':'Викинг','kvadro-house':'Квадро Хаус'}[model] in dialog.locator('#modelGalleryTitle').inner_text(),(model,label)
      assert dialog.locator('.model-gallery-thumb').count()==n,(model,label)
      img=dialog.locator('#modelGalleryImage')
      assert f'{model}-outside-v68.webp' in img.get_attribute('src'),(model,label)
      assert img.evaluate('(im)=>im.decode().then(()=>im.naturalWidth>0).catch(()=>false)'),('MODEL_IMAGE_FAILED',model,label)
      assert img.evaluate('(im)=>getComputedStyle(im).objectFit')=='contain',('CROPPED_GALLERY_IMAGE',model,label)
      dialog.locator('[data-gallery-next]').click()
      expected_next={'kvadro':'kvadro-steam-v68.webp','parus':'parus-lounge-v68.webp',
                     'viking':'viking-outside-v68.webp','kvadro-house':'kvadro-house-outside-v68.webp'}[model]
      assert expected_next in img.get_attribute('src'),(model,label)
      assert dialog.locator('[aria-pressed="true"].model-gallery-thumb').count()==1,(model,label)
      dialog.screenshot(path=str(SHOT/f'{label}-gallery-{model}-sun.png'))
      page.keyboard.press('Escape')
      expect(dialog).not_to_be_visible()
    # Review ALL catalogue color/roof choices at every viewport. Verify thumbnails
    # load and are selectable independently without changing quote arithmetic.
    page.locator('#builderNext').click()
    page.locator('#builderNext').click()
    assert page.locator('#builderStepName').inner_text()=='Внешний вид',('BUILDER_STEP_INCORRECT',label,page.locator('#builderStepName').inner_text())
    assert not errors,('BUILDER_STEP_JS_ERROR',label,errors)
    assert page.locator('[data-finish]').count()==12,('FINISH_COUNT',label)
    assert page.locator('[data-roof]').count()==4,('ROOF_COUNT',label)
    for swatch in page.locator('.color-choices-catalog img.catalog-swatch').all():
      swatch.scroll_into_view_if_needed()
      assert swatch.evaluate('(img)=>img.decode().then(()=>img.naturalWidth>0).catch(()=>false)'),('SWATCH_IMAGE_NOT_LOADED',label)
    page.locator('#builderStepContent').screenshot(path=str(SHOT/f'{label}-body-and-roof-colors-sun.png'))
    page.locator('[data-finish="teak"]').click()
    assert page.locator('[data-finish="teak"]').get_attribute('aria-pressed')=='true'
    page.locator('[data-roof="red"]').click()
    assert page.locator('[data-roof="red"]').get_attribute('aria-pressed')=='true'
    page.locator('[data-finish="pine"]').click()
    page.locator('[data-roof="brown"]').click()
    page.locator('#builderBack').click()
    page.locator('#builderBack').click()
    assert page.locator('.footer-operator').count()==0,'LEGAL_ADDRESS_VISIBLE_IN_FOOTER'
    assert page.locator('.footer-legal a[href="privacy.html"]').count()==1
    legal=page.request.get(base+'privacy.html')
    assert legal.status==200 and '1233500004650' in legal.text()
    page.locator('.footer-bottom').scroll_into_view_if_needed()
    page.screenshot(path=str(SHOT/f'{label}-legal-links-sun.png'))
    page.locator('#bundle').scroll_into_view_if_needed()
    assert 'Квадро 5 м' in page.locator('#bundleTitle').inner_text()
    assert '490' in page.locator('#bundleNew').inner_text()
    assert page.locator('#bundleOptions li').count()==14
    assert not page.locator('#bundleOptions').get_by_text('₽').count(),'PRICES_LEAKED_IN_KIT_ITEMS'
    assert page.locator('.bundle-photo img[data-v5-photo]').evaluate('(im)=>getComputedStyle(im).objectFit')=='contain','BUNDLE_PHOTO_CROPPED'
    assert 'Обливаста' not in page.locator('#bundleOptions').inner_text()
    page.screenshot(path=str(SHOT/f'{label}-featured-sun.png'))
    page.locator('[data-bundle="summary"]').click()
    state=page.evaluate('window.__GARANT_DEMO__.getState()')
    assert state['modelId']=='kvadro' and state['sizeId']=='500' and len(state['optionIds'])==14,(label,state)
    assert '490' in page.locator('#quoteTotal').inner_text()
    page.locator('[data-weather="rain"]').click()
    expect(page.locator('html')).to_have_attribute('data-theme','rain')
    hero_rain=page.locator('#heroMedia img[data-v5-photo]').get_attribute('src')
    assert hero_rain==hero_sun,'Hero geometry changed'
    assert '490' in page.locator('#quoteTotal').inner_text()
    page.locator('#catalogGrid').screenshot(path=str(SHOT/f'{label}-catalog-rain.png'))
    page.locator('#bundle').scroll_into_view_if_needed()
    page.screenshot(path=str(SHOT/f'{label}-featured-rain.png'))
    page.locator('[data-weather="sun"]').click()
    # all 20 sizes in the shared catalogue: verify 4.5m and Kvadro House 6x5.
    page.locator('[data-catalog-select="kvadro"]').click()
    page.locator('[data-choose-size="450"]').click()
    assert '330' in page.locator('#quoteTotal').inner_text()
    page.locator('[data-catalog-select="kvadro-house"]').click()
    page.locator('[data-choose-size="6x5"]').click()
    assert '739' in page.locator('#quoteTotal').inner_text()
    # Callback: without checkbox no network request; consent reinitializes for a new flow.
    page.locator('.footer-ask [data-flow="callback"]').click()
    form=page.locator('#contactForm')
    form.locator('input[name="phone"]').fill('+7 999 123-45-67')
    checkbox=form.locator('[name="leadConsent"]')
    assert not checkbox.is_checked(),label
    form.locator('#submitButton').click()
    assert 'согласие' in page.locator('#formError').inner_text().lower(),label
    assert calls==[],label
    checkbox.check()
    form.locator('#submitButton').click()
    page.locator('#formResult').wait_for(state='visible')
    assert len(calls)==1 and calls[0]['consent'] is True,calls
    assert calls[0]['consentVersion']=='2026-10-12',calls
    page.locator('#dialogClose').click()
    page.locator('.builder-aside [data-flow="quote"]').click()
    assert not page.locator('#contactForm [name="leadConsent"]').is_checked(),label
    page.locator('#contactForm input[name="customerName"]').fill('Тест')
    page.locator('#contactForm input[name="phone"]').fill('+7 999 123-45-67')
    page.locator('#contactForm input[name="district"]').fill('Вологодский район')
    page.locator('#contactForm [name="leadConsent"]').check()
    page.locator('#contactForm #submitButton').click()
    page.locator('#formResult').wait_for(state='visible')
    assert len(calls)==2,calls
    assert calls[1]['configuration']['sizeId']=='6x5',calls
    assert calls[1]['configuration']['roof']=='brown',calls
    if w<=390:
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),f'OVERFLOW_{label}'
    assert not errors,(label,errors)
    print('V66_BROWSER_VIEWPORT_PASS',label,w,h,'requests',len(calls))
    page.close()
  finally:
   if browser:browser.close()
finally:
 httpd.shutdown()
print('V66_BROWSER_QA=PASS_7_VIEWPORTS')
print('V66_SCREENSHOTS_DIR='+str(SHOT))

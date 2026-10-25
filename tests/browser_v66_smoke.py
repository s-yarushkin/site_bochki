"""V6.8 QA: seven viewport SUN/RAIN, seven vetted images, featured kit and consent.
Local static server and mock lead endpoint only; NEVER sends real customer requests.
"""
import functools, http.server, json, os, tempfile, threading
import re
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
base=os.environ.get('DACHA_QA_BASE') or f'http://127.0.0.1:{httpd.server_address[1]}/'
if os.environ.get('DACHA_QA_BASE'):
 assert base=='https://xn--80aaan1dh9b.xn--p1ai/','UNEXPECTED_LIVE_QA_TARGET'

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
      card_image=card.locator('img[data-v5-photo]')
      expected_catalog=f'{model}-outside-v68.webp'
      assert expected_catalog in card_image.get_attribute('src'),('CATALOG_OWNER_PHOTO_OR_V68_MISMATCH',model,label,card_image.get_attribute('src'))
      assert card_image.evaluate('(im)=>im.decode().then(()=>im.naturalWidth>0).catch(()=>false)'),('CATALOG_IMAGE_MISSING_OR_NOT_DECODED',model,label)
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
    for model,n in [('kvadro',3),('parus',4),('viking',4),('kvadro-house',3)]:
      cover=page.locator(f'.product-card[data-model="{model}"] [data-gallery-open]').first
      cover.click()
      dialog=page.locator('#modelGallery')
      expect(dialog).to_be_visible()
      assert {'kvadro':'Квадро','parus':'Парус','viking':'Викинг','kvadro-house':'Квадро Хаус'}[model] in dialog.locator('#modelGalleryTitle').inner_text(),(model,label)
      assert dialog.locator('.model-gallery-thumb').count()==n,(model,label)
      for control in ('prev','next'):
        nav=dialog.locator(f'[data-gallery-{control}]')
        assert nav.is_visible()==(n>1),('SINGLE_IMAGE_NAVIGATION',model,control,label)
      img=dialog.locator('#modelGalleryImage')
      expected_first=f'{model}-outside-v68.webp'
      assert expected_first in img.get_attribute('src'),(model,label)
      assert img.evaluate('(im)=>im.decode().then(()=>im.naturalWidth>0).catch(()=>false)'),('MODEL_IMAGE_FAILED',model,label)
      assert img.evaluate('(im)=>getComputedStyle(im).objectFit')=='contain',('CROPPED_GALLERY_IMAGE',model,label)
      if n>1:
        dialog.locator('[data-gallery-next]').click()
        expected_next={'kvadro':'kvadro-steam-v68.webp','parus':'outside-01.png','viking':'outside-01.jpg','kvadro-house':'outside-01.jpg'}[model]
        assert expected_next in img.get_attribute('src'),(model,label)
        assert img.evaluate('(im)=>im.decode().then(()=>im.naturalWidth>0).catch(()=>false)'),('NEXT_IMAGE_FAILED',model,label)
        dialog.locator('[data-gallery-prev]').click()
        assert expected_first in img.get_attribute('src'),(model,label)
      else:
        assert f'{model}-outside-v68.webp' in img.get_attribute('src'),(model,label)
        assert not dialog.locator('[data-gallery-next]').is_visible(),('SINGLE_IMAGE_NAV_VISIBLE',model,label)
      assert dialog.locator('[aria-pressed="true"].model-gallery-thumb').count()==1,(model,label)
      if model=='parus':
        dialog.locator('[data-gallery-scene-select="outside"]').click()
        assert dialog.locator('.model-gallery-thumb').count()==3,('PARUS_OUTSIDE_COUNT',label)
        dialog.locator('[data-gallery-next]').click()
        assert 'outside-01.png' in img.get_attribute('src'),('PARUS_OUTSIDE_01',label)
        assert img.evaluate('(im)=>im.decode().then(()=>im.naturalWidth>0).catch(()=>false)'),('PARUS_EDIT_01_DECODE',label)
        dialog.locator('[data-gallery-next]').click()
        assert 'outside-02.png' in img.get_attribute('src'),('PARUS_OUTSIDE_02',label)
        assert img.evaluate('(im)=>im.decode().then(()=>im.naturalWidth>0).catch(()=>false)'),('PARUS_EDIT_02_DECODE',label)
        dialog.locator('[data-gallery-scene-select="inside"]').click()
        assert dialog.locator('.model-gallery-thumb').count()==1,('PARUS_INSIDE_PRESERVED',label)
        assert 'parus-lounge-v68.webp' in img.get_attribute('src'),('PARUS_INTERIOR_UNCHANGED',label)
        dialog.locator('[data-gallery-scene-select="all"]').click()
        assert dialog.locator('.model-gallery-thumb').count()==4,('PARUS_ALL_COUNT',label)
      if model=='viking':
        dialog.locator('[data-gallery-scene-select="outside"]').click()
        assert dialog.locator('.model-gallery-thumb').count()==3,('VIKING_OUTSIDE_COUNT',label)
        dialog.locator('[data-gallery-next]').click()
        assert 'outside-01.jpg' in img.get_attribute('src'),('VIKING_OUTSIDE_SECOND',label)
        dialog.locator('[data-gallery-next]').click()
        assert 'outside-02.jpg' in img.get_attribute('src'),('VIKING_OUTSIDE_THIRD',label)
        dialog.locator('[data-gallery-scene-select="inside"]').click()
        assert dialog.locator('.model-gallery-thumb').count()==1,('VIKING_INSIDE_COUNT',label)
        assert 'inside-01.jpg' in img.get_attribute('src'),('VIKING_INSIDE_OWNER_IMAGE',label)
        assert not dialog.locator('[data-gallery-next]').is_visible(),('VIKING_SINGLE_INSIDE_ARROWS',label)
        dialog.locator('[data-gallery-scene-select="all"]').click()
        assert dialog.locator('.model-gallery-thumb').count()==4,('VIKING_ALL_COUNT',label)
      if model=='kvadro-house':
        dialog.locator('[data-gallery-scene-select="outside"]').click()
        assert dialog.locator('.model-gallery-thumb').count()==3,('KVADRO_HOUSE_OUTSIDE_COUNT',label)
        dialog.locator('[data-gallery-next]').click()
        assert 'outside-01.jpg' in img.get_attribute('src'),('KVADRO_HOUSE_REAL_01',label)
        assert img.evaluate('(im)=>im.decode().then(()=>im.naturalWidth>0).catch(()=>false)'),('KVADRO_HOUSE_REAL_01_DECODE',label)
        dialog.locator('[data-gallery-next]').click()
        assert 'outside-02.jpg' in img.get_attribute('src'),('KVADRO_HOUSE_REAL_02',label)
        assert img.evaluate('(im)=>im.decode().then(()=>im.naturalWidth>0).catch(()=>false)'),('KVADRO_HOUSE_REAL_02_DECODE',label)
        assert dialog.locator('[data-gallery-scene-select="inside"]').count()==0,('KVADRO_HOUSE_UNSUPPORTED_INSIDE_SHOWN',label)
      dialog.screenshot(path=str(SHOT/f'{label}-gallery-{model}-sun.png'))
      page.keyboard.press('Escape')
      expect(dialog).not_to_be_visible()
    # Parus builder: existing cover + two approved landscape edits, interior untouched.
    page.locator('[data-choose-model="parus"]').click()
    expect(page.locator('#previewImage img[data-v5-photo]')).to_have_attribute('src',re.compile('parus-outside-v68\\.webp'))
    assert page.locator('#builderPhotoControls').is_visible(),('PARUS_OUTSIDE_NAV_MISSING',label)
    page.locator('[data-builder-photo-step="1"]').click()
    expect(page.locator('#previewImage img[data-v5-photo]')).to_have_attribute('src',re.compile('outside-01\\.png'))
    page.locator('[data-builder-photo-step="1"]').click()
    expect(page.locator('#previewImage img[data-v5-photo]')).to_have_attribute('src',re.compile('outside-02\\.png'))
    page.locator('[data-builder-photo-step="1"]').click()
    expect(page.locator('#previewImage img[data-v5-photo]')).to_have_attribute('src',re.compile('parus-outside-v68\\.webp'))
    page.locator('[data-view="inside"]').click()
    expect(page.locator('#previewImage img[data-v5-photo]')).to_have_attribute('src',re.compile('parus-lounge-v68\\.webp'))
    page.locator('[data-view="outside"]').click()
    # Viking builder uses same owner's three real shots; scene switches keep correct photos.
    page.locator('[data-choose-model="viking"]').click()
    expect(page.locator('#previewImage img[data-v5-photo]')).to_have_attribute('src',re.compile('viking-outside-v68\\.webp'))
    assert page.locator('#builderPhotoControls').is_visible(),('VIKING_BUILDER_OUTSIDE_NAV_MISSING',label)
    page.locator('[data-builder-photo-step="1"]').click()
    expect(page.locator('#previewImage img[data-v5-photo]')).to_have_attribute('src',re.compile('outside-01\\.jpg'))
    page.locator('[data-builder-photo-step="1"]').click()
    expect(page.locator('#previewImage img[data-v5-photo]')).to_have_attribute('src',re.compile('outside-02\\.jpg'))
    page.locator('[data-view="inside"]').click()
    expect(page.locator('#previewImage img[data-v5-photo]')).to_have_attribute('src',re.compile('inside-01\\.jpg'))
    assert not page.locator('#builderPhotoControls').is_visible(),('VIKING_BUILDER_INSIDE_SINGLE_NAV_VISIBLE',label)
    page.locator('[data-view="outside"]').click()
    page.locator('[data-choose-model="kvadro"]').click()
    page.locator('[data-view="inside"]').click()
    expect(page.locator('#previewImage img[data-v5-photo]')).to_have_attribute('src',re.compile('kvadro-steam-v68\\.webp'))
    assert page.locator('#builderPhotoControls').is_visible(),('KVADRO_INSIDE_NAV_MISSING',label)
    page.locator('[data-builder-photo-step="1"]').click()
    expect(page.locator('#previewImage img[data-v5-photo]')).to_have_attribute('src',re.compile('kvadro-lounge-v68\\.webp'))
    page.locator('[data-view="outside"]').click()
    page.locator('[data-choose-model="kvadro-house"]').click()
    expect(page.locator('#previewImage img[data-v5-photo]')).to_have_attribute('src',re.compile('kvadro-house-outside-v68\\.webp'))
    assert page.locator('#builderPhotoControls').is_visible(),('KVADRO_HOUSE_BUILDER_NAV_MISSING',label)
    assert page.locator('[data-view="inside"]').is_disabled(),('KVADRO_HOUSE_UNAPPROVED_INTERIOR_ACTIVE',label)
    page.locator('[data-builder-photo-step="1"]').click()
    expect(page.locator('#previewImage img[data-v5-photo]')).to_have_attribute('src',re.compile('outside-01\\.jpg'))
    page.locator('[data-builder-photo-step="1"]').click()
    expect(page.locator('#previewImage img[data-v5-photo]')).to_have_attribute('src',re.compile('outside-02\\.jpg'))
    page.locator('[data-builder-photo-step="1"]').click()
    expect(page.locator('#previewImage img[data-v5-photo]')).to_have_attribute('src',re.compile('kvadro-house-outside-v68\\.webp'))
    page.locator('[data-choose-model="kvadro"]').click()
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
    assert legal.status==200 and '1263500003590' in legal.text() and 'ГАРАНТ-ГРУПП' not in legal.text()
    page.locator('.footer-bottom').scroll_into_view_if_needed()
    page.screenshot(path=str(SHOT/f'{label}-legal-links-sun.png'))
    assert page.title()=='Готовые бани с доставкой в Москву и области — Дача Пар',label
    assert page.locator('#base .base-kit-list li').count()==17,('BASE_KIT_COUNT',label)
    assert page.locator('#personal .personal-options article').count()==4,('CUSTOM_OPTIONS',label)
    assert page.locator('#delivery .delivery-choice').count()==2,('DELIVERY_MODES',label)
    assert page.locator('.footer-legal a[href="requisites.html"]').count()==1
    assert 'ООО' not in page.locator('footer').inner_text(),('COMPANY_IN_FOOTER',label)
    assert 'ООО' not in page.locator('#contactDialog').text_content(),('COMPANY_IN_CONSENT_UI',label)
    assert page.request.get(base+'requisites.html').status==200,('REQUISTES_404',label)
    page.locator('#base').screenshot(path=str(SHOT/f'{label}-base-kit.png'))
    page.locator('#personal').screenshot(path=str(SHOT/f'{label}-personalization.png'))
    page.locator('#delivery').screenshot(path=str(SHOT/f'{label}-delivery-options.png'))
    page.locator('#bundle').scroll_into_view_if_needed()
    assert 'Квадро 5 м' in page.locator('#bundleTitle').inner_text()
    assert '630' in page.locator('#bundleNew').inner_text()
    assert '630 000' in page.locator('#bundleTitle').inner_text().replace('\u00a0',' ')
    assert page.evaluate('window.__GARANT_DEMO__.quote().pricebookVersion')=='2026-10-16-sheet-site-v1'
    assert page.locator('#bundleOptions li').count()==14
    assert not page.locator('#bundleOptions').get_by_text('₽').count(),'PRICES_LEAKED_IN_KIT_ITEMS'
    assert page.locator('.bundle-photo img[data-v5-photo]').evaluate('(im)=>getComputedStyle(im).objectFit')=='contain','BUNDLE_PHOTO_CROPPED'
    assert page.locator('.bundle-photo img[data-v5-photo]').evaluate('(im)=>im.decode().then(()=>im.naturalWidth>0).catch(()=>false)'),('BUNDLE_IMAGE_NOT_LOADED',label)
    assert 'Обливаста' not in page.locator('#bundleOptions').inner_text()
    page.locator('#bundle').screenshot(path=str(SHOT/f'{label}-featured-sun.png'))
    page.locator('[data-bundle="summary"]').click()
    state=page.evaluate('window.__GARANT_DEMO__.getState()')
    assert state['modelId']=='kvadro' and state['sizeId']=='500' and len(state['optionIds'])==14,(label,state)
    assert '630' in page.locator('#quoteTotal').inner_text()
    page.locator('[data-weather="rain"]').click()
    expect(page.locator('html')).to_have_attribute('data-theme','rain')
    hero_rain=page.locator('#heroMedia img[data-v5-photo]').get_attribute('src')
    assert hero_rain==hero_sun,'Hero geometry changed'
    assert '630' in page.locator('#quoteTotal').inner_text()
    page.locator('#catalogGrid').screenshot(path=str(SHOT/f'{label}-catalog-rain.png'))
    page.locator('#bundle').scroll_into_view_if_needed()
    page.locator('#bundle').screenshot(path=str(SHOT/f'{label}-featured-rain.png'))
    page.locator('[data-weather="sun"]').click()
    # all 20 sizes in the shared catalogue: verify 4.5m and Kvadro House 6x5.
    page.locator('[data-catalog-select="kvadro"]').click()
    page.locator('[data-choose-size="450"]').click()
    assert '465' in page.locator('#quoteTotal').inner_text()
    page.locator('[data-catalog-select="kvadro-house"]').click()
    page.locator('[data-choose-size="6x5"]').click()
    assert '839' in page.locator('#quoteTotal').inner_text()
    # One of the new manager CTAs carries a topic into the existing callback payload.
    page.locator('#personal [data-flow="callback"]').click()
    assert 'индивидуальную комплектацию' in page.locator('#contactForm [name="comment"]').input_value(),('CUSTOM_TOPIC_NOT_PREFILLED',label)
    page.locator('#dialogClose').click()
    # One submit, no checkbox; phone-only callback and quote preserve configuration.
    page.locator('.footer-ask [data-flow="callback"]').click()
    form=page.locator('#contactForm')
    assert form.locator('input[type="checkbox"]').count()==0
    assert calls==[],label
    form.locator('input[name="phone"]').fill('+7 999 123-45-67')
    form.locator('#submitButton').click()
    page.locator('#formResult').wait_for(state='visible')
    assert len(calls)==1 and calls[0]['consent'] is True,calls
    assert calls[0]['consentVersion']=='2026-10-16' and calls[0]['consentMethod']=='submit-button-v1',calls
    page.locator('#dialogClose').click()
    page.locator('.builder-aside [data-flow="quote"]').click()
    page.locator('#contactForm input[name="phone"]').fill('+7 999 123-45-67')
    page.locator('#contactForm #submitButton').click()
    page.locator('#formResult').wait_for(state='visible')
    assert len(calls)==2,calls
    assert calls[1]['name']=='' and calls[1]['district']==''
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

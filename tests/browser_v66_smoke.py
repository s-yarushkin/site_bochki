"""V6.6 QA: seven viewport SUN/RAIN, catalog, featured 490k, size, legal consent.
Local static server and mock lead endpoint only; NEVER sends real customer requests.
"""
import functools, http.server, json, os, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
SHOT=Path(tempfile.gettempdir())/'garant-bani-v66-predeploy-qa'
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
    expect(page.locator('#heroMedia img[data-v5-photo]')).to_have_count(1)
    hero_sun=page.locator('#heroMedia img[data-v5-photo]').get_attribute('src')
    assert 'hero-sun.webp' in hero_sun,(label,hero_sun)
    assert page.locator('#catalogGrid .product-card').count()==4,label
    for model in ['kvadro','parus','viking','kvadro-house']:
      card=page.locator(f'.product-card[data-model="{model}"]')
      card.scroll_into_view_if_needed()
      expect(card.locator('img[data-v5-photo]')).to_have_count(1)
      assert f'{model}-outside.webp' in card.locator('img[data-v5-photo]').get_attribute('src')
      assert card.locator('.product-sizes').inner_text()
    assert page.locator('.details-grid-models .detail-card').count()==4,label
    for model in ['kvadro','parus','viking','kvadro-house']:
      gallery=page.locator(f'[data-model-jump="{model}"]').locator('xpath=..')
      gallery.scroll_into_view_if_needed()
      assert gallery.locator('.model-images .media-frame').count()==2,model
      for img in gallery.locator('.model-images img[data-v5-photo]').all():
        assert 'catalog-v66' in img.get_attribute('src'),(model,label)
    page.locator('.footer-operator').scroll_into_view_if_needed()
    assert '1233500004650' in page.locator('.footer-operator').inner_text()
    page.screenshot(path=str(SHOT/f'{label}-legal-footer.png'))
    page.locator('#bundle').scroll_into_view_if_needed()
    assert 'Квадро 5 м' in page.locator('#bundleTitle').inner_text()
    assert '490' in page.locator('#bundleNew').inner_text()
    assert page.locator('#bundleOptions .bundle-item').count()==14
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
    page.locator('#bundle').scroll_into_view_if_needed()
    page.screenshot(path=str(SHOT/f'{label}-featured-rain.png'))
    page.locator('[data-weather="sun"]').click()
    # all 20 sizes in the shared catalogue: verify 4.5m and Kvadro House 6x5.
    page.locator('[data-model-jump="kvadro"]').click()
    page.locator('[data-choose-size="450"]').click()
    assert '330' in page.locator('#quoteTotal').inner_text()
    page.locator('[data-model-jump="kvadro-house"]').click()
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

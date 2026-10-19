"""V74-03: four real catalogue cards -> accurate base dialog -> chosen model.
No production HTTP requests or lead creation; captures screenshots at several sizes.
"""
import json
import functools
import http.server
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/v74/artifacts/03-base/screenshots'
OUT.mkdir(parents=True,exist_ok=True)
catalog=json.loads((ROOT/'data/catalog-pricebook.json').read_text('utf-8'))
ids=['kvadro','parus','viking','kvadro-house']
sizes=[(320,700),(390,844),(768,900),(1366,768),(1920,1080)]
leads=[]
class Local(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):self.send_error(405,'Never accept test lead')
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Local,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  for w,h in sizes:
   page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1,reduced_motion='reduce')
   errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.route('**/api/lead',lambda route:(leads.append(route.request.url),route.abort()))
   page.goto(f'http://127.0.0.1:{server.server_address[1]}/',wait_until='domcontentloaded')
   page.wait_for_selector('.product-card[data-model="kvadro-house"]')
   for theme in ['sun','rain']:
    page.locator(f'[data-weather="{theme}"]').first.click()
    for model in ids:
     control=page.locator(f'[data-base-open="{model}"]')
     assert control.count()==1,(w,model,'missing base trigger')
     control.click()
     dialog=page.locator('#baseDialog')
     assert dialog.evaluate('x=>x.open'),(w,model,'not open')
     amount=min(catalog['prices'][model].values())
     price=int(''.join(ch for ch in page.locator('#baseDialogPrice').inner_text() if ch.isdigit()))
     assert price==amount,(w,model,price,amount)
     assert dialog.locator('#baseDialogGroups section').count()==3
     assert dialog.locator('#baseDialogGroups li').count()==6
     assert dialog.locator('#baseDialogSpecific p').inner_text()==catalog['baseInclusions']['modelSpecific'][model]
     assert dialog.locator('#baseDialogExcluded li').count()==3
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
     page.screenshot(path=str(OUT/f'{w}x{h}-{theme}-{model}.png'),animations='disabled')
     page.locator('[data-base-select]').click()
     state=page.evaluate('window.__GARANT_DEMO__.getState()')
     assert state['modelId']==model and state['step']==1,(w,model,state)
     assert page.locator('#builderTitle').evaluate('x=>x===document.activeElement'),(w,model,'focus')
     page.locator(f'[data-base-open="{model}"]').click()
     page.keyboard.press('Escape')
     assert not dialog.evaluate('x=>x.open'),(w,model,'escape')
    page.locator('[data-base-open="kvadro"]').click()
    page.locator('[data-base-full]').click()
    assert not page.locator('#baseDialog').evaluate('x=>x.open')
    assert page.url.endswith('#base'),(w,theme,page.url)
   assert not errors,(w,errors)
   page.close()
   print('V74_BASE_BROWSER_PASS',w,h,'4_MODEL_SUN_RAIN_LEADS=0',flush=True)
  browser.close()
finally:
 server.shutdown()
assert not leads,leads
print('V74_BASE_BROWSER_QA=PASS; LEADS=0; PRODUCTION_WRITES=0')

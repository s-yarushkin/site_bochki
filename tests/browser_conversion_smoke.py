"""Conversion paths; all lead requests are intercepted, no production writes/MAX."""
import functools,http.server,json,os,threading,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=os.environ.get('DACHA_QA_BASE') or f'http://127.0.0.1:{server.server_address[1]}/'
if os.environ.get('DACHA_QA_BASE'):assert base=='https://xn--80aaan1dh9b.xn--p1ai/'
shots=Path(tempfile.gettempdir())/'dachapar-conversion-qa';shots.mkdir(exist_ok=True)
try:
 with sync_playwright() as p:
  opts={'headless':True}
  for candidate in [Path(os.environ.get('PROGRAMFILES',r'C:\Program Files'))/'Google/Chrome/Application/chrome.exe',Path(os.environ.get('PROGRAMFILES(X86)',r'C:\Program Files (x86)'))/'Microsoft/Edge/Application/msedge.exe']:
   if candidate.is_file():opts['executable_path']=str(candidate);break
  browser=p.chromium.launch(**opts)
  for width,height in [(1920,1080),(1440,900),(1366,768),(1280,800),(768,900),(390,844),(320,700)]:
   page=browser.new_page(viewport={'width':width,'height':height});calls=[];errors=[];mode={'fail':False}
   def route(r):
    calls.append(r.request.post_data_json)
    r.fulfill(status=502 if mode['fail'] else 200,content_type='application/json',body=json.dumps({'ok':not mode['fail'],'delivered':not mode['fail']}))
   page.route('**/api/lead',route);page.route('https://fonts.googleapis.com/**',lambda r:r.abort());page.route('https://fonts.gstatic.com/**',lambda r:r.abort())
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(base,wait_until='networkidle')
   for theme in ['sun','rain']:
    page.locator('[data-weather="'+theme+'"]').first.click()
    if width<=550:page.locator('.mobile-cta [data-flow="callback"]').click()
    else:page.locator('.footer-ask [data-flow="callback"]').click()
    form=page.locator('#contactForm');expect(form).to_be_visible()
    assert form.locator('input[type="checkbox"]').count()==0
    assert form.locator('input[required]').count()==1
    assert not page.locator('#formExtra').evaluate('(e)=>e.open')
    previous=len(calls)
    form.locator('#submitButton').click();assert len(calls)==previous
    expect(page.locator('#formError')).to_contain_text('номер')
    form.locator('input[name="phone"]').fill('+79991234567')
    assert len(calls)==previous
    expect(page.locator('#submitConsentNotice a[href="consent.html"]')).to_be_visible()
    if theme=='sun':page.locator('#contactDialog').screenshot(path=str(shots/f'{width}-form.png'))
    form.locator('#submitButton').click();expect(page.locator('#formResult')).to_be_visible()
    assert len(calls)==previous+1
    assert calls[-1]['consent'] is True and calls[-1]['consentVersion']=='2026-10-16' and calls[-1]['consentMethod']=='submit-button-v1'
    assert calls[-1]['name']==''
    page.locator('#dialogClose').click()
    page.evaluate('window.__GARANT_DEMO__.applyBundle()')
    page.locator('.builder-aside [data-flow="quote"]').click()
    form.locator('input[name="phone"]').fill('+79991234567')
    mode['fail']=True;previous=len(calls)
    form.locator('#submitButton').click();expect(page.locator('#formError')).to_contain_text('Не удалось')
    expect(form).to_be_visible();expect(form.locator('input[name="phone"]')).not_to_have_value('')
    expect(form.locator('#submitButton')).to_be_enabled()
    assert len(calls)==previous+1
    mode['fail']=False
    form.locator('input[name="phone"]').press('Enter');expect(page.locator('#formResult')).to_be_visible()
    assert len(calls)==previous+2 and calls[-1]['requestId']==calls[-2]['requestId']
    assert calls[-1]['name']=='' and calls[-1]['district']==''
    assert calls[-1]['configuration']['modelId']=='kvadro' and len(calls[-1]['configuration']['optionIds'])==14
    page.locator('#dialogClose').click()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
   assert not errors,errors
   page.close();print('CONVERSION_BROWSER_PASS',width,'SUN_RAIN','mock_requests',len(calls),flush=True)
  browser.close()
finally:server.shutdown()
print('CONVERSION_BROWSER_QA=PASS_7_WIDTHS_2_THEMES; REAL_LEAD_POSTS=0; MAX_CALLS=0')

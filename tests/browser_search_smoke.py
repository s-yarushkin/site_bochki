"""Nine search pages at seven widths; read-only. Model handoff checked on root.
All lead POSTs are aborted. No working client lead or MAX message is created.
"""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
httpd=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=httpd.serve_forever,daemon=True).start()
base=os.environ.get('DACHA_SEARCH_BASE') or f'http://127.0.0.1:{httpd.server_address[1]}/'
if os.environ.get('DACHA_SEARCH_BASE'):assert base=='https://xn--80aaan1dh9b.xn--p1ai/'
pages=json.loads((ROOT/'seo/pages.json').read_text())['pages']
try:
 with sync_playwright() as p:
  options={'headless':True}
  for candidate in [Path(os.environ.get('PROGRAMFILES',r'C:\Program Files'))/'Google/Chrome/Application/chrome.exe',Path(os.environ.get('PROGRAMFILES(X86)',r'C:\Program Files (x86)'))/'Microsoft/Edge/Application/msedge.exe']:
   if candidate.is_file():options['executable_path']=str(candidate);break
  browser=p.chromium.launch(**options)
  for width in [1920,1440,1366,1280,768,390,320]:
   context=browser.new_context(viewport={'width':width,'height':900})
   context.route('**/api/lead',lambda r:r.abort())
   context.route('https://fonts.googleapis.com/**',lambda r:r.abort())
   context.route('https://fonts.gstatic.com/**',lambda r:r.abort())
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   for entry in pages:
    response=page.goto(base+entry['path'].lstrip('/'),wait_until='networkidle')
    assert response.status==200,(width,entry['path'],response.status)
    assert 'noindex' not in response.headers.get('x-robots-tag','').lower(),entry['path']
    assert page.locator('h1').count()==1,entry['path']
    assert page.locator('link[rel="canonical"]').get_attribute('href')=='https://xn--80aaan1dh9b.xn--p1ai'+entry['path']
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2'),('OVERFLOW',width,entry['path'])
    for image in page.locator('img:visible').all():
     image.scroll_into_view_if_needed()
     expect(image).not_to_have_js_property('naturalWidth',0,timeout=10000)
     assert image.evaluate('(im)=>im.decode().then(()=>im.naturalWidth>0).catch(()=>false)'),('BROKEN_IMAGE',width,entry['path'],image.get_attribute('src'))
    assert not errors,errors
   if width==390:
    for model in ['kvadro','parus','viking','kvadro-house']:
     page.goto(base+'?model='+model+'#builder',wait_until='networkidle')
     assert page.evaluate('window.__GARANT_DEMO__.getState().modelId')==model
   print('SEARCH_BROWSER_VIEWPORT_PASS',width,'pages',len(pages))
   context.close()
  # No-JavaScript accessibility of deep commercial information.
  context=browser.new_context(java_script_enabled=False)
  page=context.new_page()
  for entry in pages:
   page.goto(base+entry['path'].lstrip('/'))
   assert page.locator('h1').inner_text().strip()
   assert page.locator('a[href*="/bani/"]').count()>0 or entry['path'].startswith('/bani/')
  context.close();browser.close()
finally:httpd.shutdown()
print('SEARCH_BROWSER_QA=PASS_9_PAGES_7_WIDTHS; REAL_LEAD_POSTS=0')

"""Public CTA -> existing callback dialog. No real lead requests."""
import functools,http.server,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=os.environ.get('DACHA_SEARCH_BASE') or f'http://127.0.0.1:{server.server_address[1]}/'
try:
 with sync_playwright() as p:
  opts={'headless':True}
  for candidate in [Path(os.environ.get('PROGRAMFILES',r'C:\Program Files'))/'Google/Chrome/Application/chrome.exe',Path(os.environ.get('PROGRAMFILES(X86)',r'C:\Program Files (x86)'))/'Microsoft/Edge/Application/msedge.exe']:
   if candidate.is_file():opts['executable_path']=str(candidate);break
  browser=p.chromium.launch(**opts)
  for width in [1920,390,320]:
   page=browser.new_page(viewport={'width':width,'height':900})
   page.route('**/api/lead',lambda route:route.abort())
   page.route('https://fonts.googleapis.com/**',lambda r:r.abort())
   page.route('https://fonts.gstatic.com/**',lambda r:r.abort())
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   for path,topic in [('kontakty/','Помощь с выбором бани'),('bani/kvadro/','Модель Квадро'),('dostavka-i-ustanovka/','Доставка и установка бани')]:
    page.goto(base+path,wait_until='networkidle')
    assert page.locator('a[href^="tel:"]').count()==0
    page.get_by_role('link',name='Связаться с менеджером',exact=True).first.click()
    expect(page.locator('#contactDialog')).to_be_visible()
    expect(page.locator('#contactForm [name="comment"]')).to_have_value(topic)
    expect(page.locator('#contactForm [name="phone"]')).to_be_visible()
    assert page.locator('#contactDialog').evaluate('(e)=>e.open')
    assert not errors,errors
   page.close();print('MANAGER_CTA_QA=PASS',width)
  browser.close()
finally:server.shutdown()
print('MANAGER_CTA_REAL_POSTS=0')

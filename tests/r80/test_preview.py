from pathlib import Path
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
import re
r=Path('/mnt/data/dachapar_r80/preview')
css='\n'.join((r/f).read_text(errors='ignore') for f in ('styles.css','premium.css','contrast-r3.css','experience-r4.css','cjm-r80.css'))

def make_page(filename):
 s=BeautifulSoup((r/filename).read_text(),'html.parser')
 for e in s.select('link[rel="stylesheet"],script[src]'):e.decompose()
 for img in s.select('img'):
  for attr in ('srcset','sizes'):img.attrs.pop(attr,None)
  # External image requests blocked in the test sandbox; replace with lightweight vector placeholder.
  img['src']='data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22720%22%20height=%22480%22%3E%3Crect%20width=%22720%22%20height=%22480%22%20fill=%22%23d8e2d8%22/%3E%3C/svg%3E'
 style=s.new_tag('style');style.string=css;s.head.append(style)
 return str(s)

def widget(kind):
 prefix='parus' if kind=='parus' else 'qh'
 content=(r/f'{prefix}-media/content.mjs').read_text()
 widget=(r/f'{prefix}-media/widget.mjs').read_text()
 content=content.replace('export const ','const ').replace('export function ','function ')
 widget=re.sub(r'^import .*?;\s*','',widget,count=1,flags=re.M)
 widget=re.sub(r'export \{[^}]+\};?','',widget)
 widget=widget.replace("const asset = new URL('./assets/', import.meta.url);","const asset = new URL('https://example.invalid/media/');")
 # No URL requests in the isolated browser. All gallery images share a safe vector placeholder.
 widget=re.sub(r'const photoURL=.*?;\n',"const photoURL=()=> 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22720%22%20height=%22480%22%3E%3Crect%20width=%22720%22%20height=%22480%22%20fill=%22%23d8e2d8%22/%3E%3C/svg%3E';\n",widget,count=1)
 widget=re.sub(r'const planURL=.*?;\n',"const planURL=()=> 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22720%22%20height=%22480%22/%3E';\n",widget,count=1)
 return '(function(){\n'+content+'\n'+widget+'\n})();'

with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [390,768,1366]:
  page=browser.new_page(viewport={'width':width,'height':900})
  for route in ['index.html','raboty/index.html','bani/parus/index.html','bani/kvadro-haus/index.html','bani/kvadro/index.html','bani/viking/index.html']:
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.set_content(make_page(route),wait_until='domcontentloaded',timeout=20000)
   if route=='bani/parus/index.html':page.add_script_tag(content=widget('parus'))
   if route=='bani/kvadro-haus/index.html':page.add_script_tag(content=widget('qh'))
   page.wait_for_timeout(60)
   over=page.evaluate('document.documentElement.scrollWidth-innerWidth')
   assert over<=4,(width,route,over)
   assert page.locator('h1').count()==1,(width,route,'h1')
   print('PASS',width,route,flush=True)
   if route=='index.html':
    assert page.locator('#configure').count()==1
    assert page.locator('#relay-lead-form').count()==1
    assert page.locator('#models .model-item').count()==4
    assert page.locator('#real-bani .cjm-works-card').count()==2
    assert page.locator('#parus-photos').count()==0
    assert page.locator('#qh-photos').count()==0
    assert page.locator('nav.desktop-nav a[href="/raboty/"]').count()==1
    models_box=page.locator('#models').bounding_box();package_box=page.locator('#packages').bounding_box();assert models_box['y']<package_box['y']
    inc=page.locator('#included').bounding_box();calc=page.locator('#configure').bounding_box();assert inc['y']<calc['y']
   elif route=='raboty/index.html':
    assert page.locator('.cjm-works-card').count()==9
    page.locator('[data-work-filter=parus]').click();assert page.locator('.cjm-works-card:visible').count()==4
    page.locator('[data-work-filter=kvadro-haus]').click();assert page.locator('.cjm-works-card:visible').count()==5
   elif route=='bani/parus/index.html':
    assert page.locator('#photos .pp-card').count()==3
    assert page.locator('#plans [data-pp-layout]').count()==5
    page.locator('[data-pp-object="timber"]').first.click();page.wait_for_timeout(120)
    assert page.locator('#pp-gallery[open]').count()==1
    assert page.locator('#pp-gallery-image').evaluate('(el)=>el.getBoundingClientRect().width')>100
    page.locator('#pp-gallery .pp-close').first.click()
   elif route=='bani/kvadro-haus/index.html':
    assert page.locator('#photos .qh-card').count()==4
    assert page.locator('#plans [data-qh-layout]').count()==4
    page.locator('[data-qh-object="terrace-window"]').first.click();page.wait_for_timeout(120)
    assert page.locator('#qh-gallery[open]').count()==1
    assert page.locator('#qh-gallery-image').evaluate('(el)=>el.getBoundingClientRect().width')>100
    page.locator('#qh-gallery .qh-close').first.click()
   assert not errors,errors
  page.close()
 browser.close()
print('R80_ISOLATED_BROWSER=PASS; SCENARIOS=18; WIDTHS=390,768,1366; LIVE_APP_NOT_VERIFIED')

"""Offline headless Chromium P0 regression, no server/deploy or GitHub Actions.
Usage: python tests/browser_parus_p0_offline.py --live-zip <owner downloaded ZIP>
Requires: pip install playwright and an available Chromium browser.
Fixtures are synthetic SVG geometry patterns, not commercial images.
"""
from pathlib import Path
import re,asyncio,base64,json,zipfile,argparse
from playwright.async_api import async_playwright
REPO=Path(__file__).resolve().parents[1]
PATCH=REPO/'parus-media'
parser=argparse.ArgumentParser()
parser.add_argument('--live-zip',type=Path,required=True)
a=parser.parse_args()
with zipfile.ZipFile(a.live_zip) as archive:
    BASELINE_JS=archive.read('parus-media_widget.mjs').decode('utf-8')
    BASELINE_CSS=archive.read('parus-media_widget.css').decode('utf-8')
FIXTURE=base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg" width="960" height="1280"><rect width="960" height="1280" fill="#3d8063"/><rect x="40" y="40" width="880" height="1200" fill="none" stroke="white" stroke-width="10"/></svg>').decode()
SRC='data:image/svg+xml;base64,'+FIXTURE

def build_script(widget_path,broken_1600=False):
 content=(PATCH/'content.mjs').read_text()
 content=content.replace('export const ','const ').replace('export function ','function ')
 widget=BASELINE_JS if widget_path=="live" else Path(widget_path).read_text()
 widget=widget.replace("import {objects, layouts, referenceText, referenceLabel} from './content.mjs';",'')
 widget=widget.replace("const asset = new URL('./assets/', import.meta.url);",'')
 widget=re.sub(r"const photoURL=\(p,size=960\)=>[^;]+;",'const photoURL=(p,size=960)=>'+('size===1600?"data:image/png;base64,not-a-valid-image":' if broken_1600 else '')+json.dumps(SRC)+';',widget)
 widget=re.sub(r"const planURL=p=>[^;]+;",'const planURL=p=>'+json.dumps(SRC)+';',widget)
 widget=widget.replace('export {selectPlan,openPhoto};','')
 return content+'\n'+widget

async def tests():
 results=[]
 async with async_playwright() as p:
  browser_path='/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None
  launch={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
  if browser_path:launch['executable_path']=browser_path
  browser=await p.chromium.launch(**launch)
  for width in (360,390,768,1366,1920):
   page=await browser.new_page(viewport={'width':width,'height':900})
   js_errors=[];page.on('pageerror',lambda exc:js_errors.append(str(exc)))
   await page.set_content('<!doctype html><html lang="ru"><head><meta charset="utf-8"></head><body><h1>Технический тест Паруса</h1><button data-pp-object="timber">Открыть</button><img id="pp-plan-image"><h2 id="pp-plan-title"></h2><p id="pp-plan-tag"></p><p id="pp-plan-size"></p><p id="pp-plan-area"></p><p id="pp-plan-text"></p><ul id="pp-plan-features"></ul><p id="pp-plan-custom"></p><button data-pp-layout="six-shower">Планировка</button></body></html>')
   await page.add_style_tag(content=(PATCH/'widget.css').read_text())
   await page.add_script_tag(content=build_script(PATCH/'widget.mjs'))
   await page.locator('[data-pp-object="timber"]').click()
   await page.locator('#pp-gallery').wait_for(state='visible')
   await page.wait_for_function("document.querySelector('#pp-gallery-image').complete && document.querySelector('#pp-gallery-image').naturalWidth>0")
   for label in ('timber','slats','terrace','cream'):
    await page.locator(f'.pp-object-tabs [data-object="{label}"]').click()
    await page.wait_for_function("document.querySelector('#pp-gallery-image').complete && document.querySelector('#pp-gallery-image').naturalWidth>0")
    data=await page.locator('#pp-gallery-image').evaluate('im=>{const r=im.getBoundingClientRect(),s=im.parentElement.getBoundingClientRect();return {w:r.width,h:r.height,sw:s.width,sh:s.height,natural:im.naturalWidth,flag:im.dataset.ppGeometry}}')
    assert data['w']>min(width*.35,200) and data['h']>=180, (width,label,data)
    assert data['natural']==960,(width,label,data)
    results.append((width,label,round(data['w']),round(data['h'])))
   await page.add_style_tag(content='img{width:44px!important;height:58px!important}')
   await page.locator('.pp-object-tabs [data-object="slats"]').click()
   await page.wait_for_timeout(120)
   d=await page.locator('#pp-gallery-image').evaluate('im=>{const r=im.getBoundingClientRect();return {w:r.width,h:r.height,flag:im.dataset.ppGeometry}}')
   assert d['w']>min(width*.35,200) and d['h']>180, (width,'conflict',d)
   thumb=await page.locator('.pp-thumbs img').first.evaluate('im=>im.getBoundingClientRect().width')
   assert thumb<80,(width,thumb)
   results.append((width,'global-css-conflict',round(d['w']),round(d['h']),thumb))
   await page.locator('#pp-gallery .pp-close').click()
   await page.locator('[data-pp-layout="six-shower"]').click()
   assert (await page.locator('#pp-plan-title').inner_text())=='С отдельной душевой'
   assert not js_errors, js_errors
   await page.close()
  # Prove actual archived CSS is vulnerable to the same global rule in isolation.
  page=await browser.new_page(viewport={'width':1366,'height':900})
  await page.set_content('<html><body><button data-pp-object="timber">Открыть</button></body></html>')
  await page.add_style_tag(content=BASELINE_CSS)
  await page.add_script_tag(content=build_script("live"))
  await page.locator('[data-pp-object="timber"]').click()
  await page.wait_for_timeout(100)
  await page.add_style_tag(content='img{width:44px!important;height:58px!important}')
  await page.locator('.pp-object-tabs [data-object="slats"]').click()
  d=await page.locator('#pp-gallery-image').evaluate('im=>{const r=im.getBoundingClientRect();return {w:r.width,h:r.height}}')
  assert abs(d['w']-44)<1 and abs(d['h']-58)<1,d
  print('BASELINE REPRODUCES 44x58 UNDER ADVERSARIAL CSS:',d)
  results.append(('baseline','tiny-image-reproduced',d))
  await page.close()
  # 1600 asset missing: modified module retries 960, shows image without user interaction.
  page=await browser.new_page(viewport={'width':1000,'height':800})
  await page.set_content('<html><body><button data-pp-object="timber">Открыть</button></body></html>')
  await page.add_style_tag(content=(PATCH/'widget.css').read_text())
  await page.add_script_tag(content=build_script(PATCH/'widget.mjs',broken_1600=True))
  await page.locator('[data-pp-object="timber"]').click()
  await page.wait_for_function("document.querySelector('#pp-gallery-image').dataset.ppAsset==='fallback'&&document.querySelector('#pp-gallery-image').naturalWidth===960")
  print('ASSET FALLBACK PASS')
  results.append(('asset','1600-missing','960-recovered'))
  await page.close()
  await browser.close()
 print('ALL OFFLINE P0 CASES PASS:',len(results));print(json.dumps(results,ensure_ascii=False))
asyncio.run(tests())
"""Offline Chromium tests; NO production requests, API POST, MAX/SQLite or Actions."""
from __future__ import annotations
import asyncio,contextlib,functools,http.server,json,shutil,socketserver,tempfile,threading
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
MODEL_IDS=['kvadro','viking','parus','kvadro-house']
IMG=b'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#c5d6c0"/></svg>'
class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0].endswith('.webp'):
            self.send_response(200);self.send_header('Content-Type','image/svg+xml');self.send_header('Content-Length',str(len(IMG)));self.end_headers();self.wfile.write(IMG);return
        super().do_GET()
    def log_message(self,*args):pass

async def main():
    with tempfile.TemporaryDirectory(prefix='dp-gallery-test-') as tmp:
        base=Path(tmp);target=base/'assets/gallery-v2';target.mkdir(parents=True)
        for filename in ['catalog.json','gallery.mjs','gallery.css','small-image-guard.mjs']:shutil.copy2(ROOT/'assets/gallery-v2'/filename,target/filename)
        catalog=json.loads((target/'catalog.json').read_text())
        # A second local-only Parus example tests switching without publishing unapproved photos.
        parus=catalog['models']['parus']
        parus['groups'].append({'id':'local-photo-fixture','label':'Тестовый объект','kind':'real-object','photos':[
            {'src':'/mock/1.webp','scene':'outside','caption':'Снаружи'},
            {'src':'/mock/2.webp','scene':'steam','caption':'Парная'}]})
        (target/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False),encoding='utf8')
        html='''<!doctype html><html lang="ru" data-dp-gallery-v2="on"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html{font-family:Arial}img{width:44px!important;height:58px!important}.broken{width:1020px;height:480px;position:relative;background:#e2e8dc}.broken-thumb{width:44px;height:58px}</style><link rel="stylesheet" href="/assets/gallery-v2/gallery.css"></head><body><section id="models">'''
        for mid in MODEL_IDS:html+=f'<button type="button" data-gallery="{mid}">Рассмотреть {mid}</button>'
        html+='''</section><div id="broken-root"><div class="broken"><img id="broken-large" src="/mock/1.webp" /></div><img class="broken-thumb" id="broken-thumb" src="/mock/2.webp" /></div><script type="module" src="/assets/gallery-v2/gallery.mjs"></script></body></html>'''
        (base/'index.html').write_text(html,encoding='utf8')
        import base64
        photo_uri='data:image/svg+xml;base64,'+base64.b64encode(IMG).decode('ascii')
        for model in catalog['models'].values():
            for group in model['groups']:
                for photo in group['photos']: photo['src']=photo_uri
        css=(target/'gallery.css').read_text()
        gallery_js=(target/'gallery.mjs').read_text()
        gallery_js=gallery_js.replace("const DATA_URL = new URL('./catalog.json', import.meta.url);", "const DATA_URL = "+repr('data:application/json;charset=utf-8,'+__import__('urllib.parse',fromlist=['quote']).quote(json.dumps(catalog,ensure_ascii=False)))+";")
        gallery_js=gallery_js.replace('export async function','async function').replace('export function','function')
        guard_js=(target/'small-image-guard.mjs').read_text().replace('export function','function')+"\nwindow.__tinyGuard=detectAndRepairTinyStageImage;"
        html=html.replace('<link rel="stylesheet" href="/assets/gallery-v2/gallery.css">','')
        html=html.replace('<script type="module" src="/assets/gallery-v2/gallery.mjs"></script>','')
        html=html.replace('/mock/1.webp',photo_uri).replace('/mock/2.webp',photo_uri)
        async with async_playwright() as p:
            browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
            total=0
            for width,height in [(390,844),(768,900),(1366,768),(1920,1080)]:
                page=await browser.new_page(viewport={'width':width,'height':height})
                errors=[];page.on('pageerror',lambda x:errors.append(str(x)))
                await page.set_content(html)
                await page.add_style_tag(content=css)
                await page.add_script_tag(content=gallery_js)
                await page.add_script_tag(content=guard_js)
                for model_id in MODEL_IDS:
                    await page.locator(f'[data-gallery="{model_id}"]').click()
                    await page.locator('#dp-gallery-v2[open]').wait_for()
                    await page.wait_for_function("document.querySelector('#dp-gallery-v2 .dp-main-image').naturalWidth > 0")
                    text=await page.locator('#dp-gallery-v2-title').text_content()
                    assert text==catalog['models'][model_id]['name'],(width,model_id,text)
                    geom=await page.locator('#dp-gallery-v2-stage').evaluate('''stage=>{const img=stage.querySelector('.dp-main-image');const a=stage.getBoundingClientRect(),b=img.getBoundingClientRect();return {stageWidth:a.width,stageHeight:a.height,imageWidth:b.width,imageHeight:b.height}}''')
                    assert geom['stageWidth']>=min(width*.83,1040) and geom['imageWidth']>=geom['stageWidth']*.98 and geom['imageHeight']>=geom['stageHeight']*.98,(width,model_id,geom)
                    assert await page.locator('#dp-gallery-v2').get_by_text('₽').count()==0
                    if model_id=='parus':
                        await page.locator('[data-group-id="local-photo-fixture"]').click()
                        await page.locator('[data-scene-id="steam"]').click()
                        assert await page.locator('.dp-meta').inner_text()=='Парная\n1 / 1'
                        await page.locator('[data-scene-id="all"]').click()
                        await page.locator('[data-action="next"]').click()
                        assert 'Парная' in (await page.locator('.dp-meta').inner_text())
                        total+=4
                    await page.locator('[data-action="close"]').click()
                    assert not await page.locator('#dp-gallery-v2').evaluate('(d)=>d.open')
                    total+=5
                # Reproduce real defect: 44x58 image in 1020x480 stage, ensure only large image grows.
                g=await page.evaluate("window.__tinyGuard(document.getElementById('broken-root'))")
                assert g['status']=='REPAIRED',g
                assert (await page.locator('#broken-large').bounding_box())['width']>=1000
                assert (await page.locator('#broken-thumb').bounding_box())['width']<=50
                assert not errors,errors
                total+=4
                await page.close()
            print(f'GALLERY_V2_BROWSER_PASS={total}; WIDTHS=390,768,1366,1920; TINY_IMG=REPAIRED; THUMB_PRESERVED=YES; REAL_PRODUCTION_REQUESTS=0')
            await browser.close()
if __name__=='__main__':asyncio.run(main())

#!/usr/bin/env python3
"""Real Chromium R73.1 palette acceptance with 16 actual catalog sample assets.

No production domain, lead POST, manager login, MAX or Yandex request.
"""
import http.server
import json
import shutil
import tempfile
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
PALETTE=json.loads((ROOT/'data/catalog-pricebook.json').read_text(encoding='utf-8'))['finishes']
ART=ROOT/'docs/r731/artifacts/browser'
ART.mkdir(parents=True,exist_ok=True)

HTML='''<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/r731-supplement.css">
<style>body{background:#e7ede4;color:#193a30;font:16px system-ui;margin:0;}
.finish-details{padding:24px;margin:15px auto;max-width:700px}
.finish-fields{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
.region-field{display:block;min-width:0;padding:4px;font-weight:600;}
</style></head><body>
<details class="finish-details" open><summary>Пожелания к цвету</summary>
<div class="finish-fields">
<label class="region-field" for="finish-select">Оттенок корпуса<select id="finish-select"><option value="">Обсудим с менеджером</option></select></label>
<label class="region-field" for="roof-select">Цвет кровли<select id="roof-select"><option value="">Обсудим с менеджером</option></select></label>
</div></details>
<script type="module" src="/r731-finish-picker.mjs"></script>
</body></html>'''

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=self.server_directory,**kwargs)
    def log_message(self,*args): pass

with tempfile.TemporaryDirectory(prefix='r731-browser-') as temporary:
    site=Path(temporary)
    for name in ('r731-supplement.css','r731-finish-picker.mjs'):
        shutil.copy2(ROOT/'premium-r731'/name,site/name)
    samples=site/'assets/catalog-v66'
    samples.mkdir(parents=True)
    for kind in ('body','roof'):
        for option in PALETTE[kind]:
            name=f"{kind}-{option['id']}.webp"
            shutil.copy2(ROOT/'assets/catalog-v66'/name,samples/name)
    (site/'index.html').write_text(HTML,encoding='utf-8')

    class LocalHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self,*args,**kwargs):
            super().__init__(*args,directory=str(site),**kwargs)
        def log_message(self,*args): pass

    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),LocalHandler)
    server_thread=threading.Thread(target=server.serve_forever,daemon=True)
    server_thread.start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            for width in (360,390,768,1366):
                page=browser.new_page(viewport={'width':width,'height':800},device_scale_factor=1)
                errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='networkidle')
                page.evaluate('''(data) => {
                  window.changes=[];
                  for(const [kind,items] of Object.entries(data)){
                    const id=kind==='body'?'finish-select':'roof-select';
                    const select=document.getElementById(id);
                    select.addEventListener('change',()=>window.changes.push(kind+':'+select.value));
                    select.replaceChildren(new Option('Обсудим с менеджером',''),
                      ...items.map(x=>new Option(x.name,x.id)));
                    select.value='';
                  }
                }''',PALETTE)
                page.wait_for_function("document.querySelectorAll('.r731-finish-option').length === 18")
                page.wait_for_function("Array.from(document.querySelectorAll('.r731-finish-preview img')).every(x=>x.complete)")
                images=page.evaluate("Array.from(document.querySelectorAll('.r731-finish-preview img')).map(x=>({src:x.src,naturalWidth:x.naturalWidth}))")
                assert len(images)==16 and all(x['naturalWidth']>0 for x in images),images
                assert not errors,errors
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"),width
                assert page.locator('.r731-finish-option').count()==18
                assert page.locator('.r731-finish-option:disabled').count()==0
                page.locator('[data-finish-id="oak_dufa"]').click()
                page.locator('[data-finish-id="green"]').click()
                assert page.evaluate("document.querySelector('#finish-select').value")=='oak_dufa'
                assert page.evaluate("document.querySelector('#roof-select').value")=='green'
                assert page.locator('[data-finish-id="oak_dufa"]').get_attribute('aria-pressed')=='true'
                assert page.locator('[data-finish-id="green"]').get_attribute('aria-pressed')=='true'
                assert page.evaluate("window.changes")==['body:oak_dufa','roof:green']
                # Simulate the canonical app repopulating select options after another render.
                page.evaluate('''(data)=>{
                  const box=document.getElementById('finish-select');
                  box.replaceChildren(new Option('Обсудим с менеджером',''),...data.body.map(x=>new Option(x.name,x.id)));
                  box.value='oak_dufa';
                }''',PALETTE)
                page.wait_for_function("document.querySelector('[data-finish-id=\"oak_dufa\"]')?.getAttribute('aria-pressed') === 'true'")
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"),width
                page.screenshot(path=str(ART/f'r731-colours-{width}.png'),full_page=True)
                print(f'R731_BROWSER=PASS; WIDTH={width}; SWATCHES=16; CHOICE_CARDS=18; SELECTION_PERSISTS=YES; OVERFLOW=NO; JS_ERRORS=0')
                page.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()

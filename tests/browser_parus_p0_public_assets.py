#!/usr/bin/env python3
"""Offline regression of exact public Parus widget/CSS/WebP vs P0 fix.

Examples:
  python tests/browser_parus_p0_public_assets.py --live-zip DachaPar-P0-live-source.zip \\
      --dependencies-zip DachaPar-P0-public-css-media.zip

All input assets are local. Browser does not access production or submit leads.
The baseline MUST reproduce the 44px/36px single-photo CSS Grid bug; patched MUST not.
"""
from pathlib import Path
from zipfile import ZipFile
import argparse
import asyncio
import base64
import hashlib
import json
import re

from playwright.async_api import async_playwright

REPO = Path(__file__).resolve().parents[1]
EXPECTED_LIVE_HASHES = {
    'index.html': '339391845AA453F6627331755CD52D7C83311B60155B92D7C8B7F4B42060FB77',
    'parus-media_widget.mjs': 'F0F02302B01C4072194381D0755CF35DAA8BE529BA91A2EEC27DF9162E79872A',
    'parus-media_widget.css': 'BA6CC1CE1D41F4A545A77A68853F39505F8A9B3E44BD5944712B0D10385E2E72',
    'parus-media_content.mjs': 'C71B32B2AE4A07DB722F5D2CB97D4613AEB68A844EFD7D37E395CADCD02276F4',
}
STYLE_ORDER = [
    'assets_vendor_scrollcraft.css', 'styles.css', 'premium.css',
    'contrast-r3.css', 'experience-r4.css', 'journey-r5.css',
    'choice-r7.css', 'r731-supplement.css', 'r732-content.css'
]
PHOTO_NAMES = [
    '01_night-1600.webp', '01_night-960.webp',
    '02_exterior-1600.webp', '04_exterior-1600.webp'
]
SAMPLE_OBJECTS = ('timber','slats','terrace','cream')


def byte_check_zip(z, name, digest):
    data = z.read(name)
    actual = hashlib.sha256(data).hexdigest().upper()
    assert actual == digest, f'{name}: SHA-256 mismatch {actual}'
    return data


def compiled_widget(js_source, content_source):
    content = content_source.replace('export const ', 'const ').replace('export function ', 'function ')
    js = re.sub(r'^import .*\n', '', js_source, count=1)
    js = re.sub(r'^const asset = .*\n', '', js, count=1, flags=re.M)
    js = re.sub(r'^const photoURL=.*\n', 'const photoURL=(p,size=960)=>window.__photoUrl(p.id,size);\n', js, count=1, flags=re.M)
    js = re.sub(r'^const planURL=.*\n', 'const planURL=p=>window.__planUrl(p.id);\n', js, count=1, flags=re.M)
    js = re.sub(r'^export \{.*\};?\s*$', '', js, flags=re.M)
    assert 'import.meta.url' not in js
    return content + '\n' + js


async def main(args):
    with ZipFile(args.live_zip) as live, ZipFile(args.dependencies_zip) as deps:
        input_files = {name: byte_check_zip(live, name, digest).decode('utf-8')
                       for name, digest in EXPECTED_LIVE_HASHES.items()}
        all_css = '\n'.join(deps.read(name).decode('utf-8') for name in STYLE_ORDER)
        public_photos = {name: 'data:image/webp;base64,' + base64.b64encode(
            deps.read('parus-media_assets_photos_' + name)).decode('ascii') for name in PHOTO_NAMES}

    # Preserve actual production markup and ordering of styles. This is an offline
    # approximation: unrelated remote JS and photos weren't provided, and are not exercised.
    html = input_files['index.html']
    html = re.sub(r'<link\s+[^>]*rel="(?:stylesheet|preload|icon)"[^>]*>', '', html)
    html = re.sub(r'<script\s+[^>]*src="[^"]+"[^>]*>\s*</script>', '', html)

    chromium = '/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None
    report = []
    async with async_playwright() as playwright:
        opts = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage']}
        if chromium: opts['executable_path'] = chromium
        browser = await playwright.chromium.launch(**opts)
        for variant in ('original', 'patched'):
            if variant == 'original':
                js = input_files['parus-media_widget.mjs']
                css = input_files['parus-media_widget.css']
            else:
                js = (REPO/'parus-media/widget.mjs').read_text(encoding='utf-8')
                css = (REPO/'parus-media/widget.css').read_text(encoding='utf-8')
            script = compiled_widget(js, input_files['parus-media_content.mjs'])
            document = html.replace('</head>', '<style>'+all_css+'\n'+css+'</style></head>', 1)
            for width in (360,390,768,1366,1920):
                page = await browser.new_page(viewport={'width':width,'height':900})
                errors=[]
                page.on('pageerror', lambda e: errors.append(str(e)))
                await page.set_content(document)
                await page.evaluate('''images=>{
                    window.__photoUrl=(id,size)=>images[id+'-'+size+'.webp'] || images[id+'-1600.webp'] || images['02_exterior-1600.webp'];
                    window.__planUrl=()=> 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22600%22%20height=%22300%22%3E%3C/svg%3E';
                }''', public_photos)
                await page.add_script_tag(content=script)
                await page.locator('[data-pp-object="timber"]').first.click()
                await page.wait_for_function("document.querySelector('#pp-gallery-image')?.naturalWidth>0")
                for object_id in SAMPLE_OBJECTS:
                    await page.locator('.pp-dialog [data-object="'+object_id+'"]').click()
                    await page.wait_for_timeout(50)
                    data = await page.evaluate('''() => {
                        const img=document.querySelector('#pp-gallery-image');
                        const stage=document.querySelector('.pp-gallery-stage');
                        const rect=img.getBoundingClientRect();const sr=stage.getBoundingClientRect();
                        const w=Math.min(rect.width,rect.height*img.naturalWidth/img.naturalHeight);
                        return {width:rect.width,height:rect.height,stageWidth:sr.width,
                          natural:img.naturalWidth,visibleWidth:w,
                          column:getComputedStyle(img).gridColumnStart,
                          arrowCount:[...stage.querySelectorAll('[data-pp-step]')].filter(el=>!el.hidden).length,
                          thumbs:[...document.querySelectorAll('.pp-thumbs img')].map(el=>el.getBoundingClientRect().width)};
                    }''')
                    assert data['natural'] >= 700, (variant,width,object_id,'image-load',data)
                    if variant=='original' and object_id=='timber':
                        expected = 36 if width<=700 else 44
                        assert abs(data['width']-expected)<1, (variant,width,object_id,data)
                        assert data['column']=='auto' and data['arrowCount']==0, data
                        assert 0<data['visibleWidth']<50, data
                    elif variant=='patched':
                        assert data['column']=='2', (variant,width,object_id,data)
                        assert data['width']>min(width*.5,260), (variant,width,object_id,data)
                        assert data['visibleWidth']>140, (variant,width,object_id,data)
                        if object_id=='timber':assert data['arrowCount']==0, data
                    else:
                        assert data['width']>min(width*.5,260), (variant,width,object_id,data)
                    assert data['thumbs'] and max(data['thumbs'])<90, data
                    report.append({'version':variant,'viewport':width,'object':object_id,'mainWidth':round(data['width']),
                                   'photoWidth':round(data['visibleWidth']),'columns':data['column']})
                assert not errors, (variant,width,errors)
                await page.close()
        await browser.close()
    assert len(report)==40
    print('P0_REAL_CSS_AND_WEBP_TEST=PASS; CASES=40; BASELINE_BUG_REPRODUCED=YES; PATCH_FIXED=YES; PRODUCTION_WRITES=0')
    if args.evidence:
        Path(args.evidence).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return report


if __name__ == '__main__':
    cli=argparse.ArgumentParser()
    cli.add_argument('--live-zip',type=Path,required=True)
    cli.add_argument('--dependencies-zip',type=Path,required=True)
    cli.add_argument('--evidence',type=Path)
    asyncio.run(main(cli.parse_args()))

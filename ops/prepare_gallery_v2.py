"""Prepare an offline, opt-in gallery-v2 preview from an exact installed-site copy.
No SSH, production, Caddy, SQLite, MAX, pricebook or manager access.
"""
from __future__ import annotations
import argparse,hashlib,json,re,shutil,sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PARTS=['assets/gallery-v2/gallery.mjs','assets/gallery-v2/gallery.css','assets/gallery-v2/catalog.json','assets/gallery-v2/small-image-guard.mjs']
MARK='data-dp-gallery-v2="on"'
CSS='<link rel="stylesheet" href="/assets/gallery-v2/gallery.css?v=20261022-1">'
JS='<script type="module" src="/assets/gallery-v2/gallery.mjs?v=20261022-1"></script>'

def sha(b:bytes)->str:return hashlib.sha256(b).hexdigest()
def prepare(src:Path,dest:Path,approval:bool)->dict:
    if not src.is_dir() or not (src/'index.html').is_file():raise RuntimeError('BASE_HTML_MISSING')
    if dest.exists():raise RuntimeError('OUTPUT_ALREADY_EXISTS')
    if src.resolve()==dest.resolve() or src.resolve() in dest.resolve().parents:raise RuntimeError('DESTINATION_WITHIN_SOURCE')
    original=(src/'index.html').read_bytes()
    html=original.decode('utf-8')
    if MARK in html or 'gallery-v2/gallery.mjs' in html:raise RuntimeError('ALREADY_INSTALLED')
    if html.count('id="models"')!=1 or 'data-gallery="parus"' not in html or '</head>' not in html or '</body>' not in html:raise RuntimeError('UNRECOGNISED_SOURCE')
    # A new Parus media overlay must be inspected before applying this opt-in module.
    if 'parus-media/' in html and not approval:raise RuntimeError('PARUS_MEDIA_REQUIRES_EXPLICIT_APPROVAL_AFTER_SOURCE_REVIEW')
    shutil.copytree(src,dest,symlinks=False)
    for rel in PARTS:
        target=dest/rel;target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(ROOT/rel,target)
    html=html.replace('<html ',f'<html {MARK} ',1)
    html=html.replace('</head>',f'  {CSS}\n</head>',1)
    html=html.replace('</body>',f'  {JS}\n</body>',1)
    (dest/'index.html').write_text(html,encoding='utf-8')
    result={'base_html_sha256':sha(original),'staged_html_sha256':sha((dest/'index.html').read_bytes()),'files':{rel:sha((dest/rel).read_bytes()) for rel in PARTS},'production_writes':0,'stage_dir':str(dest)}
    (dest/'gallery-v2-evidence.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True,type=Path);p.add_argument('--output',required=True,type=Path)
    p.add_argument('--confirmed-parus-widget-reviewed',action='store_true');a=p.parse_args()
    try:print(json.dumps(prepare(a.source,a.output,a.confirmed_parus_widget_reviewed),ensure_ascii=False,indent=2))
    except Exception as ex:print('GALLERY_V2_PREPARE=FAIL',str(ex),file=sys.stderr);sys.exit(1)
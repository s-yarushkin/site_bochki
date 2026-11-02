"""R107 web-only preview: earlier non-modal quiz invitation, no API/price changes."""
from pathlib import Path
import shutil,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'output/r106-site'
OUT=ROOT/'output/r107-site'
subprocess.run([sys.executable,str(ROOT/'r106/build.py')],check=True)
shutil.copytree(SOURCE,OUT,dirs_exist_ok=True)
page=OUT/'index.html'
html=page.read_text('utf-8')
before='src="/quiz.mjs?v=r106"'
after='src="/quiz.mjs?v=r107-invite35"'
if html.count(before)!=1:
 raise RuntimeError('R107_STOP: expected exactly one R106 quiz script; do not overwrite an unknown build')
html=html.replace(before,after)
if 'data-release="R106-PREVIEW"' not in html:
 raise RuntimeError('R107_STOP: previous release marker missing')
html=html.replace('data-release="R106-PREVIEW"','data-release="R107-PREVIEW"')
page.write_text(html,encoding='utf-8')
js=(OUT/'quiz.mjs').read_text('utf-8')
if 'inviteDelayMs=10000,inviteScrollFraction=0.35' not in js:
 raise RuntimeError('R107_STOP: invite thresholds not found in built quiz')
print('R107_INVITE_PREVIEW=PASS; 10s/35%; full modal only on click; pricebook unchanged; WEB preview only')

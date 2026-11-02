"""R108: stage UX and model/length price ranges on the current R107 preview."""
from pathlib import Path
import shutil,subprocess,sys,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
subprocess.run([sys.executable,str(ROOT/'r107/build.py')],check=True)
SOURCE=ROOT/'output/r107-site'
OUT=ROOT/'output/r108-site'
shutil.copytree(SOURCE,OUT,dirs_exist_ok=True)
for name in ['quiz.mjs','quiz-engine.mjs','quiz.css']:
 shutil.copy2(ROOT/'web'/name,OUT/name)
# Never publish broken question images or substitute unapproved generic sauna shots.
photos=json.loads((ROOT/'r108/quiz-photos.json').read_text('utf8'))
for entry in photos['files']:
 src=ROOT/entry['path']
 if not src.is_file():
  raise RuntimeError('R108_STOP: approved image missing: '+entry['path']+
                     '. Import the approved ZIP before building.')
 if hashlib.sha256(src.read_bytes()).hexdigest()!=entry['sha256']:
  raise RuntimeError('R108_STOP: quiz photo differs from approved file: '+entry['path'])
 target=OUT/entry['path'].removeprefix('web/')
 target.parent.mkdir(parents=True,exist_ok=True)
 shutil.copy2(src,target)
page=OUT/'index.html'
html=page.read_text('utf8')
before='/quiz.mjs?v=r107-invite35'
if html.count(before)!=1:raise RuntimeError('R108_STOP: R107 quiz script not found exactly once')
html=html.replace(before,'/quiz.mjs?v=r108-ranges')
before_css='/quiz.css?v=r106'
if html.count(before_css)!=1:raise RuntimeError('R108_STOP: R106 css reference not found exactly once')
html=html.replace(before_css,'/quiz.css?v=r108-ranges')
if 'data-release="R107-PREVIEW"' not in html:raise RuntimeError('R108_STOP: unexpected base revision')
html=html.replace('data-release="R107-PREVIEW"','data-release="R108-PREVIEW"')
page.write_text(html,'utf8')
js=(OUT/'quiz.mjs').read_text('utf8')
if 'recommendModelRanges(' not in js or 'invite.showModal()' not in js or '20 000 ₽' not in js:
 raise RuntimeError('R108_STOP: expected quiz features missing')
print('R108_PREVIEW=PASS; 3 validated quiz photos; centered three-step invite; 5/6 m ranges; Deluxe 20k extra bonus; WEB-only preview')

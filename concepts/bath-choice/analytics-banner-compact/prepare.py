from pathlib import Path
import hashlib,json,re,posixpath,shutil,zipfile
B=Path(__file__).resolve().parent;OLD=Path('/srv/sites/dachapar-preview/releases/ANALYTICS-COPY-23e8d71c44acaeed');OUT=B/'site';TAG='analytics-compact-20261106'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(OLD/'journey-tracker.mjs') == (B/'tracker-base.sha256').read_text().strip()
files={name:(B/name).read_text(encoding='utf-8') for name in ('journey-tracker.mjs','journey-tracker.css')}
modules={p.relative_to(OLD).as_posix():p.read_text() for p in OLD.rglob('*.mjs') if 'vendor' not in p.parts and 'novyy-god' not in p.parts}
pattern=re.compile(r"((?:from\s*|import\s*\(?\s*)['\"])([^'\"]+)(['\"])")
def target(rel,url):return posixpath.normpath(posixpath.join(posixpath.dirname(rel),url.split('?')[0])) if not url.startswith('/') else url.split('?')[0].lstrip('/')
def patch(rel,text,regex):
 def repl(m):
  url=m[2]
  if target(rel,url) in files:return m[1]+url.split('?')[0]+'?v='+TAG+m[3]
  return m[0]
 return regex.sub(repl,text)
for _ in range(50):
 before=set(files)
 for rel,text in modules.items():
  if rel=='journey-tracker.mjs':continue
  new=patch(rel,text,pattern)
  if new!=text:files[rel]=new
 if before==set(files):break
else:raise RuntimeError('Dependency closure did not settle')
htmlpattern=re.compile(r'((?:src|href)=["\x27])([^"\x27]+)(["\x27])')
for p in OLD.rglob('*.html'):
 if 'novyy-god' in p.parts:continue
 rel=p.relative_to(OLD).as_posix();text=p.read_text();new=patch(rel,text,htmlpattern)
 if new!=text:files[rel]=new
for rel,text in files.items():
 dest=OUT/rel;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(text)
m={'baseline':str(OLD),'files':{p:sha(OUT/p) for p in files},'before':{p:sha(OLD/p) if (OLD/p).exists() else None for p in files}}
(B/'manifest.json').write_text(json.dumps(m,sort_keys=True,indent=2)+'\n')
digest=sha(B/'manifest.json')[:16]
with zipfile.ZipFile(B/'review.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in [B/'manifest.json',B/'install.py',*OUT.rglob('*')]:
  if p.is_file():z.write(p,p.relative_to(B))
print(json.dumps({'id':digest,'files':len(files),'changed':sorted(files)}))

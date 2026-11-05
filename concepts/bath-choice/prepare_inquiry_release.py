from pathlib import Path
import hashlib,json,re,shutil,zipfile
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).resolve().parent
OUT=ROOT/'output/inquiry-deploy';BASE=OUT/'baseline';PKG=OUT/'package';SITE=PKG/'site'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
SITE.mkdir(parents=True,exist_ok=True)
old=(BASE/'index.html').read_text('utf8');prototype=(ROOT/'output/bath-choice-prototype/index.html').read_text('utf8')
pattern=r'<dialog\b[^>]*id="inquiry-dialog".*?</dialog>'
original=re.search(pattern,old,re.S)[0];replacement=re.search(pattern,prototype,re.S)[0]
page=old.replace(original,replacement).replace('</head>','<link rel="stylesheet" href="/choice/inquiry-success.css?v=20261105"></head>')
assert page.count('/choice/app.mjs?v=seo-20261105')==1
page=page.replace('/choice/app.mjs?v=seo-20261105','/choice/app.mjs?v=inquiry-next-steps-button-20261105')
assert page.replace(replacement,original).replace('<link rel="stylesheet" href="/choice/inquiry-success.css?v=20261105">','').replace('/choice/app.mjs?v=inquiry-next-steps-button-20261105','/choice/app.mjs?v=seo-20261105')==old
(SITE/'index.html').write_text(page,'utf8',newline='\n')
(SITE/'choice').mkdir(exist_ok=True)
app=(BASE/'choice/app.mjs').read_text('utf8');find="'./continuation.mjs?v=phone-callback-20261105'";assert app.count(find)==1
(SITE/'choice/app.mjs').write_text(app.replace(find,"'./continuation.mjs?v=inquiry-next-steps-button-20261105'"),'utf8',newline='\n')
for name in ['continuation.mjs','inquiry-success.css']:shutil.copy2(HERE/name,SITE/'choice'/name)
files={p.relative_to(SITE).as_posix():sha(p) for p in SITE.rglob('*') if p.is_file()}
m={'baseline':'/srv/sites/dachapar-preview/releases/CLEAN-NOTE-2f54bf691a29eedd','files':files,'before':{p:sha(BASE/p) if (BASE/p).exists() else None for p in files}}
(PKG/'manifest.json').write_text(json.dumps(m,sort_keys=True,indent=2)+'\n','utf8');shutil.copy2(HERE/'install_inquiry_release.py',PKG/'install.py')
digest=sha(PKG/'manifest.json')[:16];archive=OUT/f'inquiry-{digest}.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for p in PKG.rglob('*'):
  if p.is_file():z.write(p,p.relative_to(PKG).as_posix())
info={'id':digest,'archive':str(archive),'sha256':sha(archive),'remote':'/tmp/dachapar-inquiry-'+digest,'candidate':'/srv/sites/dachapar-preview/releases/INQUIRY-'+digest}
(OUT/'package-info.json').write_text(json.dumps(info,indent=2),'utf8');print(json.dumps(info))

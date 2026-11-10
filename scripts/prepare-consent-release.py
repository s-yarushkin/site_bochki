"""Build a narrow overlay against the current, hash-verified production release."""
import os,sys,ast,base64,gzip,hashlib,io,json,subprocess,tarfile
from pathlib import Path
from social_preview import IMAGE_PATH,patch_preview
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local'/os.environ.get('DACHAPAR_CONSENT_PACKAGE','consent-release')
def sha(data):return hashlib.sha256(data).hexdigest()
source=next(n.value.value for n in ast.parse((ROOT/'scripts/publish-consent-terminal.py').read_text('utf8')).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SOURCE' for t in n.targets))
old=json.loads((OUT/'baseline.json').read_text('utf8'))
if '--prepared' in sys.argv:
 fresh=old;sources={'web/index.html':base64.b64encode((OUT/'baseline/web/index.html').read_bytes()).decode()}
else:
 result=subprocess.run(['ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=12','dachapar','python3 -'],input=source.encode(),capture_output=True,check=True,timeout=90)
 fresh=json.loads(result.stdout);sources=fresh.pop('source')
if fresh!=old:raise RuntimeError('Production changed since the reviewed merge. Rebase the overlay before publication.')
files={}
web=['journey-tracker.mjs','journey-runtime.mjs','request-intent.mjs','choice/home-hero/model-request.mjs','choice/home-hero/layout-panel.mjs','journey-tracker.css','analytics-core.mjs','privacy.html','assets/js/manager.js','crm/manager-extension.mjs','aggregate-actions.mjs','consent-banner.mjs','analytics-consent.html','crm/aggregate-report.mjs','consent-actions.mjs','lead-client.mjs']
content_build=json.loads((OUT/'content-build.json').read_text('utf8')) if (OUT/'content-build.json').exists() else None
if content_build:web+=['choice/packages.mjs','choice/packages.css','choice/comparison.mjs','choice/app.mjs',content_build['bundle']]
api=['server/garant-bani-relay.mjs','server/request-intent.mjs','data/request-layouts.json','server/crm-public-api.mjs','server/crm-manager-api.mjs','server/crm-insights.mjs','server/crm-aggregate.mjs']
for kind,names in [('web',web),('api',api)]:
 for name in names:
  data=(ROOT/kind/name).read_bytes()
  if sha(data)!=fresh[kind+'_files'].get(name):files[kind+'/'+name]=data
# Retain the actual page, patch only its share-preview metadata.
index=base64.b64decode(sources['web/index.html']);patched=patch_preview(index)
if content_build:
 patched=(ROOT/'web/index.html').read_bytes()
 if sha(index)!=content_build['baseline_index_sha256'] or sha(patched)!=content_build['index_sha256']:raise RuntimeError('Content build does not match the reviewed home page')
if patched!=index:files['web/index.html']=patched
image=(ROOT/'web'/IMAGE_PATH).read_bytes()
if sha(image)!=fresh['web_files'].get(IMAGE_PATH):files['web/'+IMAGE_PATH]=image
manifest={n:sha(data) for n,data in sorted(files.items())}
support={n:sha((ROOT/'scripts'/n).read_bytes()) for n in ['deploy-consent-remote.py','crm-production-audit.py','audit-lead-intent.py','caddy_public_cache.py','deploy-reviewed-job.py']}
release='CONSENT-'+sha(json.dumps({'overlay':manifest,'support':support},sort_keys=True).encode())[:12]
raw=io.BytesIO()
with tarfile.open(fileobj=raw,mode='w',format=tarfile.USTAR_FORMAT) as tar:
 for name,data in sorted(files.items()):
  info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o644;info.mtime=0;tar.addfile(info,io.BytesIO(data))
payload=gzip.compress(raw.getvalue(),mtime=0);(OUT/'payload.tar.gz').write_bytes(payload)
c={'release':release,'baseline':fresh,'baseline_sha256':sha(json.dumps(fresh,sort_keys=True).encode()),'overlay':manifest,'payload_sha256':sha(payload),'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'tests':'See committed validation report; live lead delivery is never exercised with fake leads'}
c['support_files']=support
if (OUT/'cache-config.json').exists():c['public_media_cache']={'config_sha256':json.loads((OUT/'cache-config.json').read_text('utf8'))['config_sha256']}
(OUT/'deployment.json').write_text(json.dumps(c,indent=2)+'\n',encoding='utf8')
print(json.dumps({'release':release,'files':len(files),'bytes':len(payload),'baseline':'captured; remote hash guard required' if '--prepared' in sys.argv else 'freshly verified'}))

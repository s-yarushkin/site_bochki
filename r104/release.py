"""Allowlisted R104 web-only update from the installed R103."""
import sys,json,hashlib,zipfile,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.stdout.reconfigure(encoding='utf-8')
sha=lambda b:hashlib.sha256(b).hexdigest()
snapshot=json.loads((ROOT/'.local/r104-production-inventory.json').read_text('utf-8-sig'))
oldDir=ROOT/'output/R103-SEO-9bf27b5c245d';old=json.loads((oldDir/'manifest.json').read_text('utf-8'))
assert Path(snapshot['web']).name=='R103-SEO-9bf27b5c245d'
assert Path(snapshot['api']).name=='R100-CRO-0a7d323b55c3'
review=json.loads((ROOT/'output/r104-manifest.json').read_text('utf-8'))
assert not json.loads((ROOT/'output/r104-verification.json').read_text('utf-8'))['errors']
protected=old['protectedWeb']
for name,value in protected.items():assert snapshot['files'][name]==value,name
candidate=ROOT/'output/r104-site'
names={'index.html' if r=='/' else r.strip('/')+'/index.html' for r in review['routes']}
names|={'404.html','r101/site.mjs','r104/qualified-goals.mjs','llms.txt'}
assert not names&set(protected)
payload={}
for name in sorted(names):
 b=(candidate/name).read_bytes()
 if name.endswith('.html'):
  b=b.replace(b'data-release="R104-CANDIDATE"',b'data-release="R104"')
  if name!='404.html':b=b.replace(b'<meta content="noindex,nofollow" name="robots"/>',b'<meta content="index,follow" name="robots"/>')
  assert (b'noindex' in b)==(name=='404.html'),name
 if snapshot['files'].get(name)!=sha(b):payload[name]=b
entries=[{'path':n,'oldSha256':snapshot['files'].get(n),'newSha256':sha(b),'bytes':len(b)} for n,b in payload.items()]
release='R104-CTA-'+sha(json.dumps(entries,sort_keys=True).encode())[:12]
out=ROOT/'output'/release;out.mkdir(exist_ok=True)
with zipfile.ZipFile(out/'payload.zip','w',zipfile.ZIP_DEFLATED) as z:
 for n,b in payload.items():z.writestr(n,b)
manifest={'release':release,'expectedWeb':snapshot['web'],'expectedApi':snapshot['api'],'payloadSha256':sha((out/'payload.zip').read_bytes()),'files':entries,'remove':[],'baselineWeb':snapshot['files'],'protectedWeb':protected,'routes':review['routes']}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
remote=(oldDir/'r103-remote.py').read_text('utf-8')
remote=remote.replace("r'R103-SEO-[a-f0-9]{12}'","r'R104-CTA-[a-f0-9]{12}'")
remote=remote.replace("WEB_RELEASES/'R102-MOBILE-41dbaf3847e3'","WEB_RELEASES/'R103-SEO-9bf27b5c245d'")
remote=remote.replace(r'r103/(?:reading\.css|region-context\.mjs)',r'r104/qualified-goals\.mjs|llms\.txt|r103/(?:reading\.css|region-context\.mjs)')
assert r'r104/qualified-goals\.mjs' in remote
remote=remote.replace("'r103-remote.py'","'r104-remote.py'").replace('R103_STOP:','R104_STOP:')
(out/'r104-remote.py').write_text(remote,encoding='utf-8')
smoke=(oldDir/'r101-smoke.mjs').read_text('utf-8')
smoke+='''\nconst {qualifyVision}=await import(pathToFileURL(web+'/r104/qualified-goals.mjs'));
assert.deepEqual(qualifyVision({source:'vision_block',comment:'Спальня',settlement:'Сергиев Посад'}),{bedroom:true,location:true});
assert.deepEqual(qualifyVision({source:'other',comment:'Спальня',settlement:'Никитская Слобода'}),{bedroom:false,location:false});
console.log('QUALIFIED_GOALS_MODULE=PASS; no external event sent');
'''
(out/'r101-smoke.mjs').write_text(smoke,encoding='utf-8')
report={'release':release,'path':str(out),'files':len(entries),'payloadBytes':(out/'payload.zip').stat().st_size,'protectedFiles':len(protected),'apiUnchanged':True}
(ROOT/'output/r104-release.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))

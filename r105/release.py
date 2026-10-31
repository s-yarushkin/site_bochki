"""Guarded web-only R105 overlay, based on the verified R104 manifest."""
import sys,json,hashlib,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.stdout.reconfigure(encoding='utf-8')
sha=lambda b:hashlib.sha256(b).hexdigest()
oldDir=ROOT/'output/R104-CTA-73dad4af901a';old=json.loads((oldDir/'manifest.json').read_text('utf-8'))
assert not json.loads((ROOT/'output/r105-verification.json').read_text('utf-8'))['errors']
files=dict(old['baselineWeb'])
for f in old['files']:files[f['path']]=f['newSha256']
snapshot={'web':'/srv/sites/dachapar-preview/releases/'+old['release'],'api':old['expectedApi'],'files':files}
review=json.loads((ROOT/'output/r105-manifest.json').read_text('utf-8'));candidate=ROOT/'output/r105-site'
names={'index.html' if r=='/' else r.strip('/')+'/index.html' for r in review['routes']}|{'404.html'}
assert not names&set(old['protectedWeb'])
payload={}
for name in sorted(names):
 b=(candidate/name).read_bytes().replace(b'data-release="R105-CANDIDATE"',b'data-release="R105"')
 if name!='404.html':b=b.replace(b'<meta content="noindex,nofollow" name="robots"/>',b'<meta content="index,follow" name="robots"/>')
 assert (b'noindex' in b)==(name=='404.html'),name
 if files.get(name)!=sha(b):payload[name]=b
entries=[{'path':n,'oldSha256':files.get(n),'newSha256':sha(b),'bytes':len(b)} for n,b in payload.items()]
release='R105-COPY-'+sha(json.dumps(entries,sort_keys=True).encode())[:12]
out=ROOT/'output'/release;out.mkdir(exist_ok=True)
with zipfile.ZipFile(out/'payload.zip','w',zipfile.ZIP_DEFLATED) as z:
 for n,b in payload.items():z.writestr(n,b)
m={'release':release,'expectedWeb':snapshot['web'],'expectedApi':snapshot['api'],'payloadSha256':sha((out/'payload.zip').read_bytes()),'files':entries,'remove':[],'baselineWeb':files,'protectedWeb':old['protectedWeb'],'routes':review['routes']}
(out/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
remote=(oldDir/'r104-remote.py').read_text('utf-8').replace("r'R104-CTA-[a-f0-9]{12}'","r'R105-COPY-[a-f0-9]{12}'").replace("WEB_RELEASES/'R103-SEO-9bf27b5c245d'","WEB_RELEASES/'R104-CTA-73dad4af901a'").replace('r104-remote.py','r105-remote.py').replace('R104_STOP:','R105_STOP:')
(out/'r105-remote.py').write_text(remote,encoding='utf-8')
(out/'r101-smoke.mjs').write_bytes((oldDir/'r101-smoke.mjs').read_bytes())
report={'release':release,'files':len(entries),'protectedFiles':len(old['protectedWeb']),'apiUnchanged':True,'path':str(out)}
(ROOT/'output/r105-release.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False))

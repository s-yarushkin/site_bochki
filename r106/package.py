"""Package model-only quiz against verified R105, with exact drift guards."""
import json,hashlib,zipfile,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.stdout.reconfigure(encoding='utf-8')
sha=lambda b:hashlib.sha256(b).hexdigest()
old=json.loads((ROOT/'output/R105-COPY-f45e3be949ad/manifest.json').read_text('utf-8'))
baseline=dict(old['baselineWeb'])
for f in old['files']:baseline[f['path']]=f['newSha256']
names=['index.html','analytics-core.mjs','quiz.mjs','quiz-engine.mjs','quiz.css','data/quiz-v1.json']
blobs={'web/'+n:(ROOT/'output/r106-site'/n).read_bytes() for n in names}
blobs['web/index.html']=blobs['web/index.html'].replace(b'data-release="R106-PREVIEW"',b'data-release="R106"').replace(b'<meta content="noindex,nofollow" name="robots"/>',b'<meta content="index,follow" name="robots"/>')
assert b'noindex' not in blobs['web/index.html']
blobs['api/server/quiz-channel-policy.mjs']=(ROOT/'api/server/quiz-channel-policy.mjs').read_bytes()
entries={n:{'sha256':sha(b),'bytes':len(b)} for n,b in blobs.items()}
release='DPQUIZ-'+sha(json.dumps(entries,sort_keys=True).encode())[:12]
out=ROOT/'output'/release;out.mkdir(exist_ok=True)
with zipfile.ZipFile(out/'payload.zip','w',zipfile.ZIP_DEFLATED) as z:
 for n,b in blobs.items():z.writestr(n,b)
protected={n:h for n,h in old['protectedWeb'].items() if n!='analytics-core.mjs'}
m={'release':release,'schemaVersion':2,'kind':'R106-model-only-quiz','files':entries,'payloadSha256':sha((out/'payload.zip').read_bytes()),'protectedWeb':protected,'additionalWeb':{},'baselineWeb':baseline,'expectedWeb':'/srv/sites/dachapar-preview/releases/'+old['release'],'expectedApi':old['expectedApi'],'noPriceChange':True,'noDatabaseMigration':True}
(out/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
src=(ROOT/'scripts/quiz-v1-remote.py').read_text('utf-8')
def replace(a,b):
 global src
 assert src.count(a)==1,a[:100]
 src=src.replace(a,b)
replace("def patch_site(html):", "def patch_site_legacy(html):")
replace("    text=patch_site((current_web/'index.html').read_text('utf8'))", "    if str(current_web)!=manifest['expectedWeb'] or str(current_api)!=manifest['expectedApi']:abort('active release drift')\n    if web_tree(current_web)!=manifest['baselineWeb']:abort('full live web tree drift')\n    text=blobs['web/index.html'].decode('utf8')")
replace("        if (root/path).exists():abort('would overwrite an existing file: '+key)","        if (root/path).exists() and key not in ['web/index.html','web/analytics-core.mjs']:abort('would overwrite an existing file: '+key)")
replace("    # Import and validate the real staged API with its private, installed dependencies.","    expected=dict(m['baselineWeb'])\n    expected.update({k.split('/',1)[1]:v['sha256'] for k,v in files.items() if k.startswith('web/')})\n    if web_tree(newweb)!=expected:abort('staged web tree mismatch')\n    subprocess.run(['node',str(Path(__file__).parent/'r101-smoke.mjs'),str(newweb),str(newapi)],check=True)\n    # Import and validate the real staged API with its private, installed dependencies.")
replace("        if file_sha(WEB/'index.html')!=sha(result[5].encode()):abort('website not switched correctly')", "        if file_sha(WEB/'index.html')!=sha(result[5].encode()):abort('website not switched correctly')\n        public_verify(manifest)")
extra='''
def web_tree(root):
    return {str(p.relative_to(root)):file_sha(p) for p in root.rglob('*') if p.is_file()}
def public_verify(manifest):
    origin='https://xn--80aaan1dh9b.xn--p1ai'
    for key,meta in manifest['files'].items():
        if not key.startswith('web/'):continue
        name=key[4:];path='/' if name=='index.html' else '/'+name
        with urllib.request.urlopen(origin+path+'?r106_verify='+manifest['release'],timeout=20) as r:
            if r.status!=200 or sha(r.read())!=meta['sha256']:abort('public bytes mismatch '+name)
    print('QUIZ_PUBLIC_BYTES=PASS')
'''
replace("if __name__=='__main__':",extra+"\nif __name__=='__main__':")
(out/'r106-remote.py').write_text(src,encoding='utf-8')
(out/'r101-smoke.mjs').write_bytes((ROOT/'output/R105-COPY-f45e3be949ad/r101-smoke.mjs').read_bytes())
(ROOT/'output/r106-release.json').write_text(json.dumps({'release':release,'path':str(out)},ensure_ascii=False,indent=2),encoding='utf-8')
print(release)

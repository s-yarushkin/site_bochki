"""Prepare an allowlisted R103 web overlay against the recorded stable release."""
import sys,json,hashlib,zipfile,shutil,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.stdout.reconfigure(encoding='utf-8')
sha=lambda b:hashlib.sha256(b).hexdigest()
stable=json.loads((ROOT/'docs/stable-r102.json').read_text('utf-8'))
snapshot=json.loads((ROOT/'.local/r103-production-inventory.json').read_text('utf-8-sig'))
old=json.loads((ROOT/'output'/stable['stableRelease']/'manifest.json').read_text('utf-8'))
assert Path(snapshot['web']).name==stable['stableRelease']
assert Path(snapshot['api']).name==stable['apiRelease']
review=json.loads((ROOT/'output/r103-manifest.json').read_text('utf-8'))
assert not json.loads((ROOT/'output/r103-verification.json').read_text('utf-8'))['errors']
candidate=ROOT/'output/r103-site'
protected=old['protectedWeb']
for name,value in protected.items():assert snapshot['files'][name]==value,name
names={('index.html' if r=='/' else r.strip('/')+'/index.html') for r in review['routes']}
names|={'404.html','sitemap.xml','robots.txt','r101/site.mjs','favicon.ico','favicon.svg'}
names|={f'favicon-{n}.png' for n in [32,48,120,180,192]}
names|={f.relative_to(candidate).as_posix() for f in (candidate/'r103').rglob('*') if f.is_file()}
assert not names&set(protected)
payload={}
for name in sorted(names):
 b=(candidate/name).read_bytes()
 if name=='robots.txt':b=(ROOT/'web/robots.txt').read_bytes()
 if name.endswith('.html'):
  b=b.replace(b'data-release="R103-CANDIDATE"',b'data-release="R103"')
  if name!='404.html':b=b.replace(b'<meta content="noindex,nofollow" name="robots"/>',b'<meta content="index,follow" name="robots"/>')
  assert (b'noindex' in b)==(name=='404.html'),name
 if snapshot['files'].get(name)!=sha(b):payload[name]=b
entries=[{'path':n,'oldSha256':snapshot['files'].get(n),'newSha256':sha(b),'bytes':len(b)} for n,b in payload.items()]
release='R103-SEO-'+sha(json.dumps(entries,sort_keys=True).encode())[:12]
out=ROOT/'output'/release;out.mkdir(exist_ok=True)
with zipfile.ZipFile(out/'payload.zip','w',zipfile.ZIP_DEFLATED) as z:
 for n,b in payload.items():z.writestr(n,b)
manifest={'release':release,'expectedWeb':snapshot['web'],'expectedApi':snapshot['api'],'payloadSha256':sha((out/'payload.zip').read_bytes()),'files':entries,'remove':[],'baselineWeb':snapshot['files'],'protectedWeb':protected,'routes':review['routes']}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
remote=(ROOT/'scripts/r102-remote.py').read_text('utf-8')
remote=remote.replace("r'R102-MOBILE-[a-f0-9]{12}'","r'R103-SEO-[a-f0-9]{12}'")
remote=remote.replace("WEB_RELEASES/'R101-V3-128a975b2184'","WEB_RELEASES/'R102-MOBILE-41dbaf3847e3'")
remote=remote.replace("if {e['path'] for e in manifest['files']}!={'r101/site.mjs','r101/visual.css','r101/mobile-dialog.mjs'}:fail('unexpected mobile patch files')", "if any(not (re.fullmatch(r'(?:index|404)\\.html|(?:bani/(?:kvadro|parus|viking|kvadro-haus)/|bani/|journal/(?:[a-z0-9-]+/)?|regiony/(?:[a-z0-9-]+/)?|komplektaciya/|komplektacii/|ceny/|planirovki/|dostavka-i-ustanovka/|voprosy/|kontakty/|compare/|raboty/)index\\.html|(?:robots\\.txt|sitemap\\.xml|r101/site\\.mjs|favicon\\.(?:ico|svg)|favicon-(?:32|48|120|180|192)\\.png|r103/(?:reading\\.css|region-context\\.mjs)|r103/assets/(?:sizes|site|wood|fuel|comfort)-(?:640|960|1536)\\.webp)',e['path'])) for e in manifest['files']):fail('unexpected SEO patch file')")
remote=remote.replace("'r102-remote.py'","'r103-remote.py'").replace('R101_STOP:','R103_STOP:')
start=remote.index("    for name in ['index.html'")
end=remote.index('    health()',start)
remote=remote[:start]+'''    names={e['path'] for e in manifest['files']}|{'manager.html','data/site-settings.json','data/catalog-pricebook.json','r101/mobile-dialog.mjs','robots.txt'}
    def verify_public(name):
        path='/' if name=='index.html' else '/'+name
        request=urllib.request.Request(ORIGIN+path+'?release_check='+manifest['release'],headers={'Cache-Control':'no-cache','User-Agent':'DachaPar-release-check'})
        with urllib.request.urlopen(request,timeout=20) as response:
            if digest(response.read())!=expected[name]:fail('served file differs: '+name)
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(verify_public,sorted(names)))
'''+remote[end:]
(out/'r103-remote.py').write_text(remote,encoding='utf-8')
smoke=(ROOT/'scripts/r101-smoke.mjs').read_text('utf-8')
smoke+='''\nfor(const pagePath of ['/regiony/moskva-i-oblast/','/regiony/sankt-peterburg-i-leningradskaya-oblast/','/regiony/vologodskaya-oblast/','/regiony/yaroslavskaya-oblast/']){
 const regionalFields={...fields,settlement:'Москва и Московская область'};
 const result=validateBaniLead(inquiryPayload(book,null,regionalFields,{purpose:'delivery',pagePath},'10301010-1010-4010-8010-101010101013'));
 assert.equal(result.journeyContext.pagePath,pagePath);assert.equal(result.journeyContext.district,regionalFields.settlement);
 assert.match(result.comment,/Московская область/);
}
console.log('REGIONAL_CONTEXT=PASS; four routes; no lead submitted');
'''
(out/'r101-smoke.mjs').write_text(smoke,encoding='utf-8')
report={'release':release,'path':str(out),'files':len(entries),'payloadBytes':(out/'payload.zip').stat().st_size,'protectedFiles':len(protected),'baselineWeb':snapshot['web'],'apiUnchanged':True}
(ROOT/'output/r103-release.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))

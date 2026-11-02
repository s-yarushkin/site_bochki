"""Read-only production checks after guarded quiz publication."""
import importlib.util,json
from pathlib import Path
base=Path('/tmp/dachapar-DPQUIZ-bd4ef314ab5f')
spec=importlib.util.spec_from_file_location('release',base/'r106-remote.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
manifest=json.loads((base/'manifest.json').read_text())
web=m.active(m.WEB,m.W_RELEASES);api=m.active(m.API,m.A_RELEASES)
assert web.name==api.name==manifest['release']
expected=dict(manifest['baselineWeb']);expected.update({k[4:]:v['sha256'] for k,v in manifest['files'].items() if k.startswith('web/')})
assert m.web_tree(web)==expected
oldapi=Path(manifest['expectedApi']);oldfiles={str(p.relative_to(oldapi)):m.file_sha(p) for p in oldapi.rglob('*') if p.is_file()}
newfiles={str(p.relative_to(api)):m.file_sha(p) for p in api.rglob('*') if p.is_file()}
for name,h in oldfiles.items():
 if name!='server/garant-bani-relay.mjs':assert newfiles[name]==h,name
assert m.file_sha(api/'server/garant-bani-relay.mjs')==m.sha(m.patch_api((oldapi/'server/garant-bani-relay.mjs').read_text()).encode())
for name,h in manifest['protectedWeb'].items():assert m.file_sha(web/name)==h,name
m.health();m.public_verify(manifest)
print(json.dumps({'release':manifest['release'],'postInstall':'PASS','protectedWeb':len(manifest['protectedWeb']),'existingApiFilesPreserved':True,'databaseReplaced':False,'leadSubmitted':False}))

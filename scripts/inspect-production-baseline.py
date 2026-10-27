"""Read the already-public source files referenced by the release; no production writes."""
from pathlib import Path
import json,hashlib,tarfile
HERE=Path(__file__).resolve().parent;m=json.loads((HERE/'manifest.json').read_text())
roots={'web':Path('/srv/sites/dachapar-preview/current'),'api':Path('/srv/services/garant-bani-relay/current')}
bad=[]
with tarfile.open(HERE/'production-source.tgz','w:gz') as t:
 for e in m['files']:
  p=roots[e['area']]/e['path']
  if p.is_file():
   actual=hashlib.sha256(p.read_bytes()).hexdigest()
   if actual not in [e['oldSha256'],e['newSha256']]:bad.append({'path':e['area']+'/'+e['path'],'sha256':actual})
   if p.is_symlink():raise RuntimeError('Unexpected symlink')
   t.add(p,arcname=e['area']+'/'+e['path'],recursive=False)
print(json.dumps({'mismatches':bad,'archive':str(HERE/'production-source.tgz')}))

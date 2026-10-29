"""Read-only public web inventory. Never reads credentials, lead data or API files."""
import hashlib,json
from pathlib import Path
web=Path('/srv/sites/dachapar-preview/current').resolve(strict=True)
api=Path('/srv/services/garant-bani-relay/current').resolve(strict=True)
assert web.parent==Path('/srv/sites/dachapar-preview/releases')
files={}
for path in sorted(web.rglob('*')):
    if path.is_symlink():raise RuntimeError('Unexpected web symlink: '+str(path))
    if path.is_file():files[path.relative_to(web).as_posix()]=hashlib.sha256(path.read_bytes()).hexdigest()
print(json.dumps({'web':str(web),'api':str(api),'files':files},sort_keys=True))

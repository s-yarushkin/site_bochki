"""Read-only local fixture: verified public files and reviewed overlay, no credentials."""
import hashlib,json,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/blackfriday-20261110';DEST=OUT/'preview-web'
c=json.loads((OUT/'baseline.json').read_text('utf8'))
sources=[OUT/'baseline/web',ROOT/'.local/package-layouts-20261110/baseline/web',ROOT/'.local/package-update-20261109/baseline/web',ROOT/'web']
missing=[]
for name,digest in c['web_files'].items():
 for base in sources:
  p=base/name
  if p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest()==digest:
   dest=DEST/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest);break
 else:missing.append(name)
for name in json.loads((OUT/'overlay-files.json').read_text('utf8')):
 dest=DEST/name.removeprefix('web/');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/name,dest)
(OUT/'preview-missing.json').write_text(json.dumps(missing,indent=2))
print(json.dumps({'web':str(DEST),'missing_unmodified_files':len(missing),'first_missing':missing[:10],'notifications':'in-memory delivery stub only'}))

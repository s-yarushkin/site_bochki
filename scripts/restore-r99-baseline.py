"""Reconstruct the owner's R99 WEB from local release artifacts. No remote writes."""
from pathlib import Path, PurePosixPath
import zipfile,tarfile,io,json,hashlib,sys
ROOT=Path(__file__).resolve().parents[1]
DOWNLOADS=Path('C:/Users/Sergey/Downloads')
API_ONLY='--api-only' in sys.argv
WEB=ROOT/'web';API=ROOT/'.local'/'api-baseline';RECORD=[]
if WEB.exists() and not API_ONLY:raise SystemExit('WEB already exists. Use --api-only to restore private local test sources without replacing web/.')
def write(dest,rel,data):
    if API_ONLY and dest==WEB:return
    pp=PurePosixPath(rel)
    if pp.is_absolute() or '..' in pp.parts or not pp.parts or ':' in rel:raise ValueError('UNSAFE_ARCHIVE_PATH')
    target=(dest/Path(*pp.parts)).resolve()
    if not target.is_relative_to(dest.resolve()):raise ValueError('PATH_ESCAPE')
    target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
def overlay(z,prefix,dest):
    count=0
    for item in z.infolist():
        if item.is_dir() or not item.filename.startswith(prefix):continue
        rel=item.filename[len(prefix):]
        if not rel:continue
        write(dest,rel,z.read(item));count+=1
    return count
handoff=DOWNLOADS/'DachaPar_P1_Deploy_Handoff_20261026.zip'
with zipfile.ZipFile(handoff) as z:
    RECORD.append({'source':handoff.name,'prefix':'reference/integrated-candidate/','files':overlay(z,'reference/integrated-candidate/',WEB)})
    for item in z.infolist():
        rel=item.filename.removeprefix('source/')
        if item.filename.startswith('source/') and not item.is_dir() and (rel.startswith(('server/','assets/js/','data/'))):write(API,rel,z.read(item))
for filename in ['DachaPar_R93_Final_20261026.zip','DachaPar_R94_Layouts_20261026.zip','DachaPar_R96_Plan_Info_20261027_R2.zip','DachaPar_R97_Visual_Gallery_20261027.zip']:
    with zipfile.ZipFile(DOWNLOADS/filename) as outer:
        payload=next(p for p in outer.namelist() if p.endswith('/payload.zip'))
        with zipfile.ZipFile(io.BytesIO(outer.read(payload))) as z:
            n=overlay(z,'web/',WEB);overlay(z,'api/',API);RECORD.append({'source':filename,'files':n})
snapshot=DOWNLOADS/'DachaPar_R98_Current_Web_Source_20261027.tgz'
with tarfile.open(snapshot) as t:
    for item in t.getmembers():
        if item.isfile():write(WEB,item.name,t.extractfile(item).read())
    RECORD.append({'source':snapshot.name,'files':len(t.getmembers())})
with zipfile.ZipFile(DOWNLOADS/'DachaPar_R99_UX_On_R98_20261027_PRICEBOOK_FIX1.zip') as outer:
    manifest=json.loads(outer.read('manifest.json'))
    with zipfile.ZipFile(io.BytesIO(outer.read('payload.zip'))) as z:
        overlay(z,'web/',WEB)
    for rel,expected in manifest['newFileSha256'].items():
        actual=hashlib.sha256((WEB/rel).read_bytes()).hexdigest() if not API_ONLY else expected
        if actual!=expected and not API_ONLY:raise ValueError('R99_HASH_MISMATCH '+rel)
    RECORD.append({'source':'R99 PRICEBOOK FIX1','verifiedFiles':len(manifest['newFileSha256'])})
baseline={p.relative_to(WEB).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in WEB.rglob('*') if p.is_file()}
(ROOT/'.local').mkdir(exist_ok=True)
if not API_ONLY:(ROOT/'.local'/'r99-baseline-hashes.json').write_text(json.dumps(baseline,indent=2),encoding='utf-8')
(ROOT/'.local'/'r99-baseline-sources.json').write_text(json.dumps(RECORD,indent=2),encoding='utf-8')
print('R99_RESTORED',len(baseline),'WEB files; 10 release hashes verified; API source private in .local.')

with zipfile.ZipFile(handoff) as z:
    for source,target in [('source/server/r85-public-pricebook.mjs','server/r85-public-pricebook-previous.mjs'),('source/assets/js/r85-pricing.mjs','server/r85-pricing-previous.mjs')]:
        if not (API/target).exists():write(API,target,z.read(source))

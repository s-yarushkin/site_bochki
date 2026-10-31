"""Create reproducible quiz-only handoff. Runs inside GitHub CI without private files."""
from pathlib import Path
import hashlib,json,zipfile,shutil,subprocess
ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'web'
def sha(data):return hashlib.sha256(data).hexdigest()
def file_sha(path):return sha(path.read_bytes())
def fail(s):raise SystemExit('QUIZ_BUNDLE_STOP: '+s)
# No overwrite of running pricebooks, credentials, databases or existing forms.
ship=[
 'web/quiz.mjs','web/quiz-engine.mjs','web/quiz.css','web/data/quiz-v1.json',
 'api/server/quiz-channel-policy.mjs'
]
protected=[
 'data/catalog-pricebook.json','quote.mjs','r85-pricing.mjs','consent.html','privacy.html'
]
additional=[
 'lead-client.mjs','phone-mask.mjs','analytics-runtime.mjs','analytics-core.mjs',
 'data/site-settings.json','r100-journey.css'
]
for path in ship:
 if not (ROOT/path).is_file():fail('missing '+path)
for name in protected+additional:
 if not (WEB/name).is_file():fail('missing web/'+name)
index=(WEB/'index.html').read_text('utf8')
if index.count('<link href="/quiz.css?v=dpq-20261031" rel="stylesheet"/>')!=1 or index.count('<script src="/quiz.mjs?v=dpq-20261031" type="module"></script>')!=1:
 fail('repository quiz mounts drift')
if index.count('<link href="/r100-journey.css?v=r100-20261027" rel="stylesheet"/>')!=1:
 fail('missing original R100 stylesheet anchor')
plans=json.loads((WEB/'data/quiz-v1.json').read_text('utf8'))
if len(plans.get('plans',[]))!=41 or plans.get('sourceAlbum') is not None:
 fail('quiz catalog drift')
if plans['priceRules']['stoves']['p4']['surchargeRub']!=7000 or plans['priceRules']['stoves']['p6']['surchargeRub']!=12000:
 fail('stove pricing contract drift')
# Ensure non-drifting calculations against Google Sheet fixture.
subprocess.run(['node','--test','tests/pricing-parity.test.mjs','tests/quiz.test.mjs','tests/quiz-channel-policy.test.mjs'],cwd=ROOT,check=True)
subprocess.run(['python3','scripts/check-public.py'],cwd=ROOT,check=True)
out=ROOT/'output'/'quiz-v1';out.mkdir(parents=True,exist_ok=True)
payload=out/'payload.zip'
with zipfile.ZipFile(payload,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for name in sorted(ship):
  blob=(ROOT/name).read_bytes()
  zi=zipfile.ZipInfo(name,(2026,10,31,0,0,0));zi.compress_type=zipfile.ZIP_DEFLATED
  zi.external_attr=0o644 << 16
  z.writestr(zi,blob)
entries={name:{'sha256':file_sha(ROOT/name),'bytes':(ROOT/name).stat().st_size} for name in ship}
release='DPQUIZ-'+sha(json.dumps(entries,sort_keys=True).encode())[:12]
manifest={
 'schemaVersion':1,'release':release,'kind':'quiz-only-safe-overlay',
 'payloadSha256':file_sha(payload),'files':entries,
 'protectedWeb':{name:file_sha(WEB/name) for name in protected},
 'additionalWeb':{name:file_sha(WEB/name) for name in additional},
 'noDatabaseMigration':True,'noPriceChange':True,
 'sourceCommit':'retrieve from GitHub release workflow',
 'note':'Preflight MUST pass on actual active WEB and API. Never bypass guards.'
}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n','utf8')
for name in ['quiz-v1-remote.py','Quiz-V1-Deploy.ps1']:
 shutil.copy2(ROOT/'scripts'/name,out/name)
(out/'README.txt').write_text(
  'DachaPar quiz release '+release+'\n'
  '1. On Windows unzip the archive, open PowerShell in this folder.\n'
  '2. .\\Quiz-V1-Deploy.ps1 -Mode Check (READ ONLY remote)\n'
  '3. .\\Quiz-V1-Deploy.ps1 -Mode Stage (copies releases; NO switch)\n'
  '4. .\\Quiz-V1-Deploy.ps1 -Mode Apply (backup SQLite; atomically switch code)\n'
  '5. Verify production GET and manager/MAX routing before real ad traffic.\n'
  '6. Rollback command printed by Apply; DOES NOT overwrite SQLite leads.\n'
  'If Check fails because production differs, STOP. Do not change expected hashes.\n'
  'IMPORTANT: This package does not contain credentials, private data or any price changes.\n',
  encoding='utf8'
)
with zipfile.ZipFile(out/(release+'-handoff.zip'),'w',zipfile.ZIP_DEFLATED) as z:
 for name in ['payload.zip','manifest.json','quiz-v1-remote.py','Quiz-V1-Deploy.ps1','README.txt']:
  z.write(out/name,name)
print('QUIZ_RELEASE_BUILD=PASS',json.dumps({'release':release,'shipFiles':len(entries),'protected':len(protected),'required':len(additional),'archive':str(out/(release+'-handoff.zip'))},ensure_ascii=False))

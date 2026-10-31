from pathlib import Path
import hashlib,json,zipfile,shutil,subprocess
ROOT=Path(__file__).resolve().parents[1];WEB=ROOT/'web';LOCAL=ROOT/'.local';baseline=json.loads((LOCAL/'r99-baseline-hashes.json').read_text('utf8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
protected=['quote.mjs','r85-pricing.mjs','data/catalog-pricebook.json','data/site-settings.json','consent.html','privacy.html']
# NO PACKAGE when Comfort prices drift between the workbook snapshot, the site and the quiz.
# A current authenticated Google Sheets export should additionally be passed via
# DACHAPAR_LIVE_PRICE_EXPORT for any price-changing release (see docs/PRICING_PARITY.md).
subprocess.run(['node','--test','tests/pricing-parity.test.mjs'],cwd=ROOT,check=True)
assert all(sha(WEB/n)==baseline[n] for n in protected),'Protected quote/legal files changed'
files=[];assets={};texts={'.html','.mjs','.js','.json','.css','.xml','.txt','.svg'}
for p in sorted(WEB.rglob('*')):
 if not p.is_file():continue
 name=p.relative_to(WEB).as_posix();h=sha(p)
 if h==baseline.get(name):continue
 if p.suffix not in texts:assets[name]=h;continue
 files.append({'area':'web','path':name,'oldSha256':baseline.get(name),'newSha256':h})
for p in sorted((ROOT/'api').rglob('*')):
 if p.is_file():
  name=p.relative_to(ROOT/'api').as_posix();old=LOCAL/'api-baseline'/name
  files.append({'area':'api','path':name,'oldSha256':sha(old) if old.is_file() else None,'newSha256':sha(p)})
payload_id=hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest()[:12];release='R100-CRO-'+payload_id
out=ROOT/'output'/release;out.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out/'payload.zip','w',zipfile.ZIP_DEFLATED) as z:
 for e in files:z.write(ROOT/e['area']/e['path'],e['area']+'/'+e['path'])
manifest={'release':release,'expectedWeb':'R99-UX-1f26cd8d7ccd','expectedApi':'R96-PLAN-INFO-004d95fb2255','payloadSha256':sha(out/'payload.zip'),'files':files,'protectedWeb':{n:baseline[n] for n in protected},'requiredAssets':assets}
manifest['protectedApi']={n:sha(LOCAL/'api-baseline'/n) for n in ['server/r85-quote.mjs','server/r85-public-pricebook.mjs','assets/js/r85-pricing.mjs','assets/js/lead-consent.js']}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n','utf8');shutil.copy2(ROOT/'scripts/r100-remote.py',out/'r100-remote.py')
shutil.copy2(ROOT/'scripts/R100-Deploy.ps1',out/'R100-Deploy.ps1')
shutil.copy2(ROOT/'docs/r100-implementation.md',out/'CHANGELOG.md')
(out/'README.md').write_text('ДачаПар '+release+'\n\n1. Проверка без переключения: .\\R100-Deploy.ps1 -Mode Check\n2. Подготовка копий: .\\R100-Deploy.ps1 -Mode Stage\n3. Выкладка: .\\R100-Deploy.ps1 -Mode Apply\n\nStage и Apply запросят sudo-пароль в вашем терминале. Существующий сайт до Apply не меняется. После выкладки установщик выведет команду отката. База обращений при откате не заменяется.\n\nСостав и ограничения: CHANGELOG.md. Секретов, себестоимости и базы в пакете нет.\n',encoding='utf8')
(ROOT/'output/latest-release.json').write_text(json.dumps({'release':release,'path':str(out)},ensure_ascii=False),'utf8')
print(json.dumps({'release':release,'files':len(files),'requiredExistingPhotos':len(assets),'path':str(out)},ensure_ascii=False))

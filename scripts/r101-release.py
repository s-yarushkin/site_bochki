"""Build a web-only R101 overlay from the verified candidate and live public hashes."""
import hashlib,json,shutil,zipfile,sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parents[1]
candidate=ROOT/'output/r101-site'
snapshot=json.loads((ROOT/'.local/r101-production-inventory.json').read_text('utf-8-sig'))
review=json.loads((ROOT/'output/r101-manifest.json').read_text('utf-8'))
sha=lambda b:hashlib.sha256(b).hexdigest()
expected='R100-CRO-0a7d323b55c3'
assert Path(snapshot['web']).name==expected and Path(snapshot['api']).name==expected
protected=dict(review['protected'])
manager_css=(ROOT/'.local/r101-live-manager.css').read_bytes()
assert sha(manager_css)==snapshot['files']['assets/css/manager.css']
assert manager_css.replace(b'\r\n',b'\n')==(candidate/'assets/css/manager.css').read_bytes().replace(b'\r\n',b'\n'),'Manager CSS content changed'
protected['assets/css/manager.css']=sha(manager_css)
for name in ['lead-client.mjs','lead-consent.mjs','analytics-core.mjs']:
    protected[name]=sha((candidate/name).read_bytes())
for name,h in protected.items():
    assert snapshot['files'].get(name)==h,'Live protected file differs: '+name
payload={}
for f in sorted(candidate.rglob('*')):
    if not f.is_file():continue
    name=f.relative_to(candidate).as_posix()
    if name in protected:continue  # Keep live bytes, including the cabinet's original line endings.
    if name=='manifest.json':continue  # Old authoring metadata is not part of the website.
    data=f.read_bytes()
    if f.suffix=='.html' and b'R101-CANDIDATE' in data:
        data=data.replace(b'data-release="R101-CANDIDATE"',b'data-release="R101"')
        if name!='404.html':data=data.replace(b'<meta content="noindex,nofollow" name="robots"/>',b'<meta content="index,follow" name="robots"/>')
        assert name=='404.html' or b'noindex' not in data,name
    if name=='robots.txt':data=(ROOT/'web/robots.txt').read_bytes()
    if snapshot['files'].get(name)!=sha(data):payload[name]=data
payload['llms.txt']=('# ДачаПар\n\nГотовые бани в комплектации Комфорт: Квадро, Парус, Викинг и Квадро Хаус.\n'
    'Цены моделей и размеров: https://xn--80aaan1dh9b.xn--p1ai/bani/\n'
    'Комплектация: https://xn--80aaan1dh9b.xn--p1ai/komplektaciya/\n'
    'Примеры планировок: https://xn--80aaan1dh9b.xn--p1ai/planirovki/\n'
    'Доставка: https://xn--80aaan1dh9b.xn--p1ai/dostavka-i-ustanovka/\n'
    'Телефон: +7 (951) 734-99-99\n\n'
    'Печь и дымоход, полки, мебель, электрика и стандартное освещение входят в Комфорт. '
    'Доставку, разгрузку, основание, внешние подключения и дополнительное оснащение согласуют отдельно. '
    'Сборка Квадро Хаус включена в его цену. Фасады показывают варианты исполнения; состав заказа согласуется индивидуально.\n').encode()
removed=[f'assets/plans/r93/{p}{suffix}.webp' for p in ['p9','p11'] for suffix in ['','_mirror']]
entries=[{'path':n,'oldSha256':snapshot['files'].get(n),'newSha256':sha(b),'bytes':len(b)} for n,b in sorted(payload.items())]
deletions=[{'path':n,'oldSha256':snapshot['files'][n]} for n in removed if n in snapshot['files']]
release='R101-V3-'+sha(json.dumps([entries,deletions],sort_keys=True).encode())[:12]
out=ROOT/'output'/release;out.mkdir(exist_ok=True)
with zipfile.ZipFile(out/'payload.zip','w',zipfile.ZIP_DEFLATED) as z:
    for n,b in sorted(payload.items()):z.writestr(n,b)
manifest={'release':release,'expectedWeb':snapshot['web'],'expectedApi':snapshot['api'],
          'payloadSha256':sha((out/'payload.zip').read_bytes()),'files':entries,'remove':deletions,
          'baselineWeb':snapshot['files'],'protectedWeb':protected,'routes':review['routes']}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n','utf-8')
for n in ['r101-remote.py','r101-smoke.mjs']:shutil.copy2(ROOT/'scripts'/n,out/n)
shutil.copy2(ROOT/'docs/r101-v3-decisions.md',out/'CHANGELOG.md')
result={'release':release,'path':str(out),'files':len(entries),'remove':len(deletions),'bytes':(out/'payload.zip').stat().st_size}
(ROOT/'output/r101-release.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps(result,ensure_ascii=False))

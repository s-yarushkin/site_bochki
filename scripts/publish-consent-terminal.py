"""Interactive publication coordinator. No password, visitor data or credentials saved."""
import base64,getpass,hashlib,json,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/consent-release';OUT.mkdir(parents=True,exist_ok=True)
def state(status,**fields):(OUT/'terminal-state.json').write_text(json.dumps({'status':status,**fields},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def run(args,**kw):return subprocess.run(args,cwd=ROOT,capture_output=True,check=True,timeout=60,**kw)
SOURCE="""import pathlib,json,hashlib,base64
w=pathlib.Path('/srv/sites/dachapar-preview/current').resolve(strict=True);a=pathlib.Path('/srv/services/garant-bani-relay/current').resolve(strict=True)
assert w.parent==pathlib.Path('/srv/sites/dachapar-preview/releases') and a.parent==pathlib.Path('/srv/services/garant-bani-relay/releases')
def tree(root):
 result={}
 for p in root.rglob('*'):
  if p.is_symlink():raise RuntimeError('Unexpected release symlink')
  if p.is_file():result[p.relative_to(root).as_posix()]=hashlib.sha256(p.read_bytes()).hexdigest()
 return result
files={}
for kind,root,names in [('api',a,['server/garant-bani-relay.mjs','server/crm-manager-api.mjs','server/crm-public-api.mjs','server/crm-insights.mjs']),('web',w,['index.html','journey-tracker.mjs','journey-tracker.css','analytics-core.mjs','privacy.html','assets/js/manager.js','crm/manager-extension.mjs'])]:
 for name in names:files[kind+'/'+name]=base64.b64encode((root/name).read_bytes()).decode()
print(json.dumps({'web':str(w),'api':str(a),'web_files':tree(w),'api_files':tree(a),'source':files}))
"""
password=None
try:
 print('Дача Пар: подготовка публикации аналитики.\nПароль потребуется только после проверки пакета.\n')
 state('reading_baseline');result=run(['ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=12','dachapar','python3 -'],input=SOURCE.encode());baseline=json.loads(result.stdout);sources=baseline.pop('source')
 for name,encoded in sources.items():
  p=OUT/'baseline'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(base64.b64decode(encoded))
 canonical=json.dumps(baseline,sort_keys=True).encode();digest=hashlib.sha256(canonical).hexdigest();(OUT/'baseline.json').write_text(json.dumps(baseline,indent=2)+'\n',encoding='utf8');state('baseline_ready',baseline_sha256=digest)
 print('Текущие исходники получены. Проверяется совместимость с уже работающим сайтом. Окно можно оставить открытым.\n')
 approval=OUT/'publish-approved.json';deadline=time.monotonic()+3600
 while True:
  if approval.exists():
   proof=json.loads(approval.read_text())
   if proof.get('baseline_sha256')==digest:break
  if time.monotonic()>deadline:raise RuntimeError('Время подготовки истекло. Пароль не запрашивался, сайт не менялся.')
  time.sleep(.5)
 config=json.loads((OUT/'deployment.json').read_text());release=config['release'];folder='/tmp/dachapar-consent-'+release.removeprefix('CONSENT-')
 if proof.get('release')!=release or proof.get('payload_sha256')!=config['payload_sha256']:raise RuntimeError('Пакет изменился после проверки. Нужна повторная проверка.')
 state('uploading',release=release);run(['ssh','-T','-o','BatchMode=yes','dachapar','mkdir -p -m 700 '+folder]);run(['scp',str(OUT/'deployment.json'),str(OUT/'payload.tar.gz'),str(ROOT/'scripts/deploy-consent-remote.py'),str(ROOT/'scripts/crm-production-audit.py'),'dachapar:'+folder+'/'])
 checked=run(['ssh','-T','-o','BatchMode=yes','dachapar','python3 '+folder+'/deploy-consent-remote.py --check']);assert json.loads(checked.stdout.decode().strip().splitlines()[-1])['ok']
 print('Проверка пакета пройдена. Будут обновлены баннер, общие счётчики и отчёт. Заявки, пароли, роли и MAX сохраняются.\n')
 state('waiting_sudo',release=release);password=getpass.getpass('Введите пароль сервера (sudo): ');state('publishing',release=release)
 published=subprocess.run(['ssh','-T','-o','BatchMode=yes','dachapar','sudo -S -p "" python3 '+folder+'/deploy-consent-remote.py --apply'],input=(password+'\n').encode(),capture_output=True,timeout=900);password=None
 rows=published.stdout.decode('utf8',errors='replace').strip().splitlines();receipt=json.loads(rows[-1]) if rows else {'ok':False,'message':'Сервер не вернул отчёт.'}
 if published.returncode or not receipt.get('ok'):raise RuntimeError(receipt.get('message','Публикация остановлена.'))
 (OUT/'deployment-result.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8');state('published',release=release);print('\nГОТОВО. Публикация завершена и проверена. Можно закрыть окно.')
except Exception as error:
 password=None;message='Не удалось подключиться к серверу или выполнить проверку.' if isinstance(error,subprocess.CalledProcessError) else str(error)[:300];state('stopped',error_type=type(error).__name__,message=message);print('\nОСТАНОВЛЕНО: '+message+'\nПароль не сохранён. Не отправляйте его в чат.')
finally:password=None;input('\nНажмите Enter, чтобы закрыть окно…')

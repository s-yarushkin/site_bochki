"""One password prompt; publication is detached and reconnects to its persisted receipt."""
import base64,getpass,hashlib,json,os,re,shlex,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/crm-speed-20261111'
ssh=['ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=12','-o','IPQoS=none','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2','dachapar']
def state(status,**values):(OUT/'terminal-state.json').write_bytes(json.dumps({'status':status,**values},ensure_ascii=False,indent=2).encode())
def call(code):
 command='exec(__import__("base64").b64decode("'+base64.b64encode(code.encode()).decode()+'"))'
 for attempt in range(4):
  try:
   r=subprocess.run(ssh+['python3 -c '+shlex.quote(command)],stdin=subprocess.DEVNULL,capture_output=True,timeout=35)
   if r.returncode:
    if r.returncode==255:raise ConnectionError('SSH temporarily unavailable')
    raise RuntimeError('Сервер не подтвердил проверку пакета. Изменения не запущены.')
   return json.loads(r.stdout.strip().splitlines()[-1])
  except (ConnectionError,subprocess.TimeoutExpired,OSError):
   if attempt==3:raise RuntimeError('Нет устойчивого SSH-соединения. Публикация не запущена; пароль не сохранён.')
   print('Связь временно недоступна. Повторное подключение…',flush=True);time.sleep(2)
password=None
try:
 print('ДачаПар — кабинет, акция и ускорение\n',flush=True)
 c=json.loads((OUT/'deployment.json').read_text('utf8'));release=c['release'];assert re.fullmatch(r'WORKSPACE-[a-f0-9]{12}',release)
 if hashlib.sha256((OUT/'payload.tar.gz').read_bytes()).hexdigest()!=c['payload_sha256']:raise RuntimeError('Локальный пакет требует повторной подготовки; публикация не начата.')
 proof=json.loads((OUT/'preflight.json').read_text('utf8'));assert proof.get('ok') and proof['release']==release
 folder=proof['folder'];assert folder=='/tmp/dachapar-workspace-'+release.removeprefix('WORKSPACE-')
 guard="from pathlib import Path;import hashlib,json;p=Path("+repr(folder)+");assert hashlib.sha256((p/'deployment.json').read_bytes()).hexdigest()=="+repr(hashlib.sha256((OUT/'deployment.json').read_bytes()).hexdigest())+";c=json.loads((p/'deployment.json').read_text());assert c['release']=="+repr(release)+" and c['payload_sha256']=="+repr(c['payload_sha256'])+";assert hashlib.sha256((p/'payload.tar.gz').read_bytes()).hexdigest()==c['payload_sha256'];assert all(hashlib.sha256((p/n).read_bytes()).hexdigest()==v for n,v in c['support_files'].items());r=json.loads((p/'preflight-result.json').read_text());assert r.get('ok') and r.get('release')==c['release'];print(json.dumps(r))"
 assert call(guard)['ok']
 print('Пакет проверен на текущем сайте. Обновляем кабинет и загрузку сайта. Исходные заявки, MAX, пароли, роли и второй фактор сохраняются.\n',flush=True)
 state('waiting_sudo',release=release);password=getpass.getpass('Введите пароль сервера (sudo): ');state('publishing',release=release)
 try:
  for attempt in range(3):
   try:
    result=subprocess.run(ssh+['sudo -S -p DachaPar-sudo: python3 '+folder+'/deploy-workspace-job.py --start'],input=(password+'\n').encode(),capture_output=True,timeout=40)
    error=result.stderr.decode('utf8',errors='replace').lower()
    if result.returncode and any(s in error for s in ['incorrect password','no password','sorry, try again']):raise RuntimeError('Сервер не принял sudo-пароль.')
    if not result.returncode:break
   except subprocess.TimeoutExpired:pass
   # --start is idempotent for this reviewed release; a running job is never duplicated.
   if attempt<2:print('Связь прервалась при запуске. Проверяем тот же сохранённый пакет…',flush=True);time.sleep(2)
 finally:password=None
 print('Публикация запущена. При обрыве связи переподключаемся к сохранённому отчёту.\n',flush=True)
 deadline=time.monotonic()+1200;last=None;receipt=None
 while time.monotonic()<deadline:
  try:
   code="from pathlib import Path;import json;p=Path("+repr(folder)+");s=p/'publication-status.json';r=p/'publication-result.json';print(json.dumps({'status':json.loads(s.read_text()) if s.exists() else {'status':'not_started'},'result':json.loads(r.read_text()) if r.exists() else None}))"
   data=call(code);status=data['status']['status'];state('publishing',release=release,remote_status=status)
   if status!=last:print('Состояние сервера: '+status,flush=True);last=status
   if data['result'] is not None:receipt=data['result'];break
  except (subprocess.SubprocessError,OSError,ValueError):
   if last!='connection_lost':print('Связь временно недоступна. Переподключаемся…',flush=True);last='connection_lost'
  time.sleep(5)
 if not receipt:raise RuntimeError('Ожидание отчёта истекло. Задание может продолжаться; не запускайте повторную публикацию.')
 if not receipt.get('ok'):raise RuntimeError(receipt.get('message','Публикация остановлена, прежний сайт сохранён.'))
 (OUT/'deployment-result.json').write_bytes((json.dumps(receipt,indent=2)+'\n').encode());state('published',release=release)
 print('\nГОТОВО. Опубликовано и проверено: https://дачапар.рф/\nМожно закрыть окно.',flush=True)
except Exception as error:
 password=None;message=str(error)[:240];state('stopped',message=message);print('\nОСТАНОВЛЕНО: '+message+'\nПароль не сохранён. Не отправляйте его в чат.',flush=True)
finally:password=None;input('\nНажмите Enter, чтобы закрыть окно…')

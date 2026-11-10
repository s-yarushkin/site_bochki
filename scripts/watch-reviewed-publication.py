"""Reconnect to a detached publication without credentials or relaunching it."""
import json,re,shlex,subprocess,time

def read_publication(folder):
 if not re.fullmatch('/tmp/dachapar-consent-[a-f0-9]{12}',folder):raise RuntimeError('Invalid publication folder')
 code="from pathlib import Path; import json; p=Path("+repr(folder)+"); s=p/'publication-status.json'; r=p/'publication-result.json'; print(json.dumps({'status':json.loads(s.read_text()) if s.exists() else {'status':'not_started'},'result':json.loads(r.read_text()) if r.exists() else None}))"
 result=subprocess.run(['ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=10','-o','IPQoS=none','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2','dachapar','python3 -c '+shlex.quote(code)],capture_output=True,timeout=30,check=True)
 return json.loads(result.stdout)

def wait_publication(folder,progress=lambda data:None,timeout=900):
 deadline=time.monotonic()+timeout;started=time.monotonic();last=None
 while time.monotonic()<deadline:
  try:data=read_publication(folder)
  except (subprocess.SubprocessError,OSError,ValueError):
   if last!='connection_lost':progress({'status':'connection_lost'})
   last='connection_lost';time.sleep(5);continue
  status=data['status'].get('status');last=status;progress(data['status'])
  if data.get('result') is not None:return data['result']
  if status=='not_started' and time.monotonic()-started>35:raise RuntimeError('Сервер не подтвердил запуск публикации. Рабочий сайт не переключался этим заданием.')
  time.sleep(5)
 raise RuntimeError('Время ожидания отчёта истекло. Задание может продолжаться на сервере; перед повтором проверьте его сохранённый статус.')

if __name__=='__main__':
 import argparse,os
 from pathlib import Path
 parser=argparse.ArgumentParser();parser.add_argument('--release',required=True);args=parser.parse_args()
 if not re.fullmatch('CONSENT-[a-f0-9]{12}',args.release):raise RuntimeError('Invalid release')
 folder='/tmp/dachapar-consent-'+args.release.removeprefix('CONSENT-')
 receipt=wait_publication(folder,progress=lambda data:print(json.dumps(data),flush=True))
 out=Path(__file__).resolve().parents[1]/'.local'/os.environ['DACHAPAR_CONSENT_PACKAGE']
 (out/'deployment-result.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8')
 print(json.dumps(receipt));raise SystemExit(0 if receipt.get('ok') else 1)

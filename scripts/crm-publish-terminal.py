"""Private interactive authentication. Password and generated credentials stay in RAM/terminal."""
import getpass,json,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/crm-release';STATE=OUT/'terminal-state.json'
def state(**data):STATE.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
def remote(script,password,folder):
 result=subprocess.run(['ssh','-T','-o','BatchMode=yes','dachapar','sudo -S -p "" /usr/bin/python3 '+folder+'/'+script],input=(password+'\n').encode(),capture_output=True,timeout=1200)
 lines=result.stdout.decode('utf-8',errors='replace').strip().splitlines()
 if result.returncode:
  # Do not persist or echo captured streams; they could include authentication information.
  raise RuntimeError('Remote '+script+' failed. Exit '+str(result.returncode)+'. No captured secrets were saved.')
 if not lines:raise RuntimeError('Remote result missing')
 return json.loads(lines[-1])
password=None
try:
 config=json.loads((OUT/'deployment.json').read_text());identity=config['id'];folder='/tmp/dachapar-crm-'+identity
 print('DachaPar CRM: HTTPS fixture check, then guarded production update. Real test MAX is disabled.')
 print('Enter deploy sudo password below. It is used only in this window, never saved or sent to chat.')
 state(status='waiting_sudo',id=identity)
 password=getpass.getpass('[sudo] password for deploy: ')
 result=remote('crm-remote-stage.py',password,folder)
 print('HTTPS FIXTURE READY: https://xn--80aaan1dh9b.xn--p1ai'+result['prefix']+'/manager.html')
 print('Keep this window open. Automated fixture verification is in progress; no further password input is needed.')
 (OUT/'stage-ready.json').write_text(json.dumps(result,indent=2),encoding='utf-8');state(status='waiting_https_verification',id=identity)
 deadline=time.monotonic()+6600
 while not (OUT/'stage-accepted.json').exists():
  if time.monotonic()>deadline:raise RuntimeError('HTTPS acceptance timed out; production was not changed')
  time.sleep(1)
 accepted=json.loads((OUT/'stage-accepted.json').read_text())
 if accepted.get('id')!=identity or accepted.get('https_pass') is not True:raise RuntimeError('Stage acceptance mismatch')
 subprocess.run(['scp','-q',str(OUT/'stage-accepted.json'),'dachapar:'+folder+'/stage-accepted.json'],check=True,timeout=60)
 state(status='publishing',id=identity);print('HTTPS VERIFIED. Publishing reviewed CRM package with fresh backup...')
 result=remote('crm-remote-install.py',password,folder);password=None
 credentials=result.pop('credentials',[]);(OUT/'deploy-result.json').write_text(json.dumps(result,indent=2),encoding='utf-8');state(status='published',id=identity)
 print('CRM PUBLISHED. Existing passwords preserved. Existing leads preserved: '+str(result['existing_leads_preserved']))
 if credentials:
  print('\nNEW STAFF TEMPORARY PASSWORDS (shown once; keep this window private):')
  for row in credentials:print(row['name']+' | '+row['phone']+' | '+row['initialPassword'])
  print('Each new employee must change this temporary password at first login. Owner may reset it later in Staff.')
 else:print('Both staff accounts already existed; their passwords were not changed.')
 credentials.clear()
except Exception as error:
 password=None;state(status='stopped',error_type=type(error).__name__,message=str(error)[:300]);print('STOP: '+str(error))
finally:password=None;input('\nPress Enter to close this window...')

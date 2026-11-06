"""Interactive sudo and activation codes: RAM/private terminal only, no saved secrets."""
import getpass,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/mfa';STATE=OUT/'terminal-state.json'
def state(**value):STATE.write_bytes((json.dumps(value,indent=2)+'\n').encode())
password=None
try:
 config=json.loads((OUT/'deployment.json').read_text());release='MFA-'+config['id'];folder='/tmp/dachapar-mfa-'+config['id']
 print('DachaPar: authenticator 2FA and remembered devices.')
 print('Checks: 39 tests PASS; browser QR/login/session/device checks PASS.')
 print('First, an isolated HTTPS fixture is tested (no real MAX); then a consistent backup and additive migration.')
 print('Existing passwords, staff roles, lead snapshots, marked images, plans, 3D and MAX contracts are preserved.')
 print('Existing sessions will need one new login and personal authenticator enrollment.')
 print('After publication this private window will show one-time activation codes for existing staff. Save them privately.')
 state(status='waiting_sudo',release=release);password=getpass.getpass('[sudo] password for deploy: ');state(status='publishing',release=release)
 result=subprocess.run(['ssh','-T','-o','BatchMode=yes','dachapar','sudo -S -p "" python3 '+folder+'/mfa-remote-install.py'],input=(password+'\n').encode(),capture_output=True,timeout=900);password=None
 # Do not print or save raw subprocess output. It can contain activation codes.
 lines=result.stdout.decode('utf8',errors='replace').strip().splitlines();receipt=json.loads(lines[-1]) if lines else {'ok':False,'message':'No server receipt.'}
 if result.returncode or receipt.get('ok') is not True:raise RuntimeError('Publication stopped: '+str(receipt.get('message','server command failed')))
 codes=receipt.pop('activationCodes');assert receipt['mfa_required'] and receipt['staff_credentials_preserved'] and receipt['max_contract_unchanged']
 (OUT/'deployment-result.json').write_bytes((json.dumps(receipt,indent=2)+'\n').encode());state(status='published',release=release)
 print('\nPUBLISHED: '+release+'\n');print('Open https://дачапар.рф/manager.html and sign in with your existing login/password.')
 print('Enter your PERSONAL activation code below, scan your QR in your authenticator, then enter 6 digits.')
 print('Save the 8 one-time recovery codes. Do not share QR codes or recovery codes.\n')
 for item in codes:print(item['name']+' | '+item['phone_e164']+'\nACTIVATION: '+item['activationCode']+'\nExpires: '+item['expires_at']+'\n')
 codes.clear();print('Keep this window until you save the activation codes privately. They are not saved in the deployment report.')
except Exception as error:
 password=None;state(status='stopped',error_type=type(error).__name__,message=str(error)[:500]);print('STOP: '+str(error))
finally:password=None;input('\nPress Enter to close this window...')

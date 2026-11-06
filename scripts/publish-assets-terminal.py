"""Interactive sudo only. Publishes the preflighted web-only package without saving passwords."""
import getpass,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/asset-refresh';STATE=OUT/'terminal-state.json'
def state(**value):STATE.write_bytes((json.dumps(value,indent=2)+'\n').encode())
password=None
try:
 config=json.loads((OUT/'deployment.json').read_text());release=config['release'];folder='/tmp/dachapar-assets-'+release.removeprefix('ASSETS-')
 print('DachaPar: watermarks on 574 images and restored 3D colours.')
 print('Preflight is complete. This updates only the web release. CRM, database, MAX and API stay unchanged.')
 print('Enter the deploy sudo password here only. It is never saved or sent to the chat.')
 state(status='waiting_sudo',release=release);password=getpass.getpass('[sudo] password for deploy: ');state(status='publishing',release=release)
 result=subprocess.run(['ssh','-T','-o','BatchMode=yes','dachapar','sudo -S -p "" python3 '+folder+'/deploy-assets-remote.py --apply'],input=(password+'\n').encode(),capture_output=True,timeout=900);password=None
 if result.returncode:
  raise RuntimeError('Deployment stopped. Exit '+str(result.returncode)+'. '+result.stderr.decode('utf-8',errors='replace')[-1200:])
 receipt=json.loads(result.stdout.decode('utf-8').strip().splitlines()[-1]);assert receipt['ok'] and receipt['api_unchanged'] and not receipt['database_touched']
 (OUT/'deployment-result.json').write_bytes((json.dumps(receipt,indent=2)+'\n').encode());state(status='published',release=release)
 print('PUBLISHED: '+release);print('574 watermarked images; 22 refreshed 3D previews. API and CRM unchanged.');print('Published file checks: '+str(receipt['public_files_verified']));print('You may close this window.')
except Exception as error:password=None;state(status='stopped',error_type=type(error).__name__,message=str(error)[:1200]);print('STOP: '+str(error))
finally:password=None;input('\nPress Enter to close this window...')

import json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/asset-refresh';config=json.loads((OUT/'deployment.json').read_text());remote='/tmp/dachapar-assets-'+config['release'].removeprefix('ASSETS-')
subprocess.run(['ssh','-o','BatchMode=yes','dachapar','umask 077; mkdir -m 700 '+remote],check=True,timeout=60)
subprocess.run(['scp','-q',str(OUT/'payload.tar.gz'),str(OUT/'deployment.json'),str(ROOT/'scripts/deploy-assets-remote.py'),'dachapar:'+remote+'/'],check=True,timeout=900)
result=subprocess.run(['ssh','-o','BatchMode=yes','dachapar','python3 '+remote+'/deploy-assets-remote.py --check'],check=True,capture_output=True,text=True,timeout=300)
preflight=json.loads(result.stdout.strip().splitlines()[-1]);assert preflight['ok'] and preflight['preflight']=='PASS';preflight['remote']=remote;preflight['release']=config['release'];(OUT/'preflight.json').write_bytes((json.dumps(preflight,indent=2)+'\n').encode());print(json.dumps(preflight),flush=True)

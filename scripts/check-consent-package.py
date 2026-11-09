"""Upload and validate candidate with deploy privileges, without sudo or live changes."""
import json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/consent-release'
c=json.loads((OUT/'deployment.json').read_text());folder='/tmp/dachapar-consent-'+c['release'].removeprefix('CONSENT-')
def run(args):return subprocess.run(args,cwd=ROOT,capture_output=True,check=True,timeout=240)
run(['ssh','-T','-o','BatchMode=yes','dachapar','mkdir -p -m 700 '+folder])
run(['scp',str(OUT/'deployment.json'),str(OUT/'payload.tar.gz'),str(ROOT/'scripts/deploy-consent-remote.py'),str(ROOT/'scripts/crm-production-audit.py'),'dachapar:'+folder+'/'])
r=run(['ssh','-T','-o','BatchMode=yes','dachapar','python3 '+folder+'/deploy-consent-remote.py --check'])
print(r.stdout.decode('utf8'))

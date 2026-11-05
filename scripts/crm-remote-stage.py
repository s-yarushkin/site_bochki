"""Fixture-only temporary HTTPS stage. Never opens the production database or credentials."""
import hashlib,json,os,re,subprocess,tarfile,time
from pathlib import Path
HERE=Path(__file__).resolve().parent;HOST='xn--80aaan1dh9b.xn--p1ai';CADDY=Path('/etc/caddy/Caddyfile')
def run(args,**kwargs):return subprocess.run(args,check=True,capture_output=True,text=True,**kwargs)
def block(source):
 start=source.index(HOST+' {');depth=0
 for i in range(start,len(source)):
  if source[i]=='{':depth+=1
  if source[i]=='}':
   depth-=1
   if depth==0:return start,i+1
 raise RuntimeError('Unbalanced vhost')
def main():
 if os.geteuid()!=0:raise RuntimeError('sudo required')
 config=json.loads((HERE/'deployment.json').read_text());identity=config['id'];assert re.fullmatch('[a-f0-9]{12}',identity)
 prefix='/crm-stage-'+identity;folder=Path('/srv/services')/('dachapar-crm-stage-'+identity);unit='dachapar-crm-stage-'+identity
 if hashlib.sha256((HERE/'stage.tar.gz').read_bytes()).hexdigest()!=config['stage_sha256']:raise RuntimeError('Stage checksum mismatch')
 if folder.exists():raise RuntimeError('Stage already exists')
 folder.mkdir(mode=0o755)
 with tarfile.open(HERE/'stage.tar.gz') as tar:
  for m in tar.getmembers():
   p=Path(m.name)
   if p.is_absolute() or '..' in p.parts or not m.isfile():raise RuntimeError('Unsafe stage member')
  tar.extractall(folder,filter='data')
 run(['chown','-R','deploy:deploy',str(folder)])
 before=CADDY.read_text();a,b=block(before);stanza=before[a:b];anchor='handle /api/* {'
 if stanza.count(anchor)!=1:raise RuntimeError('Unexpected API route')
 rule=f'handle_path {prefix}/* {{\n        header X-Robots-Tag "noindex, nofollow, noarchive"\n        reverse_proxy 127.0.0.1:3302\n    }}\n    '
 after=before[:a]+stanza.replace(anchor,rule+anchor)+before[b:]
 backup=HERE/'caddy-before-stage.txt';backup.write_text(before);os.chmod(backup,0o600)
 candidate=HERE/'caddy-stage.conf';candidate.write_text(after)
 run(['caddy','validate','--config',str(candidate),'--adapter','caddyfile'])
 run(['systemd-run','--unit='+unit,'--property=User=deploy','--property=NoNewPrivileges=yes','--property=ProtectSystem=strict','--property=ReadWritePaths='+str(folder),'--property=RuntimeMaxSec=7200','--working-directory='+str(folder),'--setenv=CRM_PREVIEW_PORT=3302','--setenv=CRM_PREVIEW_ORIGIN=https://'+HOST,'--setenv=CRM_PREVIEW_PREFIX='+prefix,'/usr/bin/node',str(folder/'scripts/crm-preview.mjs')])
 try:
  import urllib.request
  for attempt in range(20):
   try:
    with urllib.request.urlopen('http://127.0.0.1:3302/health',timeout=2) as r:assert json.load(r)['ok'];break
   except Exception:
    if attempt==19:raise
    time.sleep(.25)
  CADDY.write_text(after);run(['systemctl','reload','caddy'])
 except Exception:
  CADDY.write_text(before);run(['systemctl','reload','caddy']);run(['systemctl','stop',unit]);raise
 result={'ok':True,'fixture_only':True,'real_max_messages':0,'prefix':prefix,'unit':unit,'folder':str(folder),'caddy_sha256':hashlib.sha256(after.encode()).hexdigest(),'expires_hours':2}
 (HERE/'stage-ready.json').write_text(json.dumps(result));os.chmod(HERE/'stage-ready.json',0o644)
 print(json.dumps(result))
if __name__=='__main__':main()

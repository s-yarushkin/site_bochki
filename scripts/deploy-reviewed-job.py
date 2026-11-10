"""Short sudo launcher and detached release worker. No password is read or stored."""
import argparse,hashlib,json,os,re,subprocess,sys,time
from pathlib import Path
HERE=Path(__file__).resolve().parent
SUPPORT={'deploy-consent-remote.py','crm-production-audit.py','audit-lead-intent.py','caddy_public_cache.py','deploy-reviewed-job.py'}

def reviewed_config():
 c=json.loads((HERE/'deployment.json').read_text())
 if not re.fullmatch('CONSENT-[a-f0-9]{12}',c['release']):raise RuntimeError('Invalid release')
 if str(HERE)!='/tmp/dachapar-consent-'+c['release'].removeprefix('CONSENT-'):raise RuntimeError('Unexpected job folder')
 if set(c['support_files'])!=SUPPORT:raise RuntimeError('Unexpected support inventory')
 for name,digest in c['support_files'].items():
  if hashlib.sha256((HERE/name).read_bytes()).hexdigest()!=digest:raise RuntimeError('Reviewed helper changed')
 return c

def save(name,data,uid,gid):
 target=HERE/name;pending=HERE/(name+'.pending')
 if target.is_symlink() or pending.is_symlink():raise RuntimeError('Unexpected result symlink')
 pending.write_text(json.dumps(data,indent=2)+'\n');pending.chmod(0o600);os.chown(pending,uid,gid);os.replace(pending,target)

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--start',action='store_true');parser.add_argument('--worker',action='store_true');parser.add_argument('--uid',type=int);parser.add_argument('--gid',type=int);args=parser.parse_args()
 if os.geteuid()!=0 or args.start==args.worker:raise RuntimeError('Root and one job operation required')
 c=reviewed_config();release=c['release'];status=HERE/'publication-status.json'
 if args.start:
  uid=int(os.environ['SUDO_UID']);gid=int(os.environ['SUDO_GID'])
  if status.exists():
   previous=json.loads(status.read_text())
   if previous.get('status') in ['queued','running','published']:print(json.dumps({'ok':True,'started':True,'release':release,'existing_job':True}));return
   raise RuntimeError('Previous job stopped; inspect before retry')
  save('publication-status.json',{'status':'queued','release':release},uid,gid)
  # Session and descriptors are detached from SSH before doing any long work.
  log=HERE/'publication-worker.log'
  if log.exists() or log.is_symlink():raise RuntimeError('Unexpected worker log')
  with open(log,'xb') as output:
   os.chmod(log,0o600)
   child=subprocess.Popen(['python3',str(Path(__file__).resolve()),'--worker','--uid',str(uid),'--gid',str(gid)],stdin=subprocess.DEVNULL,stdout=output,stderr=output,start_new_session=True,close_fds=True)
  print(json.dumps({'ok':True,'started':True,'release':release,'pid':child.pid}),flush=True);return
 uid=args.uid;gid=args.gid
 if uid is None or uid<=0 or gid is None or gid<0:raise RuntimeError('Result owner required')
 save('publication-status.json',{'status':'running','release':release,'started_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())},uid,gid)
 try:
  result=subprocess.run(['python3',str(HERE/'deploy-consent-remote.py'),'--apply'],stdin=subprocess.DEVNULL,capture_output=True,timeout=900)
  rows=result.stdout.decode('utf8',errors='replace').strip().splitlines()
  receipt=json.loads(rows[-1]) if rows else {'ok':False,'message':'Release process returned no report','returncode':result.returncode}
  if result.returncode or not receipt.get('ok'):receipt['ok']=False
 except Exception as error:receipt={'ok':False,'error_type':type(error).__name__,'message':str(error)[:220]}
 save('publication-result.json',receipt,uid,gid)
 save('publication-status.json',{'status':'published' if receipt.get('ok') else 'stopped','release':release,'message':receipt.get('message')},uid,gid)

if __name__=='__main__':
 try:main()
 except Exception as error:print(json.dumps({'ok':False,'error_type':type(error).__name__,'message':str(error)[:220]}));raise SystemExit(1)

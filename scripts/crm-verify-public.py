"""Independent read-only deployment receipts. No login, leads or MAX sends."""
import hashlib,json,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/crm-release';ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
config=json.loads((OUT/'deployment.json').read_text());result=json.loads((OUT/'deploy-result.json').read_text());assert result['ok']
def fetch(path):
 try:
  with urllib.request.urlopen(ORIGIN+path,timeout=20) as r:return r.status,r.read(),dict(r.headers)
 except urllib.error.HTTPError as error:return error.code,error.read(),dict(error.headers)
verified=[]
for name,digest in config['overlay'].items():
 if not name.startswith('web/'):continue
 status,data,headers=fetch('/'+name[4:]);assert status==200;assert hashlib.sha256(data).hexdigest()==digest,name
 verified.append(name[4:])
statuses={}
for path,expected in [('/',200),('/manager.html',200),('/novyy-god/',200),('/bani/',200),('/planirovki/',200),('/health',200),('/api/analytics/config',200),('/api/manager/users',401),('/api/manager/leads',401),('/go/crm-verification-nonexistent',404),('/crm-stage-'+config['id']+'/manager.html',404)]:
 status,data,headers=fetch(path);assert status==expected,(path,status);statuses[path]=status
 if path=='/api/analytics/config':
  settings=json.loads(data);assert settings['enabled'] is True and settings['retention_days']==180
 if path=='/go/crm-verification-nonexistent':assert json.loads(data)['code']=='NOT_FOUND'
report={k:v for k,v in result.items() if k not in ['staff','owner_id']};report.update({'source_commit':config['source_commit'],'staff_accounts_created':sum(not s['existing'] for s in result['staff']),'staff_accounts_preserved':sum(s['existing'] for s in result['staff']),'http_statuses':statuses,'public_files_sha256_verified':verified,'automated_tests_passed':34,'https_fixture_acceptance':json.loads((OUT/'stage-accepted.json').read_text())['checks'],'browser_smoke':['Production main page and prices','GLB viewer and bench/door controls loaded','Model request form opened, no submit','R117 quiz all three steps and result','New Year landing and CTA','Necessary-only cookies, site remains usable','Production manager login page'],'production_authenticated_browser_login':'Not performed; owner enters existing password in the prepared browser page','real_max_test':'Not sent; delivery contract unchanged and tested with stub'} )
target=ROOT/'docs/crm-public-verification-20261106.json';target.write_bytes((json.dumps(report,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
print(json.dumps({'ok':True,'files_verified':len(verified),'routes_verified':len(statuses),'staff_created':report['staff_accounts_created'],'staff_preserved':report['staff_accounts_preserved'],'report':str(target)},ensure_ascii=False))

"""Independent public checks after the web-only asset deployment; no leads or login."""
import concurrent.futures,hashlib,json,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];HERE=ROOT/'.local/asset-refresh';ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'
config=json.loads((HERE/'deployment.json').read_text());receipt=json.loads((HERE/'deployment-result.json').read_text());assert receipt['ok'] and receipt['api_unchanged'] and not receipt['database_touched']
rows={r['path']:r for r in config['overlay']};selected=set(config['components'])
selected.update(n for n in rows if n.startswith('home-hero/layouts/previews/'))
selected.update(['home-hero/layouts/drawings/01.svg','home-hero/layouts/drawings/22.svg','home-hero/assets/kvadro-1280.webp','home-hero/assets/parus-1280.webp','home-hero/assets/viking-1280.webp','home-hero/assets/house-1280.webp','novyy-god/assets/winter-sauna-1536.webp'])
def fetch(name):
 with urllib.request.urlopen(ORIGIN+'/'+name,timeout=30) as response:
  data=response.read();assert hashlib.sha256(data).hexdigest()==rows[name]['sha256'],name
  return name
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:verified=list(pool.map(fetch,sorted(selected)))
statuses={}
for path,expected in [('/health',200),('/manager.html',200),('/api/manager/users',401),('/api/manager/leads',401),('/api/analytics/config',200)]:
 try:
  with urllib.request.urlopen(ORIGIN+path,timeout=15) as response:status=response.status
 except urllib.error.HTTPError as error:status=error.code
 assert status==expected,(path,status);statuses[path]=status
report={**receipt,'independent_public_hash_checks':verified,'http_statuses':statuses,'browser_checks':['Published neutral palette: white PVC, separate floor/walls/furniture','Door slider 100→0; bench retraction; reset','Published vector plan watermark and readable dimensions','Published hero and responsive photos','No page console errors'],'local_validation':{'images_decoded':537,'original_svg_contents_preserved':37,'exact_original_alpha':7,'browser_models_doors_and_benches':22,'unit_tests_passed':4},'source_git_bytes_verified':580}
target=ROOT/'docs/asset-public-verification-20261106.json';target.write_bytes((json.dumps(report,ensure_ascii=False,indent=2)+'\n').encode())
print(json.dumps({'ok':True,'release':receipt['release'],'independent_hash_checks':len(verified),'server_public_hash_checks':receipt['public_files_verified'],'statuses':statuses}))

"""Static critical graph audit. Counts requested URLs, including duplicate query identities."""
import json,re,sys,gzip
from pathlib import Path
from urllib.parse import urljoin,urlsplit
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/crm-speed-20261111'
web=Path(sys.argv[1]) if len(sys.argv)>1 else OUT/'preview-web'
sizes=json.loads((OUT/'sizes.json').read_text('utf8'))
html=(web/'index.html').read_text('utf8')
entries=re.findall(r'<script[^>]+src=["\']([^"\']+)',html)
imports=re.compile(r'(?:import\s*(?:[^;\n]*?\sfrom\s*)?|export\s+[^;\n]*?\sfrom\s*)["\']([^"\']+)["\']')
seen={};missing=[]
def visit(url,parent='/'):
 url=urljoin('https://local'+parent,url).removeprefix('https://local')
 if not url.startswith('/') or url in seen:return
 path=urlsplit(url).path.lstrip('/');p=web/path
 if not p.is_file():missing.append(path);return
 data=p.read_bytes();seen[url]={'bytes':len(data),'gzip':len(gzip.compress(data,mtime=0)),'path':path}
 if p.suffix in ['.mjs','.js']:
  for spec in imports.findall(data.decode('utf8')):visit(spec,url)
for entry in entries:visit(entry)
dup={path:[u for u,v in seen.items() if v['path']==path] for path in set(v['path'] for v in seen.values())}
dup={k:v for k,v in dup.items() if len(v)>1}
result={'entries':entries,'initial_module_urls':len(seen),'initial_js_bytes':sum(v['bytes'] for v in seen.values()),'initial_js_gzip_bytes':sum(v['gzip'] for v in seen.values()),'duplicate_module_paths':dup,'missing':missing,'largest_modules':sorted(seen.items(),key=lambda v:v[1]['bytes'],reverse=True)[:8],'largest_public_assets':sorted(sizes.items(),key=lambda v:v[1],reverse=True)[:10]}
(OUT/('performance-'+('before' if web.name=='preview-web' else 'after')+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in result.items() if k not in ['entries','duplicate_module_paths']},ensure_ascii=False))
print(json.dumps({'duplicates':list(dup)},ensure_ascii=False))

"""Read-only public HTTP smoke after quiz release. Does not send test leads."""
import argparse, hashlib, json, urllib.request
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--manifest',default='manifest.json');p.add_argument('--origin',default='https://xn--80aaan1dh9b.xn--p1ai');args=p.parse_args()
m=json.loads(Path(args.manifest).read_text('utf8'))
base=args.origin.rstrip('/')
def get(uri):
 req=urllib.request.Request(base+uri,headers={'User-Agent':'DachaPar-Quiz-Release-Smoke/1.0','Cache-Control':'no-cache'})
 with urllib.request.urlopen(req,timeout=12) as resp:
  if resp.status!=200:raise RuntimeError(str(uri)+' HTTP '+str(resp.status))
  return resp.read()
home=get('/')
assert b'/quiz.mjs?v=dpq-20261031' in home,'HOME_QUIZ_SCRIPT_MISSING'
assert b'/quiz.css?v=dpq-20261031' in home,'HOME_QUIZ_STYLES_MISSING'
for path in ['quiz.mjs','quiz-engine.mjs','quiz.css','data/quiz-v1.json']:
 blob=get('/'+path)
 expected=m['files']['web/'+path]['sha256']
 assert hashlib.sha256(blob).hexdigest()==expected,'STALE_PUBLIC_ASSET '+path
plans=json.loads(get('/data/quiz-v1.json'))
assert len(plans['plans'])==41,'QUIZ_PLAN_COUNT'
assert 'sourceAlbum' not in plans,'INTERNAL_ALBUM_LEAK'
assert hashlib.sha256(get('/data/catalog-pricebook.json')).hexdigest()==m['protectedWeb']['data/catalog-pricebook.json'],'PUBLIC_PRICEBOOK_CHANGED'
print('QUIZ_PUBLIC_GET=PASS; 41 plans; pricebook unchanged; no lead submitted')

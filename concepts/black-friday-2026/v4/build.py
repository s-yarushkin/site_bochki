"""Build a file://-ready native HTML preview with no production connections."""
import json,shutil
from html.parser import HTMLParser
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
data=json.loads((HERE.parent/'proposed-prices.json').read_text('utf8'));packages=json.loads((ROOT/'content/packages-20261109.json').read_text('utf8'))
assets=HERE/'assets';assets.mkdir(exist_ok=True)
for name in ['manrope-cyrillic.woff2','manrope-latin.woff2']:shutil.copyfile(ROOT/'web/assets'/name,assets/name)
safe=lambda v:json.dumps(v,ensure_ascii=False).replace('<',chr(92)+'u003c')
html=(HERE/'index.template.html').read_text('utf8').replace('__CAMPAIGN_DATA__',safe(data)).replace('__PACKAGE_DATA__',safe(packages))
(HERE/'index.html').write_bytes(html.encode())
class Assets(HTMLParser):
 def handle_starttag(self,tag,attrs):
  for key,value in attrs:
   if key not in ['src','href'] or not value or value.startswith(('https:','tel:','#')):continue
   assert (HERE/value).is_file(),'Missing local resource: '+value
Assets().feed(html)
for model in ['kvadro','parus','viking','kvadro-house']:assert (assets/('scene-'+model+'.png')).is_file()
print(json.dumps({'models':4,'sizes':len(data['rows'])//2,'prices':len(data['rows']),'native_html_text':True,'network_submissions':False}))

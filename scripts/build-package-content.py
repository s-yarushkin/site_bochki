"""Build the public package copy and home CSS from a verified production snapshot."""
import hashlib,json,re
from html import escape
from pathlib import Path
from urllib.parse import urljoin
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/package-update-20261109';BASE=OUT/'baseline/web'
data=json.loads((ROOT/'content/packages-20261109.json').read_text('utf8'));baseline=json.loads((OUT/'baseline.json').read_text('utf8'))
def write(rel,text):
 p=ROOT/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(text.encode('utf8'))
exports={'PACKAGE_NAMES':data['names'],'PACKAGE_COPY':data['short'],'PACKAGE_STORIES':data['stories'],'COMPARISON':data['comparison'],'PACKAGE_NOTES':data['notes']}
write('web/choice/packages.mjs','// Generated from content/packages-20261109.json. Prices are owned by the pricebook.\n'+''.join('export const '+k+'='+json.dumps(v,ensure_ascii=False,indent=2)+';\n' for k,v in exports.items()))
cards=[]
for key,s in data['stories'].items():
 bullets=''.join('<li><strong>'+escape(b['title'])+'</strong><span>'+escape(b['text'])+'</span></li>' for b in s['features'])
 cards.append('<article class="package-story is-'+key+'" aria-labelledby="package-'+key+'-title"><p class="package-story-eyebrow">'+escape(s['eyebrow'])+'</p><h3 id="package-'+key+'-title">Комплектация «'+escape(s['title'])+'»</h3><p class="package-story-lead">'+escape(s['lead'])+'</p><p>'+escape(s['description'])+'</p><ul>'+bullets+'</ul></article>')
section='<section class="quiet section" id="comfort"><div class="wrap package-section">\n<header class="package-section-heading"><p class="eyebrow">Две готовые комплектации</p><h2>'+escape(data['heading'])+'</h2><p class="lede">'+escape(data['intro'])+'</p></header>\n<div class="package-overview">'+''.join(cards)+'</div>\n<div class="package-section-footer"><button type="button" class="choice-text-button" data-compare-details aria-haspopup="dialog">Сравнить полное оснащение «Комфорт» и «Делюкс» <span aria-hidden="true">↗</span></button><p>'+escape(data['notes'][0])+'</p><p>'+escape(data['notes'][1])+'</p></div>\n</div></section>'
html=(BASE/'index.html').read_text('utf8');start=re.search(r'<section\b[^>]*\bid="comfort"[^>]*>',html)
if not start:raise RuntimeError('Package section missing')
end=html.index('</section>',start.end())+len('</section>');html=html[:start.start()]+section+html[end:]
# Six adjacent blocking stylesheets retain their cascade order in one file.
styles=['r101/vendor/scrollcraft.css','r101/site.css','r101/visual.css','choice/home-hero/hero.css','quiz.css','choice/choice.css'];chunks=[]
for name in styles:
 p=BASE/name
 if not p.exists():
  previous=ROOT/'.local/consent-v2/baseline/web'/name
  if not previous.exists() or hashlib.sha256(previous.read_bytes()).hexdigest()!=baseline['web_files'][name]:raise RuntimeError('Verified CSS source missing: '+name)
  p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(previous.read_bytes())
 css=p.read_text('utf8')
 if re.search(r'@import\b',css):raise RuntimeError('CSS imports require explicit handling: '+name)
 css=re.sub(r'@charset\s+[^;]+;','',css)
 def rebase(m):
  q=m.group(1);url=m.group(2).strip()
  if not url.startswith(('/','#','data:','http:','https:')):url=urljoin('/'+name,url)
  return 'url('+q+url+q+')'
 css=re.sub(r'''url\(\s*(["']?)([^)"']+)\1\s*\)''',rebase,css)
 chunks.append('/* Source: /'+name+' */\n'+css+'\n')
bundle=''.join(chunks);digest=hashlib.sha256(bundle.encode()).hexdigest()[:12];bundle_path='assets/home-core-'+digest+'.css';write('web/'+bundle_path,bundle)
links=''.join('<link rel="stylesheet" href="/'+name+'">' for name in styles)
if links not in html:raise RuntimeError('Critical CSS order changed; do not replace blindly')
html=html.replace(links,'<link rel="stylesheet" href="/'+bundle_path+'">',1)
hint='<link rel="preload" as="image" href="/choice/assets/kvadro-1920.webp" imagesrcset="/choice/assets/kvadro-640.webp 640w,/choice/assets/kvadro-1280.webp 1280w,/choice/assets/kvadro-1920.webp 1920w" imagesizes="100vw" fetchpriority="high">\n'
html=html.replace('<link rel="preload" href="/assets/manrope-cyrillic.woff2"',hint+'<link rel="preload" href="/assets/manrope-cyrillic.woff2"',1)
write('web/index.html',html)
(OUT/'content-build.json').write_text(json.dumps({'bundle':bundle_path,'styles_combined':styles,'rows':len(data['comparison']),'pricebooks_modified':False,'baseline_index_sha256':baseline['web_files']['index.html'],'index_sha256':hashlib.sha256(html.encode()).hexdigest()},indent=2)+'\n',encoding='utf8')
print(json.dumps({'bundle':bundle_path,'comparison_rows':len(data['comparison']),'blocking_css_requests_removed':5,'pricebooks_modified':False}))

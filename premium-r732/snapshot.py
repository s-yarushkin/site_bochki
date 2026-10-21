"""Capture the public, exact-live baseline. GET only; no application API calls."""
import concurrent.futures
import hashlib
import json
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT=Path(__file__).resolve().parent
ORIGIN='https://xn--80aaan1dh9b.xn--p1ai'

def get(rel):
    req=urllib.request.Request(ORIGIN+'/'+rel,headers={'Accept-Encoding':'identity','User-Agent':'DachaPar-R732-public-source/1.0'})
    with urllib.request.urlopen(req,timeout=30) as r:
        if r.status!=200 or urllib.parse.urlsplit(r.geturl()).hostname!=urllib.parse.urlsplit(ORIGIN).hostname:
            raise RuntimeError('UNEXPECTED_PUBLIC_SOURCE_'+rel)
        return r.read()

def main():
    sitemap=get('sitemap.xml')
    urls=[x.text for x in ET.fromstring(sitemap).findall('.//{*}loc')]
    if len(urls)!=21:raise RuntimeError('BASELINE_URL_COUNT_CHANGED')
    paths=[urllib.parse.urlsplit(u).path.lstrip('/')+'index.html' for u in urls]
    paths+=['sitemap.xml','robots.txt','data/catalog-pricebook.json']
    def capture(rel):
        raw=get(rel);target=ROOT/'baseline'/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
        return rel,{'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        entries=dict(pool.map(capture,paths))
    manifest={'origin':ORIGIN,'source_release':'R731-SEO-P0-7e83cabf0aa8-1792587304682300390','api_release':'R73-LEGAL-db5d49445661-1792566478879449075','snapshot_date':'2026-10-21','files':entries}
    (ROOT/'baseline-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print('R732_BASELINE_CAPTURE=PASS; HTML=21; DATA=3; POST=0')

if __name__=='__main__':main()

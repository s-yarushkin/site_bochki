#!/usr/bin/env python3
"""Prepare ONLY four public Parus widget files as staging output, no prod mutation.
Source: exact owner-downloaded live archive, checked by SHA256. Never touches MAX/DB/manager.
"""
from __future__ import annotations
import argparse, hashlib, json, pathlib, zipfile

EXPECTED={
 'index.html':'339391845AA453F6627331755CD52D7C83311B60155B92D7C8B7F4B42060FB77',
 'parus-media_widget.mjs':'F0F02302B01C4072194381D0755CF35DAA8BE529BA91A2EEC27DF9162E79872A',
 'parus-media_widget.css':'BA6CC1CE1D41F4A545A77A68853F39505F8A9B3E44BD5944712B0D10385E2E72',
 'parus-media_content.mjs':'C71B32B2AE4A07DB722F5D2CB97D4613AEB68A844EFD7D37E395CADCD02276F4',
}
VERSION='20261022-gallery-p0-rc1'
def sha256(data:bytes)->str:return hashlib.sha256(data).hexdigest().upper()
def stage(source:pathlib.Path,patch:pathlib.Path,dest:pathlib.Path):
 if not source.is_file():raise ValueError('SOURCE_ZIP_MISSING')
 with zipfile.ZipFile(source) as z:
  names=set(z.namelist())
  if not set(EXPECTED).issubset(names):raise ValueError('SOURCE_ZIP_INCOMPLETE')
  original={name:z.read(name) for name in EXPECTED}
 for name,hash_ in EXPECTED.items():
  if sha256(original[name])!=hash_:raise ValueError('SOURCE_SHA256_CHANGED: '+name)
 for path in ['parus-media/widget.mjs','parus-media/widget.css','parus-media/content.mjs']:
  if not (patch/path).is_file():raise ValueError('PATCH_MISSING: '+path)
 # Exact, immutable data contract. Photo/plan set must be byte-identical.
 if (patch/'parus-media/content.mjs').read_bytes()!=original['parus-media_content.mjs']:
  raise ValueError('OBJECTS_AND_LAYOUTS_CHANGED')
 updated=original['index.html'].decode('utf-8')
 for old,new in [('widget.css?v=20261022','widget.css?v='+VERSION),('widget.mjs?v=20261022','widget.mjs?v='+VERSION)]:
  if updated.count(old)!=1:raise ValueError('UNEXPECTED_HTML_REFERENCES: '+old)
  updated=updated.replace(old,new)
 if updated.count('dachapar-parus-media')!=1:raise ValueError('UNEXPECTED_PARUS_MARKER')
 dest.mkdir(parents=True,exist_ok=True)
 (dest/'index.html').write_text(updated,encoding='utf-8')
 out=dest/'parus-media';out.mkdir(exist_ok=True)
 for name in ['widget.mjs','widget.css','content.mjs']:
  (out/name).write_bytes((patch/'parus-media'/name).read_bytes())
 summary={
   'status':'STAGED_NOT_DEPLOYED', 'source_sha256':EXPECTED,
   'outputs':{str(p.relative_to(dest)):sha256(p.read_bytes()) for p in [dest/'index.html',out/'widget.mjs',out/'widget.css',out/'content.mjs']},
   'unchanged':{'objects':4,'published_photos':10,'published_plans':5,'pricebook':True,'lead_backend':True,'manager':True},
   'assets_included':False,'cache_version':VERSION,
   'production_writes':0,'requires_full_site_release_overlay':True,
 }
 (dest/'P0-RELEASE-STAGING-REPORT.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps(summary,ensure_ascii=False,indent=2))
 return summary
if __name__=='__main__':
 p=argparse.ArgumentParser()
 p.add_argument('--live-zip',type=pathlib.Path,required=True)
 p.add_argument('--patch-root',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1])
 p.add_argument('--out',type=pathlib.Path,required=True)
 a=p.parse_args();stage(a.live_zip,a.patch_root,a.out)

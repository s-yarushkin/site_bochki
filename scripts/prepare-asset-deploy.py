import hashlib,json,subprocess,tarfile,io,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];HERE=ROOT/'.local/asset-refresh';OVERLAY=HERE/'overlay/web'
components={
 'home-hero/layout-viewer.mjs':'concepts/home-hero/layout-viewer.mjs',
 'home-hero/layout-materials.mjs':'concepts/home-hero/layout-materials.mjs',
 'home-hero/layout-panel.mjs':'concepts/home-hero/layout-panel.mjs',
 'home-hero/hero.css':'concepts/home-hero/hero.css',
 'choice/home-hero/layout-panel.mjs':'concepts/choice-album/choice/home-hero/layout-panel.mjs',
 'choice/home-hero/hero.css':'concepts/choice-album/choice/home-hero/hero.css',
}
def sha(data):return hashlib.sha256(data).hexdigest()
def main():
 report=json.loads((HERE/'verification.json').read_text());assert report['ok'] and report['assets']==574 and report['models_rendered']==22
 assets=json.loads((HERE/'assets-manifest.json').read_text());baseline=json.loads((HERE/'baseline/__inventory.json').read_text());rows=[]
 for name,source in components.items():
  target=OVERLAY/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((ROOT/source).read_bytes())
 if '--preview-only' in sys.argv:print('Candidate viewer and styles staged; no deployment package built.');return
 for row in assets['assets']:rows.append({k:row[k] for k in ['path','source','sha256','bytes','category']})
 for name,source in components.items():
  data=(OVERLAY/name).read_bytes();rows.append({'path':name,'source':source,'sha256':sha(data),'bytes':len(data),'category':'viewer'})
 rows.sort(key=lambda r:r['path']);assert len(rows)==580 and len({r['path'] for r in rows})==580
 commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
 config={'release':'ASSETS-'+commit[:12],'source_commit':commit,'baseline':baseline,'overlay':rows,'verification':report,'components':list(components)}
 with tarfile.open(HERE/'payload.tar.gz','w:gz',compresslevel=1) as tar:
  for row in rows:
   data=(OVERLAY/row['path']).read_bytes();assert sha(data)==row['sha256'];info=tarfile.TarInfo('site/'+row['path']);info.mode=0o644;info.mtime=0;info.size=len(data);tar.addfile(info,io.BytesIO(data))
 config['payload_sha256']=sha((HERE/'payload.tar.gz').read_bytes());(HERE/'deployment.json').write_bytes((json.dumps(config,ensure_ascii=False,indent=2)+'\n').encode())
 print(json.dumps({'release':config['release'],'files':len(rows),'payload_bytes':(HERE/'payload.tar.gz').stat().st_size,'photos':report['counts']['photo'],'plans':report['counts']['drawing'],'3d_previews':22}))
if __name__=='__main__':main()

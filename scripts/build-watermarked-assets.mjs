import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
import {loadSharp,stampRaster,stampVector,WATERMARK_VERSION} from './watermark-lib.mjs';
const root=path.resolve('.'),base=path.join(root,'.local/asset-refresh/baseline'),out=path.join(root,'.local/asset-refresh/overlay/web'),cache=path.join(root,'.local/asset-refresh/watermark-cache'),rendered=path.join(root,'.local/asset-refresh/rendered-previews');
await fs.mkdir(out,{recursive:true});await fs.mkdir(cache,{recursive:true});const inventory=JSON.parse(await fs.readFile(path.join(base,'__inventory.json'))),tracked=new Set(execFileSync('git',['ls-files'],{encoding:'utf8'}).trim().split('\n')),sharp=loadSharp();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),rows=[],excluded=[];
const names=Object.keys(inventory.files).filter(n=>/\.(?:webp|jpe?g|png|svg)$/i.test(n));let completed=0;
async function processAsset(name){
 if(/(?:^|\/)(?:favicon(?:-\d+)?\.(?:png|svg)|[^/]*-favicon\.svg|placeholder\.svg)$/.test(name)){excluded.push({path:name,reason:'interface_icon_or_placeholder'});return;}
 if(!inventory.files[name].bytes){excluded.push({path:name,reason:'preexisting_empty_file'});return;}
 let input=await fs.readFile(path.join(base,name)),category=name.endsWith('.svg')?'drawing':/\/(?:plans|drawings)\//i.test(name)?'drawing':'photo';
 const preview=/^home-hero\/layouts\/previews\/(\d{2})\.webp$/.exec(name);if(preview){if(process.argv.includes('--skip-previews')){excluded.push({path:name,reason:'pending_corrected_3d_preview'});return;}category='3d_preview';try{input=await fs.readFile(path.join(rendered,preview[1]+'.webp'));}catch{if(!process.argv.includes('--allow-old-previews'))throw Error('Render all 22 corrected 3D previews first');}}
 const inputSha=hash(input),key=hash(Buffer.from(WATERMARK_VERSION+'|'+inputSha+'|'+category)),cached=path.join(cache,key+path.extname(name));let output,meta;
 try{output=await fs.readFile(cached);if(!name.endsWith('.svg')){meta=await sharp(input).metadata();const existing=await sharp(output).metadata();if(Boolean(meta.hasAlpha)!==Boolean(existing.hasAlpha))throw Error('STALE_ALPHA_CACHE');}}catch{
  if(name.endsWith('.svg'))output=Buffer.from(stampVector(input.toString('utf8')));
  else{const result=await stampRaster(input,{plan:category==='drawing',sourceSha:inputSha,sharp});output=result.bytes;meta=result.metadata;}
  const temporary=cached+'.'+process.pid+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(temporary,output,{flag:'wx'});await fs.rename(temporary,cached);
 }
 const target=path.resolve(out,name);if(!target.startsWith(out+path.sep))throw Error('Unsafe asset path');await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,output);
 const source=['web/'+name,name,'concepts/'+name,'concepts/choice-album/'+name].find(n=>tracked.has(n))??'web/'+name;
 rows.push({path:name,source,category,before_sha256:inventory.files[name].sha256,input_sha256:inputSha,sha256:hash(output),bytes:output.length,...(meta?{width:meta.width,height:meta.height,has_alpha:meta.hasAlpha}:{}),watermark:WATERMARK_VERSION});completed++;if(completed%40===0)console.log('Watermarked '+completed+'/'+names.length);
}
// Two workers bound peak memory while preserving full image dimensions and alpha.
const pending=[...names];await Promise.all([0,1].map(async()=>{while(pending.length){const name=pending.shift();await processAsset(name);}}));
rows.sort((a,b)=>a.path.localeCompare(b.path));excluded.sort((a,b)=>a.path.localeCompare(b.path));const manifest={version:WATERMARK_VERSION,baseline_web:inventory.web,baseline_api:inventory.api,assets:rows,excluded,counts:Object.fromEntries([...new Set(rows.map(r=>r.category))].map(c=>[c,rows.filter(r=>r.category===c).length]))};
await fs.writeFile(path.join(root,'.local/asset-refresh/assets-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({done:rows.length,counts:manifest.counts,excluded:excluded.length,bytes:rows.reduce((s,r)=>s+r.bytes,0)}));
if(process.argv.includes('--stage-source'))for(const row of rows){const target=path.resolve(root,row.source);if(!target.startsWith(root+path.sep))throw Error('Unsafe source path');await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(out,row.path),target);}

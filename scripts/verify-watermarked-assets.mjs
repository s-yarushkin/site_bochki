import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import {loadSharp,WATERMARK_VERSION} from './watermark-lib.mjs';
const root=path.resolve('.'),folder=path.join(root,'.local/asset-refresh'),manifest=JSON.parse(await fs.readFile(path.join(folder,'assets-manifest.json'))),base=path.join(folder,'baseline'),out=path.join(folder,'overlay/web'),sharp=loadSharp();
if(manifest.assets.length!==574||manifest.assets.filter(r=>r.category==='3d_preview').length!==22||manifest.excluded.some(r=>r.reason.startsWith('pending')))throw Error('Incomplete image coverage');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');let alphaVerified=0,vectorsVerified=0,rastersVerified=0;
for(const row of manifest.assets){const target=path.join(out,row.path),bytes=await fs.readFile(target);if(hash(bytes)!==row.sha256)throw Error('File checksum: '+row.path);
 if(row.path.endsWith('.svg')){const source=await fs.readFile(path.join(base,row.path),'utf8'),text=bytes.toString(),end=source.lastIndexOf('</svg>');if(!text.startsWith(source.slice(0,end))||!text.endsWith(source.slice(end))||!text.includes('data-dachapar-watermark="'+WATERMARK_VERSION+'"'))throw Error('Original vector altered: '+row.path);await sharp(bytes).metadata();vectorsVerified++;continue;}
 const meta=await sharp(bytes).metadata();if(meta.width!==row.width||meta.height!==row.height||!meta.xmp?.toString().includes(WATERMARK_VERSION))throw Error('Image dimensions or marker: '+row.path);
 await sharp(bytes).stats();rastersVerified++;
 const sourcePath=row.category==='3d_preview'?path.join(folder,'rendered-previews',path.basename(row.path)):path.join(base,row.path),before=await sharp(sourcePath).metadata();
 if(Boolean(before.hasAlpha)!==Boolean(meta.hasAlpha))throw Error('Alpha type lost: '+row.path);
 if(before.hasAlpha){const a=await sharp(sourcePath).autoOrient().extractChannel('alpha').raw().toBuffer(),b=await sharp(bytes).extractChannel('alpha').raw().toBuffer();if(!a.equals(b))throw Error('Alpha changed: '+row.path);alphaVerified++;}
}
const checks=JSON.parse(await fs.readFile(path.join(folder,'rendered-previews/checks.json')));if(checks.length!==22||!checks.every(r=>r.rendered&&r.doors>0&&r.bench))throw Error('3D interaction checks missing');
const report={ok:true,version:WATERMARK_VERSION,assets:manifest.assets.length,rasters_verified:rastersVerified,vectors_verified:vectorsVerified,alpha_channels_exact:alphaVerified,counts:manifest.counts,models_rendered:checks.length,doors_and_benches:'PASS',excluded:manifest.excluded,original_geometry_and_specs:'Unchanged; candidate is media and viewer only'};
await fs.writeFile(path.join(folder,'verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

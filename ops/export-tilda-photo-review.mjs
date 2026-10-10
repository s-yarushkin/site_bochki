/**
 * Private/offline photo proof package. Does not publish or approve photos.
 * node ops/export-tilda-photo-review.mjs --input audit.json --output review-dir
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const HOST='static.tildacdn.com';
const MAX_SIZE=16*1024*1024;
const GROUPS=['home','kvadro','parus','viking','kvadro-house'];
const hash=(data)=>createHash('sha256').update(data).digest('hex');
const safe=(t)=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function buildReviewQueue(report){
  if(!report||!Array.isArray(report.records))throw new Error('INVALID_AUDIT');
  const assets=new Map();
  for(const page of report.records){
    if(!GROUPS.includes(page.id)||!Array.isArray(page.candidates))continue;
    for(const candidate of page.candidates){
      let url;
      try {url=new URL(candidate.sourceUrl);}
      catch {continue;}
      if(url.protocol!=='https:'||url.hostname!==HOST||url.username||url.password)continue;
      if(/\/-\/(?:resizeb?|cover|crop|fit)\//i.test(url.pathname))continue;
      if(url.pathname.toLowerCase()==='/img/tildacopy_black.png')continue;
      const ext=url.pathname.toLowerCase().match(/\.(?:webp|png|jpe?g|avif|gif)$/)?.[0];
      if(!ext)continue;
      if(!assets.has(url.href))assets.set(url.href,new Set());
      assets.get(url.href).add(page.id);
    }
  }
  const review=[];
  for(const [url,pages] of assets){
    // Shared site assets may be stock or decorative, not model photos.
    if(pages.size!==1)continue;
    const id='GBV5-'+createHash('sha1').update(url).digest('hex').slice(0,9).toUpperCase();
    const name=new URL(url).pathname.split('/').at(-1);
    const ext=name.toLowerCase().match(/\.(?:webp|png|jpe?g|avif|gif)$/)[0];
    review.push({id,url,sourcePage:[...pages][0],filename:name,local:'photos/'+id+ext});
  }
  return review.sort((a,b)=>GROUPS.indexOf(a.sourcePage)-GROUPS.indexOf(b.sourcePage)||a.id.localeCompare(b.id));
}
function validImage(bytes,type){
  const b=Buffer.from(bytes);
  if(type==='image/png')return b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(type==='image/jpeg')return b.length>3&&b[0]===255&&b[1]===216&&b[2]===255;
  if(type==='image/webp')return b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
  if(type==='image/gif')return b.toString('ascii',0,4)==='GIF8';
  if(type==='image/avif')return b.toString('ascii',4,8)==='ftyp';
  return false;
}
function contactSheet(items){
  const markup=GROUPS.map(group=>{
    const cards=items.filter(x=>x.sourcePage===group).map(row=>{
      const photo=row.saved?'<a href="'+safe(row.local)+'" target="_blank"><img src="'+safe(row.local)+'" loading="lazy" alt="'+safe(row.id)+'"></a>':'<span>Не скачано: '+safe(row.error)+'</span>';
      return '<article><div class="pic">'+photo+'</div><div class="info"><b>'+safe(row.id)+'</b><small>'+safe(row.filename)+'</small><a href="'+safe(row.url)+'" target="_blank" rel="noreferrer">Tilda оригинал</a></div></article>';
    }).join('');
    return '<section><h2>'+safe(group)+'</h2><div class="grid">'+cards+'</div></section>';
  }).join('');
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Гарант Бани V5 фото</title><style>'+
    '*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui;background:#1a2a20;color:#ecf1e6}header{padding:30px 5vw;background:#29422f}header p{max-width:760px}main{max-width:1400px;margin:auto;padding:24px}section{margin:24px 0}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}article{background:#f8f6ef;color:#26352b;border-radius:12px;overflow:hidden}.pic{height:230px;display:grid;place-items:center;background:#dfe7d8}.pic a,.pic img{height:100%;width:100%;object-fit:contain}.info{padding:12px;display:grid;gap:5px}.info small{word-break:break-all}a{color:#277044}' +
    '</style></head><body><header><h1>Гарант Бани — фотобанк V5</h1><p>Скачано только для внутреннего ознакомления. Модель, права и разрешение на публикацию НЕ подтверждены. Для отбора называйте ID GBV5-…</p></header><main>'+markup+'</main></body></html>';
}
export async function exportReview(report,dir,fetchImpl=fetch){
  const queue=buildReviewQueue(report);
  await mkdir(join(dir,'photos'),{recursive:true});
  const output=[];
  for(const item of queue){
    const record={...item,saved:false,rights:'UNVERIFIED',model:'UNVERIFIED',publishable:false};
    try{
      const response=await fetchImpl(item.url,{redirect:'error',signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error('HTTP_'+response.status);
      const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
      if(Number(response.headers.get('content-length')||0)>MAX_SIZE)throw new Error('TOO_LARGE');
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length>MAX_SIZE||!validImage(bytes,mime))throw new Error('INVALID_OR_OVERSIZE_IMAGE');
      await writeFile(join(dir,item.local),bytes,{flag:'w'});
      record.saved=true;record.bytes=bytes.length;record.sha256=hash(bytes);
    }catch(error){
      const reason=String(error?.message||error);
      const causeCode=String(error?.cause?.code||'');
      const causeMessage=String(error?.cause?.message||'');
      record.error=[reason,causeCode,causeMessage].filter(Boolean).join(' | ').slice(0,280);
    }
    output.push(record);
    console.log((record.saved?'SAVED ':'SKIPPED ')+record.id+' '+record.sourcePage+' '+(record.error||record.bytes));
  }
  const manifest={status:'INTERNAL_REVIEW_ONLY_NOT_PUBLISHABLE',generatedAt:new Date().toISOString(),
    sourceCheckedAt:report.checkedAt||null,total:queue.length,
    saved:output.filter(x=>x.saved).length,failed:output.filter(x=>!x.saved).length,items:output};
  await writeFile(join(dir,'review.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
  await writeFile(join(dir,'index.html'),contactSheet(output),'utf8');
  return manifest;
}
async function main(args){
  if(args.length!==4||args[0]!=='--input'||args[2]!=='--output')throw new Error('USAGE: --input file.json --output directory');
  const output=resolve(args[3]);
  const report=JSON.parse(await readFile(resolve(args[1]),'utf8'));
  const result=await exportReview(report,output);
  console.log('REVIEW_DIR='+output);
  console.log('REVIEW_SAVED='+result.saved);
  console.log('REVIEW_FAILED='+result.failed);
  console.log('PUBLICATION_APPROVED=NO');
  if(!result.saved)process.exitCode=1;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  main(process.argv.slice(2)).catch(error=>{
    console.error('REVIEW_EXPORT_FAILED='+String(error.message||error));process.exitCode=1;
  });
}

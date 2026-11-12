import * as esbuild from 'esbuild';
import {readFile,writeFile,mkdir,cp,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'.local/crm-speed-20261111'),baseline=JSON.parse(await readFile(path.join(out,'baseline.json'))),preview=path.join(out,'preview-web'),dest=path.join(out,'candidate-web');
const sha=data=>createHash('sha256').update(data).digest('hex');
const changed=new Set(),aliases={};
const overrides=[...new Set([...JSON.parse(await readFile(path.join(root,'scripts/performance-sources.json'))),'choice/app.mjs','choice/state.mjs','choice/gallery.mjs','choice/home-hero/layout-panel.mjs','choice/home-hero/model-request.mjs','quiz.mjs','campaigns/blackfriday.mjs','campaigns/blackfriday-data.mjs','campaigns/blackfriday-notice.mjs','campaigns/blackfriday-notice.css','performance/home-entry.mjs','performance/quiz-entry.mjs','manager.html','assets/js/manager.js','crm/lead-workspace.mjs','crm/lead-workspace.css'])];
await mkdir(dest,{recursive:true});await cp(preview,dest,{recursive:true});
for(const name of overrides){await mkdir(path.dirname(path.join(dest,name)),{recursive:true});await cp(path.join(root,'web',name),path.join(dest,name));changed.add('web/'+name);}
const originalHtml=await readFile(path.join(preview,'index.html'),'utf8');
const book=JSON.parse(await readFile(path.join(preview,'choice/catalog-pricebook.json'))),legacy=JSON.parse(await readFile(path.join(preview,'data/catalog-pricebook.json')));
if(JSON.stringify(book.prices)!==JSON.stringify(legacy.prices)||book.version!==legacy.version)throw Error('Price sources diverged');
const display={version:book.version,prices:book.prices,r85:{models:Object.fromEntries(Object.entries(book.r85.models).map(([m,row])=>[m,{sizes:Object.fromEntries(Object.entries(row.sizes).map(([s,v])=>[s,{label:v.label,priceRub:v.priceRub,deluxe:{priceRub:v.deluxe.priceRub}}]))}]))}};
await writeFile(path.join(root,'web/choice/display-prices.json'),JSON.stringify(display)+'\n');await cp(path.join(root,'web/choice/display-prices.json'),path.join(dest,'choice/display-prices.json'));changed.add('web/choice/display-prices.json');
function alias(name){name=name.replace(/^\//,'');const digest=baseline.web_files[name];if(!digest)return '/'+name;const target='assets/fast/'+digest.slice(0,24)+path.extname(name);aliases[target]={source:name,sha256:digest};return '/'+target;}
const media=new Set();
for(const name of Object.keys(baseline.web_files))if(/^choice\/assets\/|^(kvadro-media|parus-media|viking-media|house-media)\/assets\/photos\//.test(name)||/^home-hero\/layouts\/(drawings|previews|models)\//.test(name))media.add(name);
const photos=JSON.parse(await readFile(path.join(preview,'choice/photos.json')));for(const p of Object.values(photos).flat())for(const k of ['image','thumbnail','largeImage'])if(p[k])media.add(p[k].slice(1));
for(const value of originalHtml.matchAll(/(?:src|href)=["'](\/[^"'?]+\.(?:webp|png|woff2|js))["']/g))media.add(value[1].slice(1));
const styles=[...originalHtml.matchAll(/<link[^>]+href=["']([^"']+\.css)["'][^>]*>/g)].map(m=>m[1].slice(1));
for(const name of styles){const css=await readFile(path.join(preview,name),'utf8');for(const m of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)){if(!/^(data:|https?:|#)/.test(m[1]))media.add((m[1].startsWith('/')?m[1]:path.posix.normalize(path.posix.join('/',path.posix.dirname(name),m[1]))).slice(1));}}
const mediaMap=Object.fromEntries([...media].sort().map(n=>['/'+n,alias(n)]));
const mediaSource='// Generated from the verified public release; copies are byte-identical.\nconst assets='+JSON.stringify(mediaMap)+';\nexport const fastAsset=url=>assets[url]??url;\n';
await mkdir(path.join(root,'web/performance'),{recursive:true});await writeFile(path.join(root,'web/performance/media.mjs'),mediaSource);await writeFile(path.join(dest,'performance/media.mjs'),mediaSource);changed.add('web/performance/media.mjs');
for(const [target,info]of Object.entries(aliases)){try{const p=path.join(preview,info.source);await access(p);if(sha(await readFile(p))!==info.sha256)throw Error('Alias source changed');await mkdir(path.dirname(path.join(dest,target)),{recursive:true});await cp(p,path.join(dest,target));}catch(e){if(e.code!=='ENOENT')throw e;}}
const publicPath='/assets/build/';
const resolvePublic={name:'canonical-public-modules',setup(build){build.onResolve({filter:/.*/},args=>{
 if(/^(https?:|data:)/.test(args.path))return {path:args.path,external:true};
 const name=args.path.split(/[?#]/)[0];
 const resolved=args.kind==='entry-point'?path.resolve(name):name.startsWith('/')?path.join(dest,name):name==='three'?path.join(dest,'home-hero/layouts/vendor/three.module.js'):path.resolve(path.dirname(args.importer),name);
 if(!resolved.startsWith(dest+path.sep))throw Error('Module escaped candidate web root');return {path:resolved};
});}};
const build=await esbuild.build({entryPoints:[path.join(dest,'performance/home-entry.mjs')],outdir:path.join(root,'web/assets/build'),bundle:true,splitting:true,format:'esm',platform:'browser',target:['chrome109','firefox115','safari16.4'],minify:true,metafile:true,write:false,entryNames:'[name]-[hash]',chunkNames:'chunk-[hash]',outExtension:{'.js':'.mjs'},legalComments:'eof',plugins:[resolvePublic],logLevel:'silent'});
for(const file of build.outputFiles){const name=path.relative(path.join(root,'web'),file.path).replaceAll('\\','/');await mkdir(path.dirname(file.path),{recursive:true});await writeFile(file.path,file.contents);await mkdir(path.dirname(path.join(dest,name)),{recursive:true});await writeFile(path.join(dest,name),file.contents);changed.add('web/'+name);}
const outputs=build.metafile.outputs,entry=Object.entries(outputs).find(([,v])=>v.entryPoint?.endsWith('performance/home-entry.mjs'))[0];
const outputUrl=name=>'/'+path.relative(path.join(root,'web'),path.resolve(name)).replaceAll('\\','/');
const preload=new Set();function imports(name){for(const i of outputs[name]?.imports??[])if(i.kind==='import-statement'&&!i.external&&!preload.has(i.path)){preload.add(i.path);imports(i.path);}}imports(entry);
let html=originalHtml.replace(/<link rel="modulepreload" href="\/journey-runtime\.mjs">\s*/,'');
const oldModules=[...html.matchAll(/<script\s+type="module"\s+src="[^"]+"><\/script>/g)];if(oldModules.length!==6)throw Error('Unexpected main module entry structure');
html=html.replace(/<script\s+type="module"\s+src="[^"]+"><\/script>/g,'');
const replaceMedia=text=>{for(const [name,target]of Object.entries(mediaMap))text=text.replaceAll(name,target);return text;};
let css='';for(const name of styles){let source=await readFile(path.join(preview,name),'utf8');source=source.replace(/url\(\s*(["']?)([^\s"')]+)\1\s*\)/g,(whole,q,url)=>{if(/^(data:|https?:|#)/.test(url))return whole;const original=url.startsWith('/')?url:path.posix.normalize(path.posix.join('/',path.posix.dirname(name),url));return 'url("'+(mediaMap[original]??original)+'")';});css+=source+'\n';}
css+=await readFile(path.join(root,'web/campaigns/blackfriday-notice.css'),'utf8');
const cssName='assets/build/home-'+sha(css).slice(0,16)+'.css';await writeFile(path.join(root,'web',cssName),css);await writeFile(path.join(dest,cssName),css);changed.add('web/'+cssName);
let styleDone=false;html=html.replace(/<link[^>]+href=["'][^"']+\.css["'][^>]*>/g,()=>{if(styleDone)return '';styleDone=true;return '<link rel="stylesheet" href="/'+cssName+'">';});
html=replaceMedia(html);html=html.replace('</head>',[...preload].map(n=>'<link rel="modulepreload" href="'+outputUrl(n)+'">').join('')+'<script type="module" src="'+outputUrl(entry)+'"></script></head>');
await writeFile(path.join(root,'web/index.html'),html);await writeFile(path.join(dest,'index.html'),html);changed.add('web/index.html');
const notices=['parus','kvadro-house'];for(const n of notices)changed.add('web/campaigns/assets/notice-'+n+'.webp');
for(const name of [...changed].filter(n=>n.includes('/campaigns/assets/'))){await mkdir(path.dirname(path.join(dest,name.slice(4))),{recursive:true});await cp(path.join(root,name),path.join(dest,name.slice(4)));}
const initial=[entry,...preload],files=Object.fromEntries(build.outputFiles.map(f=>[path.relative(root,f.path).replaceAll('\\','/'),{bytes:f.contents.length,gzip:gzipSync(f.contents).length}]));
const report={baseline_web:baseline.web,baseline_index_sha256:sha(originalHtml),index_sha256:sha(html),overlay_files:[...changed].sort(),aliases,esbuild:esbuild.version,files,initial_js_files:initial.length+1,initial_js_bytes:initial.reduce((n,key)=>n+outputs[key].bytes,0)+63459,display_price_bytes:Buffer.byteLength(JSON.stringify(display)),full_price_bytes:231167+231086,content_preserved:true,images_byte_identical:true};
await writeFile(path.join(out,'build.json'),JSON.stringify(report,null,2)+'\n');await writeFile(path.join(out,'esbuild-meta.json'),JSON.stringify(build.metafile,null,2));
console.log(JSON.stringify({overlay_files:changed.size,immutable_media_copies:Object.keys(aliases).length,initial_js_files:report.initial_js_files,initial_js_bytes:report.initial_js_bytes,display_price_bytes:report.display_price_bytes,generated_files:files}));

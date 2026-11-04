// Local preview: read-only upstream, analytics off, no real form submission.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const bundled=await fs.stat(path.join(here,'site')).then(x=>x.isDirectory()).catch(()=>false);
const out=bundled?path.join(here,'site'):path.join(root,'output/bath-choice-prototype');
const cache=bundled?path.join(here,'cache'):path.join(root,'.local/bath-choice-cache');
const port=Number(process.env.BATH_CHOICE_PREVIEW_PORT||4192),origin='https://xn--80aaan1dh9b.xn--p1ai',local='http://127.0.0.1:'+port;
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml','.glb':'model/gltf-binary'};
async function upstream(pathname){const file=path.resolve(cache,'.'+pathname);if(!file.startsWith(cache+path.sep))throw Error('PATH');try{return await fs.readFile(file);}catch{}const r=await fetch(origin+pathname,{signal:AbortSignal.timeout(20000),redirect:'error'});if(!r.ok)throw Error('UPSTREAM');const bytes=Buffer.from(await r.arrayBuffer());await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);return bytes;}
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,local),pathname=decodeURIComponent(url.pathname);
  if(!['GET','HEAD'].includes(req.method)||pathname.startsWith('/api/')){res.writeHead(405,{'Content-Type':'application/json'});res.end('{"ok":false,"localPreview":true}');return;}
  if(pathname==='/data/site-settings.json'){
   const settings=JSON.parse((await upstream(pathname)).toString());settings.productionOrigin=local;settings.origin=local;settings.lead.allowedOrigins=[local];settings.analytics.enabled=false;
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(settings));return;
  }
  const relative=pathname==='/'?'index.html':pathname.slice(1);const file=path.resolve(out,relative);if(!file.startsWith(out+path.sep))throw Error('PATH');
  let bytes;try{bytes=await fs.readFile(file);}catch{bytes=await upstream(pathname);}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404,{'Content-Type':'application/json'});res.end('{"ok":false,"localPreview":true}');}
}).listen(port,'127.0.0.1',()=>console.log(local+'/ — prototype, analytics disabled, POST blocked'));

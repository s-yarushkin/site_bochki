// Local-only preview of the real home + proposed hero. Read-only upstream static assets.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const bundled=await fs.access(path.join(here,'site/index.html')).then(()=>true,()=>false);
const root=bundled?here:path.resolve(here,'../..');
const out=bundled?path.join(here,'site'):path.join(root,'output/home-hero-site');
const cache=path.join(root,'.local/home-hero-http-cache');
const port=Number(process.env.HOME_HERO_PREVIEW_PORT||4188);
const origin='https://xn--80aaan1dh9b.xn--p1ai',local='http://127.0.0.1:'+port;
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'};
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function upstream(pathname){
  const key=path.resolve(cache,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
  if(!key.startsWith(cache+path.sep))throw Error('PATH');
  try{return await fs.readFile(key);}catch{}
  const response=await fetch(origin+pathname,{signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!response.ok)throw Error('UPSTREAM '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(key),{recursive:true});await fs.writeFile(key,bytes);return bytes;
}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,local),pathname=decodeURIComponent(url.pathname);
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{ok:false,localPreview:true,realNotifications:0});
  if(pathname.startsWith('/api/'))return json(res,403,{ok:false,localPreview:true,realNotifications:0});
  if(pathname==='/data/site-settings.json'){
   const settings=JSON.parse((await upstream(pathname)).toString());
   settings.productionOrigin=local;settings.origin=local;settings.lead.allowedOrigins=[local];settings.analytics.enabled=false;
   return json(res,200,settings);
  }
  let bytes,filename;
  if(pathname==='/'){bytes=await fs.readFile(path.join(out,'index.html'));filename='index.html';}
  else if(pathname==='/planirovki/'){bytes=await fs.readFile(path.join(out,'planirovki/index.html'));filename='index.html';}
  else if(pathname.startsWith('/home-hero/')){
   filename=path.resolve(out,'.'+pathname);if(!filename.startsWith(out+path.sep))throw Error('PATH');bytes=await fs.readFile(filename);
  }else{
   filename=pathname.endsWith('/')?pathname+'index.html':pathname;
   bytes=await upstream(pathname);
  }
  res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(req.method==='HEAD'?undefined:bytes);
 }catch(error){json(res,404,{ok:false,error:'Local preview resource unavailable'});}
});
server.listen(port,'127.0.0.1',()=>console.log(local+'/ — current home + proposed hero; analytics disabled, no POST forwarding'));

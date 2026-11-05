// Explicit local-only integration fixture. In-memory SQLite, stub delivery, no upstream fetch.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadTestAPI} from '../../scripts/test-api.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),origin='http://127.0.0.1:4194';
const {createRelayHandler,openLeadStore}=await loadTestAPI();
const store=openLeadStore(':memory:'),deliveries=[];
const api=createRelayHandler({config:{allowedOrigin:origin,siteBasePath:'/'},store,log:()=>{},deliver:async lead=>{
 deliveries.push({flow:lead.flow,purpose:lead.purpose,channel:lead.contactChannel,comment:lead.comment});
 await fs.writeFile(path.join(root,process.env.BATH_CHOICE_TEST_REPORT||'output/bath-choice-deploy/virtual-leads.json'),JSON.stringify({virtual:true,realMessagesSent:false,deliveries},null,2));
}});
const book=JSON.parse(await fs.readFile(path.join(root,'output/bath-choice-deploy/baseline/catalog-pricebook.json')));
const settings={origin,productionOrigin:origin,lead:{enabled:true,endpoint:'/api/lead',allowedOrigins:[origin],requiredPricebookVersion:book.version},analytics:{enabled:false}};
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.glb':'model/gltf-binary','.ico':'image/x-icon'};
const sources=[process.env.BATH_CHOICE_TEST_PACKAGE||'output/bath-choice-deploy/package/site','output/bath-choice-prototype','.local/bath-choice-cache','web'];
http.createServer(async(req,res)=>{
 try{
  if(req.url==='/api/lead')return api(req,res);
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  const url=new URL(req.url,origin),relative=decodeURIComponent(url.pathname)==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);
  if(relative==='data/site-settings.json'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(settings));}
  if(relative==='data/catalog-pricebook.json'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(book));}
  let bytes;
  for(const source of sources){const base=path.join(root,source),file=path.resolve(base,relative);if(!file.startsWith(base+path.sep))throw Error('PATH');try{bytes=await fs.readFile(file);break;}catch{}}
  if(!bytes){res.writeHead(404);return res.end();}
  res.writeHead(200,{'Content-Type':types[path.extname(relative)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(500);res.end();}
}).listen(4194,'127.0.0.1',()=>console.log(origin+' — virtual integration only; no real delivery; memory database'));

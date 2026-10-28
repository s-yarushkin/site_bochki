import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {loadTestAPI,root} from './test-api.mjs';
const {createRelayHandler,openLeadStore,formatBaniLead}=await loadTestAPI();
const port=Number(process.env.DP_TEST_PORT||4173),origin='http://127.0.0.1:'+port,web=resolve(root,process.env.DP_WEB_ROOT||'web');
if(!web.startsWith(root))throw Error('Test web root must stay inside the project.');
const store=openLeadStore(':memory:'),deliveries=[];
const handler=createRelayHandler({config:{allowedOrigin:origin,siteBasePath:'/'},store,deliver:async(lead,config,fetch,meta)=>{deliveries.push({id:meta.id,text:formatBaniLead(lead,meta)});},log:line=>console.log(line)});
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/api/lead'||url.pathname==='/health')return handler(req,res);
  if(url.pathname==='/_test/receipts'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({deliveries,leads:store.list().leads}));return;}
  if(url.pathname==='/data/site-settings.json'){const s=JSON.parse(await readFile(resolve(web,'data/site-settings.json'),'utf8'));s.analytics.enabled=false;s.productionOrigin=origin;s.lead.allowedOrigins=[origin];res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(s));return;}
  if(url.pathname==='/index.html'){res.writeHead(308,{Location:'/'+url.search});res.end();return;}
  let path=resolve(web,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(web+sep)&&path!==web)throw Error('FORBIDDEN');
  let code=200;try{if((await stat(path)).isDirectory()){if(!url.pathname.endsWith('/')){res.writeHead(308,{Location:url.pathname+'/'+url.search});res.end();return;}path=resolve(path,'index.html')}}catch{path=resolve(web,'404.html');code=404}
  const data=await readFile(path);res.writeHead(code,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);
 }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log('LOCAL TEST ONLY '+origin+' — in-memory database and delivery stub; no messenger credentials loaded.'));

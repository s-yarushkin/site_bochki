// Local QA only: public client modules and in-memory receipts. No MAX credentials.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildCallback} from '../../web/lead-client.mjs';
import {CONSENT_METHOD,CONSENT_VERSION} from '../../web/lead-consent.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const publicRoot=path.join(root,'web');
const output=path.join(root,'output/new-year-2027-site');
const host='127.0.0.1',port=4187,origin=`http://${host}:${port}`;
const receipts=new Map();
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'};
const json=(res,code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const inside=(base,target)=>target.startsWith(base+path.sep);
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,origin).pathname);
    if(pathname==='/'){res.writeHead(302,{Location:'/novyy-god/'});res.end();return;}
    if(pathname==='/data/site-settings.json'){
      const settings=JSON.parse(await fs.readFile(path.join(publicRoot,'data/site-settings.json'),'utf8'));
      settings.productionOrigin=origin;settings.lead.allowedOrigins=[origin];settings.analytics.enabled=false;
      return json(res,200,settings);
    }
    if(pathname==='/_test/receipts')return json(res,200,{testLeads:receipts.size,realNotifications:0,last:[...receipts.values()].at(-1)});
    if(pathname==='/api/lead'){
      if(req.method!=='POST')return json(res,405,{ok:false});
      let body='';for await(const part of req){body+=part;if(body.length>8192)return json(res,413,{ok:false});}
      const payload=JSON.parse(body);
      buildCallback(payload,payload.requestId);
      if(!['callback','quote'].includes(payload.flow)||payload.consent!==true||payload.contactChannel!=='phone'||payload.consentVersion!==CONSENT_VERSION||payload.consentMethod!==CONSENT_METHOD)return json(res,400,{ok:false});
      const duplicate=receipts.has(payload.requestId);
      receipts.set(payload.requestId,{requestId:payload.requestId,flow:payload.flow,pagePath:payload.journeyContext?.pagePath,purpose:payload.journeyContext?.purpose,hasHolidayContext:/Новый год 2027/.test(payload.comment),model:payload.configuration?.modelId,size:payload.configuration?.sizeId});
      return json(res,200,{ok:true,delivered:true,duplicate,analytics:{persisted:true},localTest:true});
    }
    let base,relative;
    if(pathname.startsWith('/novyy-god/')){base=output;relative=pathname.slice(1);}
    else if(pathname==='/r101/mobile-dialog.mjs'){base=path.join(root,'r101');relative='mobile-dialog.mjs';}
    else {base=publicRoot;relative=pathname.replace(/^\/web\//,'').replace(/^\//,'');}
    let file=path.resolve(base,relative);
    if(!inside(base,file))return json(res,403,{ok:false});
    if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');
    const data=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);
  }catch{json(res,404,{ok:false});}
});
server.listen(port,host,()=>console.log(`LOCAL QA ${origin}/novyy-god/ — in-memory test receipts; no real MAX notifications.`));

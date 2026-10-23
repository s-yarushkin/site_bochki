// R8.0 exact server-stage UI acceptance. No POST, production remains unchanged.
// Node.js 22+, Chrome/Edge. Serve only nine staged files; GET-only fallback to public live site.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const staged = path.resolve(process.argv[2] || '');
const BASE = 'https://xn--80aaan1dh9b.xn--p1ai';
const EXPECTED = [
  'index.html','bani/kvadro/index.html','bani/viking/index.html',
  'bani/parus/index.html','bani/kvadro-haus/index.html','sitemap.xml',
  'raboty/index.html','cjm-r80.css','cjm-r80-model.mjs'];
if (!process.versions.node || +process.versions.node.split('.')[0] < 22) throw Error('NODE_22_REQUIRED');
for (const f of EXPECTED) if(!fs.existsSync(path.join(staged,f)))throw Error('MISSING_STAGED_FILE_'+f);
const findings=[],failures=[],blocked=[],uncaught=[],resourceFailures=[];
let server, chrome, socket, tmp;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const exists=(p)=>{try{return fs.statSync(p).isFile()}catch{return false}};
function result(id,ok,detail){const msg=`R80_BROWSER_${ok?'PASS':'FAIL'}=${id}`+(detail===undefined?'':'; '+(typeof detail==='string'?detail:JSON.stringify(detail)).slice(0,650));console.log(msg);(ok?findings:failures).push(id);}
function executable(){
  if(process.env.DACHA_PAR_BROWSER&&exists(process.env.DACHA_PAR_BROWSER))return process.env.DACHA_PAR_BROWSER;
  const roots=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean);
  const options=process.platform==='win32'?roots.flatMap(p=>['Google/Chrome/Application/chrome.exe','Microsoft/Edge/Application/msedge.exe','Chromium/Application/chrome.exe'].map(q=>path.join(p,...q.split('/')))):['/usr/bin/chromium','/usr/bin/google-chrome','/usr/bin/chromium-browser'];
  return options.find(exists);
}
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.json':'application/json; charset=utf-8','.xml':'application/xml; charset=utf-8'};
async function handler(req,res){
  if(!['GET','HEAD'].includes(req.method)){blocked.push(`${req.method} ${req.url}`);res.writeHead(405);res.end('QA_READ_ONLY_NO_WRITES');return;}
  try{
    const u=new URL(req.url,'http://127.0.0.1');const p=decodeURIComponent(u.pathname);
    if(p.includes('\\')||p.split('/').includes('..')){res.writeHead(403);res.end();return;}
    const relative=p==='/'?'index.html':p.endsWith('/')?p.slice(1)+'index.html':p.slice(1);
    const f=path.resolve(staged,relative);
    if(f.startsWith(staged+path.sep)&&exists(f)){
      res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});
      if(req.method==='HEAD'){res.end();return;}fs.createReadStream(f).pipe(res);return;
    }
    // Explicitly allow public GET/HEAD only, never send cookies or credentials upstream.
    const uri=new URL(u.pathname+u.search,BASE);
    const reply=await fetch(uri,{method:req.method,redirect:'follow',headers:{'User-Agent':'DachaPar-R80-readonly-stage-browser/1.0','Accept-Encoding':'identity'},signal:AbortSignal.timeout(22000)});
    if(new URL(reply.url).origin!==BASE){res.writeHead(502);res.end('OFF_ORIGIN_REDIRECT_BLOCKED');return;}
    if(reply.status>=400&&(/^(\/cjm-r80|\/qh-media|\/parus-media|\/app\.mjs|\/assets)/.test(u.pathname)))resourceFailures.push({path:u.pathname,status:reply.status});
    res.writeHead(reply.status,{'Content-Type':reply.headers.get('content-type')||'application/octet-stream','Cache-Control':'no-store'});
    req.method==='HEAD'?res.end():res.end(Buffer.from(await reply.arrayBuffer()));
  }catch(e){if(!res.headersSent)res.writeHead(502);res.end('READ_ONLY_UPSTREAM_ERROR '+e.message.slice(0,140));}
}
class CDP {
  constructor(ws){this.ws=ws;this.seq=0;this.pending=new Map();this.handlers=[];ws.addEventListener('message',e=>{let p;try{p=JSON.parse(e.data.toString())}catch{return}if(p.id){let x=this.pending.get(p.id);if(x){this.pending.delete(p.id);p.error?x.reject(Error(p.error.message)):x.resolve(p.result)}}else this.handlers.forEach(f=>f(p))});}
  send(method,params={}){return new Promise((resolve,reject)=>{const id=++this.seq;this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}));const t=setTimeout(()=>{if(this.pending.has(id)){this.pending.delete(id);reject(Error('CDP_TIMEOUT '+method))}},24000);t.unref()});}
  async eval(s){const ret=await this.send('Runtime.evaluate',{expression:s,awaitPromise:true,returnByValue:true,timeout:22000});if(ret.exceptionDetails)throw Error('PAGE_EVAL '+ret.exceptionDetails.text);return ret.result.value;}
  on(fn){this.handlers.push(fn)}
}
async function until(c,expr,max=15000){const start=Date.now();let last='';while(Date.now()-start<max){try{let x=await c.eval(expr);if(x)return x;last=JSON.stringify(x)}catch(e){last=e.message}await sleep(200)}throw Error('WAIT_'+expr.slice(0,110)+' last='+last);}
async function navigate(c,uri){await c.send('Page.navigate',{url:uri});await until(c,'document.readyState === "complete"',25000);}
async function inspect(c,id,predicate,code){try{const value=await c.eval(code);result(id,Boolean(predicate(value)),value);return value;}catch(e){result(id,false,e.message);return {};}}
async function checkWidth(c,port,w){
  const prefix=`${w}_`;
  await c.send('Emulation.setDeviceMetricsOverride',{width:w,height:960,deviceScaleFactor:1,mobile:w<600});
  const host=`http://127.0.0.1:${port}`;
  await navigate(c,host+'/');
  await until(c,'!!document.querySelector("#config-app") && !!document.querySelector("#quote-total")',16000);
  await inspect(c,prefix+'HOME_ORDER_AND_COMMERCE',x=>x.form&&x.order&&x.noHeavy&&x.models===4&&x.navReal&&x.css,`(()=>{
    const ids=['hero','models','packages','included','configure','real-bani'];
    const loc=ids.map(x=>document.getElementById(x)?.getBoundingClientRect().top + window.scrollY);
    return {order:loc.every((n,i)=>Number.isFinite(n)&&(i===0||n>loc[i-1])),form:!!document.querySelector('#relay-lead-form')&&!!document.querySelector('#quote-total'),models:document.querySelectorAll('[data-model-card]').length,
    noHeavy:['parus-photos','parus-layouts','qh-photos','qh-layouts'].every(x=>!document.getElementById(x)),navReal:!!document.querySelector('a[href="/raboty/"]'),css:[...document.styleSheets].some(s=>s.href?.includes('cjm-r80.css'))};})()`);
  await until(c,`!!document.querySelector('#config-app') && document.querySelector('#load-error')?.hidden !== false`,14000);
  await inspect(c,prefix+'REAL_CALCULATOR',x=>x.ready&&x.price&&x.select&&x.extras&&x.submit,`(()=>({ready:!!document.querySelector('#config-app')&&!document.querySelector('#config-app').hidden,price:/\\d/.test(document.querySelector('#quote-total')?.textContent||''),select:document.querySelectorAll('#model-switch button').length===4,extras:!!document.querySelector('#extras-details'),submit:!!document.querySelector('[data-flow="quote"]')}))()`);
  await inspect(c,prefix+'MODEL_SWITCH_RECALCULATES',x=>x.name&&x.price,`(()=>{const b=document.querySelector('#model-switch [data-control-key="model-parus"]');b?.click();return {name:(document.querySelector('#config-name')?.textContent||'').includes('Парус'),price:/\\d/.test(document.querySelector('#quote-total')?.textContent||'')}})()`);
  await inspect(c,prefix+'HOME_NO_HORIZONTAL_OVERFLOW',x=>x.width<=x.viewport+3,`({width:document.documentElement.scrollWidth,viewport:innerWidth})`);
  await navigate(c,host+'/raboty/');
  await inspect(c,prefix+'WORKS_NINE_OBJECTS',x=>x.all===9&&x.modelTypes===2&&x.unique===9,`(()=>{let cards=[...document.querySelectorAll('.cjm-work-hub [data-work-model]')];return {all:cards.length,modelTypes:new Set(cards.map(b=>b.dataset.workModel)).size,unique:new Set(cards.map(b=>b.href)).size}})()`);
  await inspect(c,prefix+'WORKS_MODEL_FILTER',x=>x.pp===4&&x.qh===5&&x.reset===9,`(()=>{const visible=()=>[...document.querySelectorAll('.cjm-work-hub [data-work-model]')].filter(x=>!x.hidden).length;document.querySelector('[data-work-filter="parus"]')?.click();const pp=visible();document.querySelector('[data-work-filter="kvadro-haus"]')?.click();const qh=visible();document.querySelector('[data-work-filter="all"]')?.click();return {pp,qh,reset:visible()}})()`);
  for(const [kind,expectedPhotos,expectedPlans] of [['parus',4,5],['kvadro-haus',5,4]]){
    await navigate(c,host+'/bani/'+kind+'/');
    await until(c,'!!document.querySelector("#photos")&&!!document.querySelector("#plans")',18000);
    await inspect(c,`${prefix}${kind.toUpperCase()}_MODEL_PHOTOS_PLANS`,x=>x.photos&&x.plans&&x.count===expectedPhotos&&x.layout===expectedPlans&&x.calc&&x.price,`(()=>({photos:!!document.getElementById('photos'),plans:!!document.getElementById('plans'),count:new Set([...document.querySelectorAll(${JSON.stringify(kind==='parus'?'#photos [data-pp-object]':'#photos [data-qh-object]')} )].map(b=>b.getAttribute(${JSON.stringify(kind==='parus'?'data-pp-object':'data-qh-object')}))).size,layout:document.querySelectorAll(${JSON.stringify(kind==='parus'?'[data-pp-layout]':'[data-qh-layout]')}).length,calc:!!document.querySelector('a[href*="model="]'),price:!!document.querySelector('#r732-size-prices')}))()`);
    await inspect(c,`${prefix}${kind.toUpperCase()}_NO_HORIZONTAL_OVERFLOW`,x=>x.width<=x.viewport+3,`({width:document.documentElement.scrollWidth,viewport:innerWidth})`);
    await inspect(c,`${prefix}${kind.toUpperCase()}_GALLERY_OPENS`,x=>x.open&&x.naturalWidth>0&&x.width>Math.max(155,w*.28),`(async()=>{const kind=${JSON.stringify(kind)},attr=kind==='parus'?'data-pp-object':'data-qh-object',dlg=document.querySelector(kind==='parus'?'#pp-gallery':'#qh-gallery');const btn=document.querySelector('#photos ['+attr+']');btn?.click();const img=dlg?.querySelector(kind==='parus'?'#pp-gallery-image':'#qh-gallery-image');if(!img)return {error:'modal img not found'};await Promise.race([img.decode().catch(()=>{}),new Promise(r=>setTimeout(r,6500))]);return {open:dlg?.open,naturalWidth:img.naturalWidth,width:img.getBoundingClientRect().width}})()`);
    await c.eval(`document.querySelector(${JSON.stringify(kind==='parus'?'#pp-gallery':'#qh-gallery')})?.close()`);
    const layoutValues=await c.eval(`[...document.querySelectorAll(${JSON.stringify(kind==='parus'?'[data-pp-layout]':'[data-qh-layout]')})].map(b=>b.getAttribute(${JSON.stringify(kind==='parus'?'data-pp-layout':'data-qh-layout')}))`);
    for(const id of layoutValues){
      await inspect(c,`${prefix}${kind.toUpperCase()}_SVG_${id}`,x=>x.ok&&x.width>0&&x.selected,`(async()=>{const b=[...document.querySelectorAll(${JSON.stringify(kind==='parus'?'[data-pp-layout]':'[data-qh-layout]')})].find(x=>x.getAttribute(${JSON.stringify(kind==='parus'?'data-pp-layout':'data-qh-layout')})===${JSON.stringify(id)}),im=document.querySelector(${JSON.stringify(kind==='parus'?'#pp-plan-image':'#qh-plan-image')});if(!b||!im)return {error:'plan controls missing'};b.scrollIntoView({block:'center',behavior:'instant'});b.click();im.scrollIntoView({block:'center',behavior:'instant'});const loaded=await Promise.race([im.decode().then(()=>true).catch(()=>false),new Promise(r=>setTimeout(()=>r(false),6500))]);return {ok:loaded,width:im.naturalWidth,selected:b.getAttribute('aria-pressed')==='true',src:im.currentSrc}})()`);
    }
  }
  for(const slug of ['kvadro','viking']){
    await navigate(c,host+'/bani/'+slug+'/');
    await inspect(c,prefix+slug.toUpperCase()+'_EXISTING_MODEL_PRICE',x=>x.price&&x.link&&!x.hasOtherMedia,`({price:!!document.querySelector('#r732-size-prices'),link:!!document.querySelector('a[href*="model=${slug}"]'),hasOtherMedia:!!document.querySelector('#photos, #plans')})`);
  }
  await navigate(c,host+'/#parus-photos');
  await until(c,`location.pathname==='/bani/parus/'&&location.hash==='#photos'`,12000);
  await inspect(c,prefix+'LEGACY_PARUS_HASH',x=>x.path==='/bani/parus/'&&x.hash==='#photos',`({path:location.pathname,hash:location.hash})`);
  await navigate(c,host+'/#qh-layouts');
  await until(c,`location.pathname==='/bani/kvadro-haus/'&&location.hash==='#plans'`,12000);
  await inspect(c,prefix+'LEGACY_QH_HASH',x=>x.path==='/bani/kvadro-haus/'&&x.hash==='#plans',`({path:location.pathname,hash:location.hash})`);
  await navigate(c,host+'/?model=kvadro-house#builder');
  await inspect(c,prefix+'LEGACY_CONFIG_LINK',x=>x.hasConfig&&x.hash==='#builder'&&x.price&&x.model,`({hasConfig:!!document.querySelector('#configure'),hash:location.hash,price:/\\d/.test(document.querySelector('#quote-total')?.textContent||''),model:(document.querySelector('#config-name')?.textContent||'').includes('Квадро Хаус')})`);
}
async function main(){
  const exe=executable();if(!exe)throw Error('CHROME_OR_EDGE_NOT_FOUND');
  server=http.createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;
  tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dachapar-r80-browser-'));
  chrome=spawn(exe,[...(process.platform!=='win32'&&process.getuid?.()===0?['--no-sandbox','--disable-dev-shm-usage']:[]),'--headless=new','--no-first-run','--disable-gpu','--disable-extensions','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${tmp}`,'about:blank'],{stdio:'ignore'});
  let chromePort;
  for(let i=0;i<100;i++){let f=path.join(tmp,'DevToolsActivePort');if(exists(f)){chromePort=+fs.readFileSync(f,'utf8').split(/\r?\n/)[0];break;}await sleep(130)}
  if(!chromePort)throw Error('CDP_BROWSER_NOT_STARTED');
  const targets=await(await fetch(`http://127.0.0.1:${chromePort}/json/list`)).json();const tab=targets.find(x=>x.type==='page');if(!tab)throw Error('CDP_NO_PAGE');
  socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
  const c=new CDP(socket);c.on(ev=>{
    if(ev.method==='Runtime.exceptionThrown')uncaught.push(ev.params?.exceptionDetails?.exception?.description||ev.params?.exceptionDetails?.text||'uncaught');
    if(ev.method==='Fetch.requestPaused'){
      const p=ev.params;const allowed=/^http:\/\/127\.0\.0\.1:\d+\//.test(p.request.url)&&['GET','HEAD'].includes(p.request.method);
      if(!allowed)blocked.push(p.request.method+' '+p.request.url.slice(0,180));
      c.send(allowed?'Fetch.continueRequest':'Fetch.failRequest',allowed?{requestId:p.requestId}:{requestId:p.requestId,errorReason:'BlockedByClient'}).catch(()=>{});
    }
  });
  await c.send('Page.enable');await c.send('Runtime.enable');await c.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  for(const w of [390,768,1366,1920]){try{await checkWidth(c,port,w)}catch(e){result(`${w}_RUN`,false,e.message)}}
  result('NO_POST_OR_EXTERNAL_BROWSER_REQUESTS',blocked.length===0,blocked.slice(0,5));
  result('NO_UNCAUGHT_SITE_JS_ERRORS',uncaught.length===0,uncaught.slice(0,6));
  result('NO_REQUIRED_ASSET_404',resourceFailures.length===0,resourceFailures.slice(0,8));
  console.log(`R80_STAGE_BROWSER_ACCEPTANCE=${failures.length?'NO_GO':'PASS'}; PASSED=${findings.length}; FAILED=${failures.length}; READ_ONLY=YES; PRODUCTION_WRITES=0`);
  if(failures.length)process.exitCode=2;
}
try{await main()}catch(e){console.error('R80_STAGE_BROWSER_ACCEPTANCE=BLOCKED; ERROR='+String(e.stack||e).slice(0,2200));process.exitCode=2}
finally{try{socket?.close()}catch{}try{chrome?.kill()}catch{}try{server?.close()}catch{}if(tmp)try{fs.rmSync(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:300})}catch{}}

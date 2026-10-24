// R8.3 exact nonlive stage: browser tests against a loopback GET-only mirror.
// Three HTML files come from exact staged release, all other assets are GET-proxied
// from existing live Viking WEB. No production API POST and no server writes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
const [rootArg,auditArg,releaseArg] = process.argv.slice(2);
const root=path.resolve(rootArg||''), audit=JSON.parse(fs.readFileSync(auditArg,'utf8'));
const BASE_RELEASE='VIKING-BUILT-20261024-1792838766529643617';
const ORIGIN='https://xn--80aaan1dh9b.xn--p1ai';
const BASE=ORIGIN;
const files=['index.html','bani/index.html','bani/kvadro/index.html','bani/parus/index.html','bani/viking/index.html','bani/kvadro-haus/index.html','voprosy/index.html','journal/kak-chitat-komplektatsiyu-bani/index.html'];
const modelPaths=['/bani/kvadro/','/bani/parus/','/bani/viking/','/bani/kvadro-haus/'];
if(audit.stage!==releaseArg || audit.source!==`/srv/sites/dachapar-preview/releases/${BASE_RELEASE}`)throw Error('R83_QA_STALE_RELEASE');
if(!releaseArg.startsWith('/srv/sites/dachapar-preview/releases/CJM-R83-COPY-COMFORT-20261024-'))throw Error('R83_QA_WRONG_RELEASE_PREFIX');
for(const file of files){const current=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');if(current!==audit.after[file])throw Error('R83_STAGE_FILE_HASH_MISMATCH_'+file)}
const html=Object.fromEntries(files.map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
const results=[],exceptions=[],failedResources=[],outside=[],unexpectedPost=[],upstream=[],captured=[];
let httpServer,browser,cdp,socket,tmp,port;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const isFile=p=>{try{return fs.statSync(p).isFile()}catch{return false}};
function check(id,pass,detail=''){const status=pass?'PASS':'FAIL';results.push({id,status,detail});console.log(`R83_${status}=${id}`+(detail?'; '+JSON.stringify(detail).slice(0,370):''));}
function findBrowser(){if(process.env.DACHA_PAR_BROWSER&&isFile(process.env.DACHA_PAR_BROWSER))return process.env.DACHA_PAR_BROWSER;
 const roots=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean);
 const names=['Google/Chrome/Application/chrome.exe','Microsoft/Edge/Application/msedge.exe','Chromium/Application/chrome.exe'];
 return process.platform==='win32'?roots.flatMap(r=>names.map(n=>path.join(r,...n.split('/')))).find(isFile):['/usr/bin/chromium','/usr/bin/google-chrome','/usr/bin/chromium-browser'].find(isFile)}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json; charset=utf-8','.woff2':'font/woff2'};
async function serve(req,res){try{
 const incoming=new URL(req.url,'http://127.0.0.1');
 const pathName=decodeURIComponent(incoming.pathname);
 if(req.method!=='GET'&&req.method!=='HEAD'){
   unexpectedPost.push(req.method+' '+pathName);
   res.writeHead(405);res.end('R83_READ_ONLY');return;
 }
 if(pathName.includes('\\')||pathName.split('/').includes('..')){res.writeHead(403);res.end();return;}
 const file=pathName==='/'?'index.html':pathName.endsWith('/')?pathName.substring(1)+'index.html':pathName.substring(1);
 if(files.includes(file)){
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
   if(req.method==='HEAD'){res.end();return;}res.end(fs.readFileSync(path.join(root,file)));return;
 }
 if(file.startsWith('api/')||pathName.startsWith('/manager')){res.writeHead(403);res.end('BLOCKED_SENSITIVE_PATH');return;}
 // Live gets serve unmodified assets or model destination HTML to the loopback mirror.
 const remote=new URL(incoming.pathname+incoming.search,BASE);
 const upstreamResponse=await fetch(remote,{method:req.method,redirect:'manual',headers:{'Accept-Encoding':'identity','User-Agent':'DachaPar-R83-Nonlive-CJM-QA-GET'},signal:AbortSignal.timeout(25000)});
 if(upstreamResponse.status>=300&&upstreamResponse.status<400){upstream.push({path:pathName,status:upstreamResponse.status,reason:'REDIRECT_BLOCKED'});res.writeHead(502);res.end();return;}
 if(upstreamResponse.status>=400)upstream.push({path:pathName,status:upstreamResponse.status});
 res.writeHead(upstreamResponse.status,{'content-type':upstreamResponse.headers.get('content-type')||mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
 if(req.method==='HEAD'){res.end();return;}res.end(Buffer.from(await upstreamResponse.arrayBuffer()));
}catch(e){failedResources.push(String(e.message));if(!res.headersSent)res.writeHead(502);res.end('GET_MIRROR_FAILURE')}}
class CDP{
 constructor(ws){this.ws=ws;this.counter=0;this.pending=new Map();this.handlers=[];
 ws.addEventListener('message',e=>{let m;try{m=JSON.parse(e.data.toString())}catch{return}
   if(m.id){const p=this.pending.get(m.id);if(p){this.pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}}
   else this.handlers.forEach(h=>h(m));});}
 send(method,params={}){return new Promise((resolve,reject)=>{const id=++this.counter;this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(this.pending.has(id)){this.pending.delete(id);reject(Error('CDP_TIMEOUT_'+method))}},27000).unref()})}
 async eval(expression){const data=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,timeout:25000});if(data.exceptionDetails)throw Error('JS_EVAL_'+(data.exceptionDetails.exception?.description||data.exceptionDetails.text));return data.result.value}
 on(fn){this.handlers.push(fn)}
}
async function poll(expression,timeout=25000){const since=Date.now();let x;while(Date.now()-since<timeout){try{x=await cdp.eval(expression);if(x)return x}catch(e){x=e.message}await sleep(200);}throw Error('R83_NOT_READY_'+expression.slice(0,75)+' / '+JSON.stringify(x))}
async function go(url){await cdp.send('Page.navigate',{url:`http://127.0.0.1:${port}`+url});const where=new URL(url,'http://127.0.0.1').pathname;await poll(`location.pathname===${JSON.stringify(where)} && document.readyState==="complete"`);await sleep(250)}
async function viewport(width){await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:890,deviceScaleFactor:1,mobile:width<=390});}
async function screenshot(file){
 let r;
 try{
   const layout=await cdp.send('Page.getLayoutMetrics');const size=layout.cssContentSize||layout.contentSize;
   const width=Math.max(1,Math.ceil(size.width)),height=Math.min(13500,Math.max(890,Math.ceil(size.height)));
   r=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,fromSurface:true,clip:{x:0,y:0,width,height,scale:1}});
 }catch(e){r=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});}
 fs.writeFileSync(file,Buffer.from(r.data,'base64'));captured.push(file);
}
async function run(){
 const bin=findBrowser();if(!bin)throw Error('R83_CHROME_OR_EDGE_REQUIRED');
 httpServer=http.createServer(serve);await new Promise((ok,fail)=>{httpServer.once('error',fail);httpServer.listen(0,'127.0.0.1',ok)});port=httpServer.address().port;
 tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dachapar-r83-qa-'));
 browser=spawn(bin,[...(process.platform!=='win32'&&process.getuid?.()===0?['--no-sandbox','--disable-dev-shm-usage']:[]),'--headless=new','--disable-gpu','--disable-extensions','--no-first-run','--disable-background-networking','--disable-features=BackForwardCache','--remote-debugging-port=0',`--user-data-dir=${tmp}`,'about:blank'],{stdio:'ignore'});
 let dbg;for(let t=0;t<120;t++){const p=path.join(tmp,'DevToolsActivePort');if(isFile(p)){dbg=Number(fs.readFileSync(p,'utf8').split(/\r?\n/)[0]);break}await sleep(150)}if(!dbg)throw Error('R83_CDP_BROWSER_DID_NOT_START');
 const targets=await(await fetch(`http://127.0.0.1:${dbg}/json/list`)).json();const tab=targets.find(t=>t.type==='page');if(!tab)throw Error('R83_NO_PAGE_TARGET');
 socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((ok,fail)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',fail,{once:true})});cdp=new CDP(socket);
 cdp.on(event=>{
   if(event.method==='Runtime.exceptionThrown')exceptions.push(event.params?.exceptionDetails?.exception?.description||event.params?.exceptionDetails?.text);
   if(event.method==='Fetch.requestPaused'){
     const p=event.params;const url=p.request.url;const allow=url.startsWith(`http://127.0.0.1:${port}/`)&&['GET','HEAD'].includes(p.request.method);
     if(!allow)outside.push(p.request.method+' '+url.slice(0,180));
     cdp.send(allow?'Fetch.continueRequest':'Fetch.failRequest',allow?{requestId:p.requestId}:{requestId:p.requestId,errorReason:'BlockedByClient'}).catch(()=>{});
   }
 });
 await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
 const faq=html['voprosy/index.html'];
 check('QA01_FAQ_INCLUDED',faq.includes('id="comfort-included-faq"')&&faq.includes('Два комплекта розеток')&&faq.includes('Получить консультацию и планировку бесплатно'));
 check('QA02_P0_PRICES',faq.includes('505')&&faq.includes('618')&&faq.includes('113'));
 check('QA03_NO_GENERIC_WINDOW_CLAIM',modelPaths.every(x=>!html[x.slice(1)+'index.html'].includes('Окна и двери выбранного варианта')));
 check('QA04_DETAILS_IN_ARTICLE',html['journal/kak-chitat-komplektatsiyu-bani/index.html'].includes('ПВХ 700 × 1800 мм')&&html['journal/kak-chitat-komplektatsiyu-bani/index.html'].includes('LED-подсветку'));
 check('QA05_NO_80_PERCENT',files.every(x=>!html[x].includes('80% клиентов')));
 const openings={'kvadro':'ПВХ 600 × 800 мм','parus':'ПВХ 600 × 800 мм',viking:'ПВХ 600 × 800 мм','kvadro-haus':'ПВХ 600 × 800 мм'};
 for(const width of [390,768,1366,1920]){
   await viewport(width);
   for(const model of ['kvadro','parus','viking','kvadro-haus']){
     await go('/bani/'+model+'/');
     const x=await cdp.eval(`(()=>{const c=document.querySelector('#comfort-included');const r=c?.getBoundingClientRect();return {path:location.pathname,sw:document.documentElement.scrollWidth,w:innerWidth,heading:c?.querySelector('h2')?.textContent?.trim(),items:c?.querySelectorAll('.r83-comfort-list li').length,upgradeItems:c?.querySelectorAll('.r83-upgrade-list li').length,txt:c?.textContent||'',primary:c?.querySelector('a.r83-comfort-primary[href="/#configure"]')?.textContent?.trim(),secondary:c?.querySelector('a.r83-comfort-secondary[href="/#relay-lead-form"]')?.textContent?.trim(),details:!!c?.querySelector('details.r83-comfort-details'),link:!!document.querySelector('a[href="#comfort-included"]'),h1:document.querySelectorAll('h1').length,body:document.body.textContent||'',blockHeight:r?.height}})()`);
     const ok=x.path==='/bani/'+model+'/' && x.sw<=x.w+4 && x.h1===1 && x.items===7 && x.upgradeItems===5 && x.link&&x.heading==='В «Комфорт» уже включено всё необходимое для парения' && x.txt.includes(openings[model])&&x.primary==='Рассчитать баню с улучшениями'&&x.secondary==='Получить консультацию и планировку бесплатно'&&x.details && x.blockHeight>120;
     check('QA06_MODEL_'+model+'_'+width,ok,{scroll:x.sw,width:x.w,items:x.items,opening:openings[model]});
     if((width===390||width===1366)&&model==='kvadro'){
       await cdp.eval(`document.querySelector('#comfort-included').scrollIntoView({block:'start'});true`);
       await sleep(120);
       const file=path.resolve(process.env.TEMP||os.tmpdir(),`DachaPar_R83_Kvadro_${width}_stage.png`);await screenshot(file);
     }
   }
 }
 for(const width of [390,1366]){
   await viewport(width);await go('/voprosy/');
   const x=await cdp.eval(`(()=>{const d=document.querySelector('#comfort-included-faq');return {width:innerWidth,scroll:document.documentElement.scrollWidth,exist:!!d,text:d?.textContent||'',open:d?.open}})()`);
   check('QA07_FAQ_'+width,x.exist&&x.scroll<=x.width+4&&x.text.includes('Два комплекта розеток')&&x.text.includes('Получить консультацию и планировку бесплатно'),{width:x.width,scroll:x.scroll,exist:x.exist});
   await cdp.eval(`document.querySelector('#comfort-included-faq').open=true;true`);
   const z=await cdp.eval(`({open:document.querySelector('#comfort-included-faq').open,height:document.querySelector('#comfort-included-faq').getBoundingClientRect().height})`);
   check('QA08_FAQ_EXPANDS_'+width,z.open&&z.height>120,z);
   if(width===390){const file=path.resolve(process.env.TEMP||os.tmpdir(),'DachaPar_R83_FAQ_390_stage.png');await screenshot(file);}
 }
 check('QA09_NO_PRODUCTION_POSTS',unexpectedPost.length===0,{posted:unexpectedPost});
 check('QA10_NO_EXTERNAL',outside.filter(x=>!x.includes('favicon')).length===0,{external:outside.slice(0,5)});
 check('QA11_NO_JS_EXCEPTION',exceptions.length===0,{exceptions:exceptions.slice(0,6)});
 check('QA12_CRITICAL_ASSETS',failedResources.length===0&&!upstream.some(x=>/\.(css|js|mjs|webp)$/.test(x.path)),{failed:failedResources.slice(0,5),upstream:upstream.slice(0,5)});
 const passed=results.filter(x=>x.status==='PASS').length,failed=results.filter(x=>x.status==='FAIL').length;
 const report={stage:releaseArg,status:failed?'FAIL':'PASS',passed,failed,productionWrites:0,productionPosts:0,results,screenshots:captured,exceptions,externalRequests:outside,upstream,createdAt:new Date().toISOString()};
 const output=path.resolve(process.env.TEMP||os.tmpdir(),`DachaPar_R83_Stage_QA_${Date.now()}.json`);fs.writeFileSync(output,JSON.stringify(report,null,2));
 console.log(`R83_BROWSER_QA=${failed?'NO_GO':'PASS'}; PASSED=${passed}; FAILED=${failed}; POSTS=0; WRITES=0`);
 console.log('R83_QA_EVIDENCE='+output);for(const file of captured)console.log('R83_SCREENSHOT='+file);
 if(failed)process.exitCode=2;
}
try{await run()}catch(e){console.error('R83_BROWSER_QA=BLOCKED; ERROR='+String(e.stack||e).slice(0,2000));process.exitCode=2;}finally{try{socket?.close()}catch{}try{browser?.kill()}catch{}try{httpServer?.close()}catch{}if(tmp)try{fs.rmSync(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:200})}catch{}}

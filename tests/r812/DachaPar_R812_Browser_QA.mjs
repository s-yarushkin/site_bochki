// R8.1.2 exact nonlive stage: browser tests against a loopback GET-only mirror.
// Three HTML files come from exact staged release, all other assets are GET-proxied
// from existing live R8.1.1. No production API POST and no server writes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
const [rootArg, manifestArg, releaseArg] = process.argv.slice(2);
const root=path.resolve(rootArg||''), manifest=JSON.parse(fs.readFileSync(manifestArg,'utf8'));
const expected='CJM-R812-VISUAL-SELECT-20261023-1792760695767877252';
const old='CJM-R811-HERO-COPY-20261023-1792759364955844292';
const BASE='https://xn--80aaan1dh9b.xn--p1ai';
const files=['index.html','bani/index.html','compare/index.html'];
const titles={kvadro:'Квадро',parus:'Парус',viking:'Викинг','kvadro-haus':'Квадро Хаус'};
const priceMap={kvadro:390000,parus:415000,viking:450000,'kvadro-haus':649000};
if(releaseArg!==expected || manifest.expected_active_release!==old)throw Error('R812_UNEXPECTED_RELEASE_OR_BASE');
if(Object.keys(manifest.modified).sort().join('|')!==files.slice().sort().join('|'))throw Error('R812_WRONG_FILE_SCOPE');
for(const file of files){const current=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');if(current!==manifest.modified[file].after_sha256)throw Error('R812_STAGE_FILE_HASH_MISMATCH_'+file)}
const html=Object.fromEntries(files.map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
const results=[],exceptions=[],failedResources=[],outside=[],unexpectedPost=[],upstream=[],captured=[];
let httpServer,browser,cdp,socket,tmp,port;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const isFile=p=>{try{return fs.statSync(p).isFile()}catch{return false}};
function check(id,pass,detail=''){const status=pass?'PASS':'FAIL';results.push({id,status,detail});console.log(`R812_${status}=${id}`+(detail?'; '+JSON.stringify(detail).slice(0,370):''));}
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
   res.writeHead(405);res.end('R812_READ_ONLY');return;
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
 const upstreamResponse=await fetch(remote,{method:req.method,redirect:'manual',headers:{'Accept-Encoding':'identity','User-Agent':'DachaPar-R812-Nonlive-CJM-QA-GET'},signal:AbortSignal.timeout(25000)});
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
async function poll(expression,timeout=25000){const since=Date.now();let x;while(Date.now()-since<timeout){try{x=await cdp.eval(expression);if(x)return x}catch(e){x=e.message}await sleep(200);}throw Error('R812_NOT_READY_'+expression.slice(0,75)+' / '+JSON.stringify(x))}
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
 const bin=findBrowser();if(!bin)throw Error('R812_CHROME_OR_EDGE_REQUIRED');
 httpServer=http.createServer(serve);await new Promise((ok,fail)=>{httpServer.once('error',fail);httpServer.listen(0,'127.0.0.1',ok)});port=httpServer.address().port;
 tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dachapar-r812-qa-'));
 browser=spawn(bin,[...(process.platform!=='win32'&&process.getuid?.()===0?['--no-sandbox','--disable-dev-shm-usage']:[]),'--headless=new','--disable-gpu','--disable-extensions','--no-first-run','--disable-background-networking','--disable-features=BackForwardCache','--remote-debugging-port=0',`--user-data-dir=${tmp}`,'about:blank'],{stdio:'ignore'});
 let dbg;for(let t=0;t<120;t++){const p=path.join(tmp,'DevToolsActivePort');if(isFile(p)){dbg=Number(fs.readFileSync(p,'utf8').split(/\r?\n/)[0]);break}await sleep(150)}if(!dbg)throw Error('R812_CDP_BROWSER_DID_NOT_START');
 const targets=await(await fetch(`http://127.0.0.1:${dbg}/json/list`)).json();const tab=targets.find(t=>t.type==='page');if(!tab)throw Error('R812_NO_PAGE_TARGET');
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
 const imgMap={kvadro:'kvadro-garden-r7-960.webp',parus:'parus-garden-r7-600.webp',viking:'viking-p3-960.webp','kvadro-haus':'house-p3-600.webp'};
 // Static tests against exact stage bytes, not generic old homepage.
 check('QA01_HOME_PHOTO_FIRST',!html['index.html'].includes('<a href="/compare/">Сравнить модели ↗</a>')&&html['index.html'].includes('id="models"'));
 const catalog=html['bani/index.html'];
 check('QA02_CATALOG_SECONDARY',catalog.includes('Подробная таблица размеров и цен')&&!catalog.includes('>Сравнить модели<'));
 const compare=html['compare/index.html'];
 check('QA03_COMPARE_FOUR_CARDS',(compare.match(/class="r812-card"/g)||[]).length===4&&Object.keys(imgMap).every(m=>compare.includes('/bani/'+m+'/')));
 check('QA04_TABLE_BELOW_PHOTOS',compare.indexOf('class="r812-grid"')>=0&&compare.indexOf('class="r812-grid"')<compare.indexOf('<details id="prices">'));
 check('QA05_SEO_AND_OLD_URL',compare.includes(`href="${BASE}/compare/" rel="canonical"`)&&compare.includes('Сравнение бань')&&compare.includes('id="content"'));
 for (const width of [390,768,1366,1920]){
   await viewport(width);await go('/compare/');
   // Force lazy images below the viewport to load before verifying the whole set.
   await cdp.eval(`Promise.all([...document.querySelectorAll('.r812-card img')].map(async img=>{img.loading='eager';try{await img.decode();return true}catch{return false}}))`);
   const x=await cdp.eval(`(()=>({path:location.pathname,doc:document.documentElement.scrollWidth,width:innerWidth,cardCount:document.querySelectorAll('.r812-card').length,columns:getComputedStyle(document.querySelector('.r812-grid')).gridTemplateColumns.split(' ').length,images:[...document.querySelectorAll('.r812-card img')].map(img=>({src:img.currentSrc.split('/').pop(),width:img.naturalWidth,loaded:img.complete})),details:document.querySelector('#prices')?.open,links:[...document.querySelectorAll('.r812-card-body a')].map(a=>new URL(a.href).pathname),prices:[...document.querySelectorAll('.r812-card-bottom strong')].map(e=>e.innerText),h1:document.querySelectorAll('h1').length}))()`);
   const paths=Object.keys(titles).map(k=>'/bani/'+k+'/');
   const okPath=x.path==='/compare/'&&x.cardCount===4&&x.h1===1;
   const okImg=x.images.length===4&&Object.values(imgMap).every(name=>x.images.some(i=>i.src===name&&i.loaded&&i.width>100));
   const okLinks=paths.every(p=>x.links.includes(p));
   const okPrices=Object.values(priceMap).every(p=>x.prices.some(s=>s.replace(/[^0-9]/g,'')===String(p)));
   const overflow=x.doc>x.width+4;
   const cols=width<=390?x.columns===1:width===1366||width===1920?x.columns===2:true;
   check('QA06_COMPARE_LAYOUT_'+width,okPath&&!overflow&&cols,{scroll:x.doc,width:x.width,columns:x.columns,cardCount:x.cardCount});
   check('QA07_COMPARE_IMAGES_'+width,okImg,x.images);
   check('QA08_COMPARE_CTA_PRICES_'+width,okLinks&&okPrices,{links:x.links,prices:x.prices});
   check('QA09_TABLE_COLLAPSED_'+width,x.details===false,{details:x.details});
   if(width===1366||width===390){
     await cdp.eval(`(()=>{document.querySelector('#prices summary').click();return true})()`);
     const t=await cdp.eval(`({open:document.querySelector('#prices').open,priceRows:document.querySelectorAll('#prices tbody tr').length,table:!!document.querySelector('#prices table')})`);
     check('QA10_TABLE_EXPANDS_'+width,t.open&&t.priceRows===5&&t.table,t);
   }
   if(width===390||width===1366){const file=path.resolve(process.env.TEMP||os.tmpdir(),`DachaPar_R812_compare_${width}_stage.png`);await screenshot(file);}
 }
 for(const width of [390,1366]){
   await viewport(width);
   await go('/');const a=await cdp.eval(`({scroll:document.documentElement.scrollWidth,width:innerWidth,links:[...document.querySelectorAll('#models a')].map(a=>new URL(a.href).pathname),comparePromos:document.querySelectorAll('#models a[href*="compare"]').length})`);
   check('QA11_HOME_PATH_'+width,a.scroll<=a.width+4&&a.comparePromos===0&&Object.keys(titles).every(k=>a.links.includes('/bani/'+k+'/')),a);
   await go('/bani/');const b=await cdp.eval(`({scroll:document.documentElement.scrollWidth,width:innerWidth,links:[...document.querySelectorAll('a[href*="/compare/"]')].map(a=>a.textContent.trim())})`);
   check('QA12_CATALOG_PATH_'+width,b.scroll<=b.width+4&&b.links.length===1&&b.links[0].includes('таблица'),b);
 }
 check('QA13_NO_WRITE_OR_EXTERNAL',unexpectedPost.length===0&&outside.filter(x=>!x.includes('favicon')).length===0,{posted:unexpectedPost,external:outside.slice(0,5)});
 check('QA14_NO_JS_EXCEPTION',exceptions.length===0,{exceptions:exceptions.slice(0,6)});
 check('QA15_UPSTREAM_CRITICAL_ASSETS',failedResources.length===0&&!upstream.some(x=>/\.(css|js|mjs|webp)$/.test(x.path)),{failed:failedResources.slice(0,5),upstream:upstream.slice(0,5)});
 const pass=results.filter(r=>r.status==='PASS').length;const fail=results.filter(r=>r.status==='FAIL').length;
 const report={release:expected,liveExpected:old,timestamp:new Date().toISOString(),status:{PASS:pass,FAIL:fail},results,screenshots:captured,externalRequests:outside.slice(0,40),unexpectedPost,failedResources,upstream,exceptions,productionWrites:0};
 const target=path.resolve(process.env.TEMP||os.tmpdir(),`DachaPar_R812_Stage_QA_${Date.now()}.json`);fs.writeFileSync(target,JSON.stringify(report,null,2));
 console.log(`R812_BROWSER_QA=${fail?'NO_GO':'PASS'}; PASS=${pass}; FAIL=${fail}; LIVE_POSTS=0; PRODUCTION_WRITES=0`);
 console.log(`R812_QA_EVIDENCE=${target}`);for(const x of captured)console.log(`R812_SCREENSHOT=${x}`);
 if(fail)process.exitCode=2;
}
try{await run()}catch(e){console.error('R812_BROWSER_QA=BLOCKED; ERROR='+String(e.stack||e).slice(0,1700));process.exitCode=2;}finally{try{socket?.close()}catch{}try{browser?.kill()}catch{}try{httpServer?.close()}catch{}if(tmp)try{fs.rmSync(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:200})}catch{}}

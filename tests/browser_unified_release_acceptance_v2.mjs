// Dacha Par unified release: full app, isolated browser, GET-only public preview.
// Requires Node.js 22+ and installed Chrome/Edge. Does not write to production.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const payload = path.resolve(process.argv[2] ?? '');
if (!payload || !fs.existsSync(path.join(payload, 'index.html'))) throw new Error('Provide unpacked payload directory as first argument');
if (!process.versions.node || Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22+ is required (built-in WebSocket).');
const ORIGIN = process.env.DACHA_PAR_TEST_ONLY_ORIGIN || 'https://xn--80aaan1dh9b.xn--p1ai';
let server, chrome, ws, chromeData;
const findings = [], failures = [], refused = [], blockedExternal = [];
const mime = { '.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8', '.webp':'image/webp', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon', '.txt':'text/plain; charset=utf-8'};
function existsFile(p){try{return fs.statSync(p).isFile()}catch{return false}}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function report(name, passed, detail='') {
  console.log(`GALLERY_ACCEPTANCE_${passed?'PASS':'FAIL'}=${name}${detail?'; '+detail:''}`);
  (passed?findings:failures).push(name+(detail?':'+detail:''));
}
function browserPath(){
  if(process.env.DACHA_PAR_BROWSER && existsFile(process.env.DACHA_PAR_BROWSER)) return process.env.DACHA_PAR_BROWSER;
  const paths=process.platform==='win32'?[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).flatMap(root=>[
    path.join(root,'Google','Chrome','Application','chrome.exe'),
    path.join(root,'Microsoft','Edge','Application','msedge.exe'),
    path.join(root,'Chromium','Application','chrome.exe')]):['/usr/bin/chromium','/usr/bin/google-chrome','/usr/bin/chromium-browser'];
  return paths.find(existsFile);
}
function serverHandler(req,res){
  (async()=>{
    if(!['GET','HEAD'].includes(req.method)){refused.push(`${req.method} ${req.url}`);res.writeHead(405);res.end('READ_ONLY_ACCEPTANCE_NO_POST');return}
    let parsed;
    try{parsed=new URL(req.url,'http://127.0.0.1')}catch{res.writeHead(400);res.end();return}
    let pathname;
    try{pathname=decodeURIComponent(parsed.pathname)}catch{res.writeHead(400);res.end();return}
    if(pathname.includes('\\')||pathname.split('/').includes('..')){res.writeHead(403);res.end();return}
    const relative=pathname.endsWith('/')? pathname.slice(1)+'index.html':pathname.slice(1);
    const file=path.resolve(payload,relative);
    if(file.startsWith(payload+path.sep)&&existsFile(file)){
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
      if(req.method==='HEAD'){res.end();return}
      fs.createReadStream(file).pipe(res);return;
    }
    // Only proxy public GET/HEAD from this one established origin. No cookies, no credentials, no POST.
    const uri=new URL(parsed.pathname+parsed.search,ORIGIN);
    const upstream=await fetch(uri,{method:req.method,redirect:'follow',headers:{'Accept-Encoding':'identity','User-Agent':'DachaPar-public-preview-readonly/1.0'},signal:AbortSignal.timeout(18000)});
    if(new URL(upstream.url).origin!==ORIGIN){res.writeHead(502);res.end('CROSS_ORIGIN_REDIRECT_BLOCKED');return}
    res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/octet-stream','Cache-Control':'no-store'});
    if(req.method==='HEAD')res.end();else res.end(Buffer.from(await upstream.arrayBuffer()));
  })().catch(e=>{if(!res.headersSent)res.writeHead(502);res.end('UPSTREAM_READ_FAILED '+String(e.message).slice(0,120));});
}
class CDP {
  constructor(socket){this.socket=socket;this.count=0;this.pending=new Map();this.handlers=[];
    socket.addEventListener('message',evt=>{
      let obj;try{obj=JSON.parse(evt.data.toString())}catch{return}
      if(obj.id){const q=this.pending.get(obj.id);if(q){this.pending.delete(obj.id);obj.error?q.reject(new Error(obj.error.message)):q.resolve(obj.result)}}
      else for(const h of this.handlers)h(obj);
    });
  }
  send(method,params={}){const id=++this.count;return new Promise((resolve,reject)=>{
    this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params}));
    setTimeout(()=>{if(this.pending.has(id)){this.pending.delete(id);reject(new Error('CDP_TIMEOUT '+method))}},15000).unref();
  });}
  on(handler){this.handlers.push(handler)}
  async eval(expr){const obj=await this.send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true,timeout:18000});if(obj.exceptionDetails)throw new Error('PAGE_EVAL '+obj.exceptionDetails.text);return obj.result.value}
}
async function waitFor(cdp,script,timeout=18000){const start=Date.now();let last;while(Date.now()-start<timeout){try{last=await cdp.eval(script);if(last)return last}catch(e){last=e.message}await sleep(170)}throw new Error('TIMEOUT: '+script.slice(0,100)+' last='+JSON.stringify(last))}
async function checkOnPage(cdp,width,port){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${port}/?gallery_acceptance=1`});
  await waitFor(cdp,'document.readyState==="complete"',20000);
  await waitFor(cdp,'!!document.querySelector("#pp-gallery") && !!document.querySelector("#qh-gallery")',20000);
  report(`${width}_BOTH_GALLERIES_LOADED`,true);
  // The real app must successfully load the existing pricebook and show the price configurator.
  const app = await cdp.eval('({loaded:!document.querySelector("#config-app")?.hidden, error:!document.querySelector("#load-error")?.hidden})');
  report(`${width}_REAL_APP_PRICEBOOK`,app.loaded&&!app.error,JSON.stringify(app));
  // Parus single-shot grid regression (real DOM, real CSS)
  const pp=await cdp.eval(`(()=>{const b=document.querySelector('[data-pp-object]');if(!b)return {error:'no entry'};b.click();const x=document.querySelector('#pp-gallery [data-object="timber"]');if(!x)return {error:'no timber'};x.click();const im=document.querySelector('#pp-gallery-image'),r=im.getBoundingClientRect();return {open:document.querySelector('#pp-gallery').open,width:r.width,height:r.height,arrows:[...document.querySelectorAll('#pp-gallery [data-pp-step]')].filter(a=>!a.hidden).length};})()`);
  report(`${width}_PARUS_P0_SINGLE_SHOT`,pp.open&&pp.width>Math.max(160,width*.3)&&pp.arrows===0,JSON.stringify(pp));
  await cdp.eval('document.querySelector("#pp-gallery")?.close()');
  // QH: real WebP from the payload should decode when opened, and all five groups exposed.
  const qh=await cdp.eval(`(async()=>{document.querySelector('[data-qh-object]')?.click();await new Promise(r=>setTimeout(r,150));const dlg=document.querySelector('#qh-gallery');if(!dlg?.open)return {error:'dialog not opened'};const tabs=[...dlg.querySelectorAll('[data-object]')],im=document.querySelector('#qh-gallery-image');try{await im.decode()}catch(e){return {error:'WebP failed to decode',url:im.currentSrc}}const b=im.getBoundingClientRect();return {open:dlg.open,tabs:tabs.length,width:b.width,naturalWidth:im.naturalWidth,url:im.currentSrc}})()`);
  report(`${width}_QH_REAL_IMAGE_AND_FIVE_OBJECTS`,qh.open&&qh.tabs===5&&qh.naturalWidth>0&&qh.width>Math.max(150,width*.27),JSON.stringify(qh));
  await cdp.eval('document.querySelector("#qh-gallery")?.close()');
  console.log(`GALLERY_ACCEPTANCE_STAGE=${width}_QH_SVG_BEGIN`);
  // Each layout is tested separately. The image is native loading="lazy" and below the fold:
  // scroll into view BEFORE waiting for decode, otherwise Chromium can defer it forever.
  const layoutIds=await cdp.eval(`[...document.querySelectorAll('[data-qh-layout]')].map(b=>b.dataset.qhLayout)`);
  report(`${width}_QH_FOUR_LAYOUT_BUTTONS`,layoutIds.length===4&&new Set(layoutIds).size===4,JSON.stringify(layoutIds));
  for(const id of layoutIds){
    const planResult=await cdp.eval(`(async()=>{
      const button=[...document.querySelectorAll('[data-qh-layout]')].find(b=>b.dataset.qhLayout===${JSON.stringify(id)});
      const image=document.querySelector('#qh-plan-image');
      if(!button||!image)return {id:${JSON.stringify(id)},error:'LAYOUT_BUTTON_OR_IMG_MISSING'};
      button.scrollIntoView({block:'center',behavior:'auto'});
      await new Promise(resolve=>requestAnimationFrame(resolve));
      button.click();
      image.scrollIntoView({block:'center',behavior:'auto'});
      const src=image.src;
      const loaded=await Promise.race([
        image.decode().then(()=>({ok:true})).catch(e=>({ok:false,error:'DECODE_'+String(e?.name||e)})),
        new Promise(resolve=>setTimeout(()=>resolve({ok:false,error:'IMAGE_DECODE_TIMEOUT_6500MS'}),6500))
      ]);
      return {id:${JSON.stringify(id)},url:src,complete:image.complete,naturalWidth:image.naturalWidth,
        naturalHeight:image.naturalHeight,loading:image.loading,selected:button.getAttribute('aria-pressed'),...loaded};
    })()`);
    const okay=planResult.ok===true&&planResult.naturalWidth>0&&planResult.selected==='true' &&
      typeof planResult.url==='string'&&planResult.url.includes(`/qh-media/assets/plans/${id}.svg`);
    report(`${width}_QH_SVG_${id}`,okay,JSON.stringify(planResult));
  }
  console.log(`GALLERY_ACCEPTANCE_STAGE=${width}_QH_SVG_END`);
  // Check form trigger but DO NOT submit, and check no stale reference.
  const form=await cdp.eval(`(()=>{const f=document.querySelector('#relay-lead-form');return {form:!!f,action:f?.getAttribute('action'),consent:!!document.querySelector('input[name="consent"]'),prices:!!document.querySelector('#config-app')&&!document.querySelector('#config-app').hidden}})()`);
  report(`${width}_REAL_FORM_PRESENT_NO_SUBMISSION`,form.form&&form.prices,JSON.stringify(form));
}
async function main(){
  const exe=browserPath();if(!exe)throw new Error('Chrome or Edge not found. Set DACHA_PAR_BROWSER to your browser executable.');
  server=http.createServer(serverHandler);server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;
  chromeData=fs.mkdtempSync(path.join(os.tmpdir(),'DachaPar-Unified-Acceptance-'));
  chrome=spawn(exe,[...(process.platform!=='win32' && typeof process.getuid==='function' && process.getuid()===0 ? ['--no-sandbox','--disable-dev-shm-usage'] : []),'--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--remote-debugging-port=0',`--user-data-dir=${chromeData}`,'about:blank'],{stdio:'ignore'});
  let chromePort;for(let i=0;i<100;i++){
    const f=path.join(chromeData,'DevToolsActivePort');if(existsFile(f)){chromePort=Number(fs.readFileSync(f,'utf8').split(/\r?\n/)[0]);break}
    await sleep(120);
  }
  if(!chromePort)throw new Error('Browser did not start with CDP');
  const list=await(await fetch(`http://127.0.0.1:${chromePort}/json/list`)).json();
  const tab=list.find(x=>x.type==='page');if(!tab)throw new Error('CDP: page target not found');
  ws=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
  const cdp=new CDP(ws);
  const errors=[];
  cdp.on(ev=>{
    if(ev.method==='Runtime.exceptionThrown')errors.push(ev.params.exceptionDetails?.exception?.description||ev.params.exceptionDetails?.text||'unknown');
    if(ev.method==='Fetch.requestPaused'){
      const p=ev.params;const u=p.request.url;const okay=/^http:\/\/127\.0\.0\.1:\d+\//.test(u)&&['GET','HEAD'].includes(p.request.method);
      if(!okay)(['GET','HEAD'].includes(p.request.method)?blockedExternal:refused).push(`${p.request.method} ${u.slice(0,150)}`);
      cdp.send(okay?'Fetch.continueRequest':'Fetch.failRequest',okay?{requestId:p.requestId}:{requestId:p.requestId,errorReason:'BlockedByClient'}).catch(()=>{});
    }
  });
  await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  for(const width of [390,768,1366]){
    try{await checkOnPage(cdp,width,port)}catch(e){report(`${width}_BROWSER_RUN`,false,String(e.message).slice(0,500))}
  }
  report('NO_UNSAFE_BROWSER_REQUESTS',refused.length===0,refused.slice(0,8).join(' | '));
  console.log('EXTERNAL_GET_REQUESTS_BLOCKED='+blockedExternal.length);
  report('NO_UNCAUGHT_SITE_JS_ERRORS',errors.length===0,errors.slice(0,4).join(' | ').slice(0,500));
  console.log(`UNIFIED_BROWSER_ACCEPTANCE=${failures.length?'NO_GO':'PASS'}; PASSED=${findings.length}; FAILED=${failures.length}; ORIGIN=${ORIGIN}; READ_ONLY=YES`);
  if(failures.length)process.exitCode=2;
}
try{await main()}catch(e){console.error('UNIFIED_BROWSER_ACCEPTANCE=BLOCKED; REASON='+String(e.stack||e).slice(0,2000));process.exitCode=2}
finally{
  try{ws?.close()}catch{};try{chrome?.kill()}catch{};try{server?.close()}catch{};
  if(chromeData)try{fs.rmSync(chromeData,{recursive:true,force:true,maxRetries:4,retryDelay:300})}catch{}
}

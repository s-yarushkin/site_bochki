// Exercise the HTTPS stage namespace through a local reverse proxy, without browser automation.
import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {spawn} from 'node:child_process';
test('fixture stage isolates cookies, links and form endpoints from the production namespace',async()=>{
 const prefix='/crm-stage-111111111111';let backendPort;const proxy=http.createServer((req,res)=>{
  if(!req.url.startsWith(prefix+'/')){res.writeHead(404);res.end();return;}
  const upstream=http.request({host:'127.0.0.1',port:backendPort,path:req.url.slice(prefix.length),method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>{res.writeHead(503);res.end();});req.pipe(upstream);
 });await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+proxy.address().port;
 const reservation=http.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));backendPort=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 const child=spawn(process.execPath,['scripts/crm-preview.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,CRM_PREVIEW_PORT:String(backendPort),CRM_PREVIEW_ORIGIN:origin,CRM_PREVIEW_PREFIX:prefix},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Fixture startup timeout')),10000);child.once('exit',code=>{clearTimeout(timer);reject(Error('Fixture exited '+code));});child.stdout.once('data',()=>{clearTimeout(timer);resolve();});});
  const call=(p,options={})=>fetch(origin+prefix+p,options),post=(p,data,extra={})=>call(p,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...extra},body:JSON.stringify(data)});
  const response=await post('/api/manager/login',{phone:'+79990000001',password:'Fixture-password-2026!'});assert.equal(response.status,200);const login=await response.json(),cookie=response.headers.getSetCookie()[0];assert.ok(cookie.startsWith('crmstage_gb_manager_session='));assert.ok(cookie.includes('Path='+prefix+'/api/manager/'));
  const headers={Cookie:cookie.split(';')[0],'X-CSRF-Token':login.csrf};const linkResponse=await post('/api/manager/tracking-links',{label:'Fixture stage',source:'youtube',channel:'social_organic',destination:'/'},headers);assert.equal(linkResponse.status,201);const {link}=await linkResponse.json();assert.ok(link.short_url.startsWith(origin+prefix+'/go/'));assert.ok(link.full_url.startsWith(origin+prefix+'/'));
  const redirect=await fetch(link.short_url+'?yclid=fixture123',{redirect:'manual'});assert.equal(redirect.status,302);assert.ok(redirect.headers.get('location').startsWith(origin+prefix+'/'));assert.equal(new URL(redirect.headers.get('location')).searchParams.get('yclid'),'fixture123');
  const consent=await post('/api/analytics/consent',{choice:'all'});assert.ok(consent.headers.getSetCookie().every(c=>c.startsWith('crmstage_')&&c.includes('Path='+prefix+'/')));
  const wrapper=await (await call('/journey-tracker.mjs')).text();assert.ok(wrapper.includes('./journey-runtime.mjs'));const source=await (await call('/journey-runtime.mjs')).text();assert.ok(source.includes("fetch('"+prefix+"/api/analytics/config'"));assert.ok(source.includes('crmstage_dp_consent='));
  // Execute only the pure cookie reader, with no browser globals or auto-install side effects.
  const reader=source.match(/export const cookieChoice=([^\n]+);/)[1];const readChoice=Function('return ('+reader+')')();assert.equal(readChoice({document:{cookie:'crmstage_dp_consent=all'}}),'all');assert.equal(readChoice({document:{cookie:'crmstage_dp_consent=necessary'}}),'necessary');
  assert.equal((await call('/api/manager/users',{headers:{Cookie:'gb_manager_session=fake'}})).status,401);
 }finally{child.kill();await new Promise(resolve=>proxy.close(resolve));}
});

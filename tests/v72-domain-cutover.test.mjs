import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadRelayConfig,createRelayHandler,createSiteManagerApi,formatBaniLead} from '../server/garant-bani-relay.mjs';
import {hashManagerPassword} from '../server/manager-auth.mjs';
import {openLeadStore} from '../server/lead-store.mjs';
const old='https://xn----7sbbigeqcfm8bq.xn--p1ai', fresh='https://xn--80aaan1dh9b.xn--p1ai';
const env={ALLOWED_ORIGIN:old,MAX_CHAT_ID:'-1',MAX_TOKEN_FILE:'/unused',ADDITIONAL_SITES_JSON:JSON.stringify([{origin:fresh,basePath:'/'}])};
const config=()=>loadRelayConfig(env,()=> 'isolated-token-not-real');
test('cutover config rejects wildcard, malformed origins, duplicate hosts and unsafe cookie paths',()=>{
  assert.equal(config().sites.length,2);
  for(const sites of ['null','{}','[null]',JSON.stringify([{origin:old,basePath:'/'}]),JSON.stringify([{origin:'https://*.example.com',basePath:'/'}]),JSON.stringify([{origin:fresh+'/other',basePath:'/'}]),JSON.stringify([{origin:fresh,basePath:'/../'}])]){
    assert.throws(()=>loadRelayConfig({...env,ADDITIONAL_SITES_JSON:sites},()=> 'isolated-token-not-real'));
  }
});
function send(port,path,host,origin,body,cookie,method){return new Promise((resolve,reject)=>{
  const req=request({hostname:'127.0.0.1',port,path,method:method||(body?'POST':'GET'),headers:{host,...(origin?{origin}:{}),'content-type':'application/json',...(cookie?{cookie}:{})}},res=>{
    let data='';res.on('data',b=>data+=b);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,data:JSON.parse(data)}));
  });req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
});}
test('both domains: consent, persistent SQLite, mock MAX, host-bound origins, manager cookies and CSRF',async()=>{
  const temp=mkdtempSync(join(tmpdir(),'dachapar-isolated-'));
  let store=openLeadStore(join(temp,'leads.sqlite'));
  const c=config(), delivered=[];
  const password='IsolatedTestPassword-2026!';
  const managerConfig={sessionSecret:'a'.repeat(96),accounts:[{phone:'+79991112233',hash:hashManagerPassword(password)},{phone:'+79992223344',hash:hashManagerPassword(password+'2')}]};
  const api=createSiteManagerApi({config:c,store,managerConfig});
  const server=createServer(createRelayHandler({config:c,store,managerApi:api,deliver:async lead=>delivered.push(formatBaniLead(lead)),log:()=>{}}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const port=server.address().port;
  try{
    for(const [origin,version,path] of [[old,'2026-10-12','/bani-preview/'],[fresh,'2026-10-14','/']]){
      const host=new URL(origin).host;
      const lead={requestId:randomUUID(),flow:'callback',name:'Тест',phone:'+79991112233',consent:true,consentVersion:version};
      const saved=await send(port,'/api/lead',host,origin,lead);
      assert.equal(saved.status,200);assert.equal(saved.data.delivered,true);
      assert.equal((await send(port,'/api/lead',host,origin,lead)).data.duplicate,true);
      assert.equal((await send(port,'/api/lead',host,origin===old?fresh:old,lead)).status,403);
      assert.equal((await send(port,'/api/lead',host,null,lead)).status,403);
      assert.equal((await send(port,'/api/manager/session',host)).status,401);
      const login=await send(port,'/api/manager/login',host,origin,{phone:'+79991112233',password});
      assert.equal(login.status,200);
      const cookie=login.headers['set-cookie'][0];
      assert.ok(cookie.includes('Path='+path+'api/manager/;'));
      assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);assert.ok(!cookie.includes('Domain='));
      assert.equal((await send(port,'/api/manager/leads',host,undefined,undefined,cookie.split(';')[0])).status,200);
      assert.equal((await send(port,'/api/manager/logout',host,'https://evil.example',{},cookie)).status,403);
      assert.equal((await send(port,'/api/manager/logout',host,origin===old?fresh:old,{},cookie)).status,403);
      assert.equal((await send(port,'/api/manager/logout',host,origin,{},cookie)).status,200);
    }
    assert.equal((await send(port,'/api/lead','evil.example',fresh,{})).status,403);
    assert.equal((await send(port,'/api/manager/session','evil.example')).status,403);
    assert.equal(delivered.length,2);
    assert.match(delivered[0],/ГАРАНТ БАНИ/);assert.match(delivered[1],/ДАЧА ПАР/);
    store.close();store=openLeadStore(join(temp,'leads.sqlite'));
    assert.equal(store.stats().total,2);
    assert.equal(store.list({}).leads.filter(x=>x.notificationStatus==='delivered').length,2);
  }finally{await new Promise(r=>server.close(r));store.close();rmSync(temp,{recursive:true,force:true});}
});

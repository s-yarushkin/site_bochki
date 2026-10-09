import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openLeadStore} from '../server/lead-store.mjs';
import {hashManagerPassword,verifyManagerPassword,createManagerAuth} from '../server/manager-auth.mjs';
import {createManagerApi} from '../server/manager-api.mjs';
import {createRelayHandler,formatBaniLead,validateBaniLead} from '../server/garant-bani-relay.mjs';

const origin='https://xn----7sbbigeqcfm8bq.xn--p1ai';
const config={allowedOrigin:origin,chatId:'-1',token:'secret-not-for-logs'};
const quote=()=>({
  requestId:randomUUID(),flow:'quote',consent:true,
  name:'Тестовый покупатель',phone:'+7 (999) 111-22-33',contactChannel:'whatsapp',
  district:'Вологодский район',base:'ready',access:'yes',comment:'Спросить про доставку',
  configuration:{modelId:'kvadro-house',sizeId:'500',finish:'walnut',
    optionIds:['aspen','window','porch'],bundleId:null}
});
async function withServer(handler,fn){
  const server=createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await fn('http://127.0.0.1:'+server.address().port);}
  finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
}
function post(base,data){
  return fetch(base+'/api/lead',{method:'POST',
    headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)});
}
test('manager password is salted, strong, verified without storing cleartext',()=>{
  const hash=hashManagerPassword('StrongExamplePassword-2026!');
  assert.match(hash,/^scrypt\$/);
  assert.notEqual(hash,hashManagerPassword('StrongExamplePassword-2026!'));
  assert.ok(verifyManagerPassword('StrongExamplePassword-2026!',hash));
  assert.equal(verifyManagerPassword('invalid-password',hash),false);
  assert.throws(()=>hashManagerPassword('weak'),/WEAK_MANAGER_PASSWORD/);
});
test('SQLite keeps full server-calculated snapshot, notes and immutable events after restart',()=>{
  const temp=mkdtempSync(join(tmpdir(),'bani-lead-store-'));
  const dbPath=join(temp,'leads.sqlite');
  const payload=quote(),lead=validateBaniLead(payload);
  let id;
  try{
    let store=openLeadStore(dbPath);
    let first=store.create(lead,payload.requestId);
    assert.equal(first.created,true);
    id=first.lead.id;
    assert.match(id,/^GB-\d{8}-[A-F0-9]{8}$/);
    assert.equal(first.lead.detail.estimate.options.length,3);
    assert.equal(first.lead.detail.configuration.finishName,'Тёплый орех');
    assert.equal(store.create(lead,payload.requestId).created,false);
    store.delivery(id,'delivered');
    const edited=store.update(id,{status:'in_progress',assignee:'Иван',managerNote:'Перезвонить завтра'});
    assert.equal(edited.status,'in_progress');
    assert.equal(edited.events.length,5);
    assert.equal(store.stats().total,1);
    store.close();
    store=openLeadStore(dbPath);
    const restored=store.detail(id);
    assert.equal(restored.detail.configuration.finishId,'walnut');
    assert.equal(restored.notificationStatus,'delivered');
    assert.equal(restored.assignee,'Иван');
    assert.equal(restored.managerNote,'Перезвонить завтра');
    assert.equal(store.list({q:'+7999'}).total,1);
    assert.equal(store.list({status:'new'}).total,0);
    assert.equal(store.list({status:'in_progress'}).total,1);
    assert.throws(()=>store.update(id,{status:'hacked',assignee:'',managerNote:''}),/INVALID_STATUS/);
    store.close();
  }finally{rmSync(temp,{recursive:true,force:true});}
});
test('MAX notification contains unique lead ID and every selected item, finish, prices and discount',()=>{
  const validated=validateBaniLead(quote());
  const text=formatBaniLead(validated,{id:'GB-20261009-AABBCCDD',createdAt:'2026-10-09T12:00:00Z'});
  assert.match(text,/Номер: GB-20261009-AABBCCDD/);
  assert.match(text,/Внешняя отделка: Тёплый орех/);
  assert.match(text,/Стоимость модели:/);
  assert.match(text,/Сумма опций:/);
  assert.match(text,/Скидка:/);
  for(const option of validated.estimate.options)assert.ok(text.includes(option.name+' — '),option.name);
  assert.match(text,/WhatsApp по номеру телефона/);
});
test('lead intake stores before MAX delivery; unavailable MAX leaves visible failed record',async()=>{
  const store=openLeadStore(':memory:');
  const logs=[];
  let sends=0;
  const handler=createRelayHandler({config,store,log:x=>logs.push(x),
    deliver:async()=>{sends++;if(sends===1)throw Error('provider rejected');}});
  const payload=quote();
  try{
    await withServer(handler,async base=>{
      const one=await post(base,payload);
      assert.equal(one.status,502);
      const failed=await one.json();
      assert.match(failed.leadId,/^GB-/);
      assert.equal(store.detail(failed.leadId).notificationStatus,'failed');
      assert.equal(store.stats().total,1);
      const retry=await post(base,payload);
      assert.equal(retry.status,200);
      assert.equal((await retry.json()).leadId,failed.leadId);
      assert.equal(store.detail(failed.leadId).notificationStatus,'delivered');
      const again=await post(base,payload);
      assert.equal(again.status,200);
      assert.equal((await again.json()).duplicate,true);
      assert.equal(store.stats().total,1);
      assert.equal(sends,2);
      const second=await post(base,{...payload,requestId:randomUUID()});
      assert.equal(second.status,200);
      assert.equal(store.stats().total,2,'identical data from another submission must not be discarded');
    });
    assert.doesNotMatch(logs.join(' '),/9991112233|Тестовый покупатель|provider rejected/);
  }finally{store.close();}
});
test('manager API blocks anonymous users and CSRF, accepts login and audits status update',async()=>{
  const store=openLeadStore(':memory:');
  const password='VeryStrongManagerPassword-2026';
  const auth=createManagerAuth({
    passwordHash:hashManagerPassword(password),
    sessionSecret:'a'.repeat(64)
  });
  const managerApi=createManagerApi({store,auth,origin});
  const handler=createRelayHandler({config,store,managerApi,deliver:async()=>{}});
  try{
    await withServer(handler,async base=>{
      const data=quote();
      assert.equal((await post(base,data)).status,200);
      const anon=await fetch(base+'/api/manager/leads');
      assert.equal(anon.status,401);
      const forged=await fetch(base+'/api/manager/login',{method:'POST',
        headers:{origin:'https://evil.example','content-type':'application/json'},
        body:JSON.stringify({password})});
      assert.equal(forged.status,403);
      const wrong=await fetch(base+'/api/manager/login',{method:'POST',
        headers:{origin,'content-type':'application/json'},
        body:JSON.stringify({password:'wrong'})});
      assert.equal(wrong.status,401);
      const login=await fetch(base+'/api/manager/login',{method:'POST',
        headers:{origin,'content-type':'application/json'},
        body:JSON.stringify({password})});
      assert.equal(login.status,200);
      const rawCookie=login.headers.get('set-cookie');
      assert.match(rawCookie,/HttpOnly; Secure; SameSite=Strict/);
      const cookie=rawCookie.split(';')[0];
      const ls=await fetch(base+'/api/manager/leads',{headers:{cookie}});
      assert.equal(ls.status,200);
      const listing=await ls.json();
      assert.equal(listing.total,1);
      assert.equal(listing.leads[0].detail.configuration.finishId,'walnut');
      const id=listing.leads[0].id;
      const noOrigin=await fetch(base+'/api/manager/leads/'+id,{method:'PATCH',
        headers:{cookie,'content-type':'application/json'},
        body:JSON.stringify({status:'quote_sent',assignee:'Иван',managerNote:'КП отправлено'})});
      assert.equal(noOrigin.status,403);
      const patch=await fetch(base+'/api/manager/leads/'+id,{method:'PATCH',
        headers:{cookie,origin,'content-type':'application/json'},
        body:JSON.stringify({status:'quote_sent',assignee:'Иван',managerNote:'КП отправлено'})});
      assert.equal(patch.status,200);
      const edited=(await patch.json()).lead;
      assert.equal(edited.assignee,'Иван');
      assert.equal(edited.events.at(-1).action,'note');
      const tampered=await fetch(base+'/api/manager/leads',{headers:{cookie:cookie+'tamper'}});
      assert.equal(tampered.status,401);
    });
  }finally{store.close();}
});

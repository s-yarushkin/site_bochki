import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {openLeadStore} from '../server/lead-store.mjs';
import {validateBaniLead} from '../server/garant-bani-relay.mjs';
import {validateReadyLead,formatReadyLead,READY_PRICEBOOK} from '../server/quadro-ready.mjs';
import {createRelayHandler,loadRelayConfig} from '../server/garant-bani-relay.mjs';

const oldOrigin='https://garant.example';
const readyOrigin='https://quadro.example';
const config={allowedOrigin:oldOrigin,readyAllowedOrigin:readyOrigin,chatId:'-1',token:'test-not-a-secret'};
const leadInput=(sku='QR-5-READY',color='natural')=>({
  requestId:randomUUID(),flow:'quote',website:'',
  product:{sku,finishId:color},district:'Вологодский район',
  site:{base:'advice',access:'yes'},
  customer:{name:'Тест Клиент',phone:'8 999 123 45 67',contactChannel:'phone',comment:'Есть узкий въезд'},
  consent:{accepted:true,version:'quadro-ready-v1'},
  tracking:{utmSource:'direct',utmCampaign:'ready-search',landingPath:'/kvadro/'}
});
const legacy=()=>({
  flow:'callback',name:'Старый клиент',phone:'89991112233',consent:true,contactChannel:'phone'
});
function post(base,path,data,origin=readyOrigin){
  return fetch(base+path,{method:'POST',
    headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
}
async function withServer(handler,fn){
  const server=createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await fn('http://127.0.0.1:'+server.address().port);}
  finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
}
test('READY has exactly two fixed products, one package and server-only provisional price',()=>{
  const five=validateReadyLead({...leadInput(),priceRub:1,discount:999999});
  const six=validateReadyLead(leadInput('QR-6-READY','graphite'));
  assert.equal(five.estimate.total,749000);
  assert.equal(six.estimate.total,799000);
  assert.equal(five.estimate.pricebookStatus,'PROVISIONAL');
  assert.equal(five.estimate.foundationIncluded,false);
  assert.equal(five.estimate.options.length,0);
  assert.equal(five.sourceSite,'quadro-ready');
  assert.equal(six.configuration.finishName,'Графит');
  assert.equal(READY_PRICEBOOK.discountVerified,false);
  assert.match(formatReadyLead(six,{id:'GB-20261014-ABCD1234'}),/КВАДРО READY/);
  assert.match(formatReadyLead(six).replace(/\s/g,' '),/799 000 ₽/);
});
test('READY validator rejects unknown product, finish, missing consent and invalid numbers',()=>{
  const good=leadInput();
  assert.throws(()=>validateReadyLead({...good,product:{sku:'WRONG',finishId:'natural'}}),/INVALID_SKU/);
  assert.throws(()=>validateReadyLead({...good,product:{sku:'QR-5-READY',finishId:'red'}}),/INVALID_FINISH/);
  assert.throws(()=>validateReadyLead({...good,consent:{accepted:false,version:'quadro-ready-v1'}}),/CONSENT_REQUIRED/);
  assert.throws(()=>validateReadyLead({...good,customer:{...good.customer,phone:'+7 111 111 11 11'}}),/INVALID_PHONE/);
  for(const district of ['', '   ', 'А']){
    assert.throws(()=>validateReadyLead({...good,district}),/INVALID_DISTRICT/);
  }
  assert.throws(()=>validateReadyLead({...good,website:'bot-value'}),/SPAM_REJECTED/);
  assert.throws(()=>validateReadyLead({...good,flow:'callback',customer:{...good.customer,contactChannel:'max'}}),/CALLBACK_MUST_BE_PHONE/);
  assert.throws(()=>validateReadyLead({...good,site:{base:'impossible'}}),/INVALID_SITE/);
});
test('existing SQLite keeps historical source, READY SKU and SQL source filters',()=>{
  const store=openLeadStore(':memory:');
  try{
    const old=store.create(validateBaniLead(legacy()),randomUUID()).lead;
    const five=store.create(validateReadyLead(leadInput()),randomUUID()).lead;
    const six=store.create(validateReadyLead(leadInput('QR-6-READY','walnut')),randomUUID()).lead;
    assert.equal(old.sourceSite,'garant-bani');
    assert.equal(five.sourceSite,'quadro-ready');
    assert.equal(six.productSku,'QR-6-READY');
    assert.equal(store.list({site:'all'}).total,3);
    assert.equal(store.list({site:'quadro-ready'}).total,2);
    assert.equal(store.stats('garant-bani').total,1);
    assert.equal(store.stats('quadro-ready').byStatus.new,2);
    assert.equal(store.list({site:'quadro-ready',status:'won'}).total,0);
    assert.throws(()=>store.list({site:'forged'}),/INVALID_SITE_FILTER/);
    store.update(five.id,{status:'won',assignee:'Менеджер',managerNote:'КП принято'});
    assert.equal(store.stats('quadro-ready').byStatus.won,1);
    assert.equal(store.detail(old.id).events.length,1);
    assert.equal(store.detail(five.id).events.length,4);
  }finally{store.close();}
});
test('ready route only accepts its allowed Origin and source cannot be forged by caller',async()=>{
  const store=openLeadStore(':memory:');
  let notifications=0;
  try{
    await withServer(createRelayHandler({config,store,deliver:async()=>{notifications++;},log:()=>{}}),async base=>{
      const good=leadInput();
      const wrong=await post(base,'/api/leads/quadro-ready',good,oldOrigin);
      assert.equal(wrong.status,403);
      const injected=await post(base,'/api/leads/quadro-ready',{...good,sourceSite:'garant-bani'});
      assert.equal(injected.status,201);
      const data=await injected.json();
      assert.equal(data.persisted,true);
      assert.equal(data.notificationStatus,'delivered');
      assert.equal(store.get(data.leadId).sourceSite,'quadro-ready');
      const duplicate=await post(base,'/api/leads/quadro-ready',{...good,sourceSite:'garant-bani'});
      assert.equal(duplicate.status,200);
      assert.equal((await duplicate.json()).duplicate,true);
      assert.equal(store.stats().total,1);
      assert.equal(notifications,1);
      const changed=await post(base,'/api/leads/quadro-ready',{...good,product:{sku:'QR-6-READY',finishId:'natural'}});
      assert.equal(changed.status,409);
      assert.equal((await changed.json()).code,'REQUEST_ID_CONFLICT');
      const forgedLegacy=await post(base,'/api/lead',legacy(),readyOrigin);
      assert.equal(forgedLegacy.status,403);
    });
  }finally{store.close();}
});
test('MAX outage preserves READY lead and returns saved acknowledgement rather than false failure',async()=>{
  const store=openLeadStore(':memory:');
  try{
    await withServer(createRelayHandler({config,store,deliver:async()=>{throw Error('network outage');},log:()=>{}}),async base=>{
      const response=await post(base,'/api/leads/quadro-ready',leadInput());
      assert.equal(response.status,202);
      const body=await response.json();
      assert.equal(body.ok,true);
      assert.equal(body.persisted,true);
      assert.equal(body.notificationStatus,'failed');
      assert.equal(store.detail(body.leadId).notificationStatus,'failed');
      assert.equal(store.stats().total,1);
    });
  }finally{store.close();}
});
test('old flow and READY flow co-exist on one relay',async()=>{
  const store=openLeadStore(':memory:');
  try{
    await withServer(createRelayHandler({config,store,deliver:async()=>{},log:()=>{}}),async base=>{
      const old=await post(base,'/api/lead',{...legacy(),requestId:randomUUID()},oldOrigin);
      assert.equal(old.status,200);
      const ready=await post(base,'/api/leads/quadro-ready',leadInput());
      assert.equal(ready.status,201);
      assert.equal(store.list({site:'garant-bani'}).total,1);
      assert.equal(store.list({site:'quadro-ready'}).total,1);
    });
  }finally{store.close();}
});

test('READY refuses sending to MAX if persistent store is missing',async()=>{
  let sent=0;
  await withServer(createRelayHandler({config,deliver:async()=>{sent++;},log:()=>{}}),async base=>{
    const response=await post(base,'/api/leads/quadro-ready',leadInput());
    assert.equal(response.status,503);
    assert.equal((await response.json()).code,'STORAGE_UNAVAILABLE');
    assert.equal(sent,0);
  });
});

test('new IDN site origin is normalized to browser punycode',()=>{
  const env={HOST:'127.0.0.1',ALLOWED_ORIGIN:'https://preview.example',
    READY_ALLOWED_ORIGIN:'https://дачапар.рф',MAX_CHAT_ID:'-1',MAX_TOKEN_FILE:'/fake'};
  const configured=loadRelayConfig(env,()=> 'fake-test-token-value');
  assert.equal(configured.readyAllowedOrigin,new URL('https://дачапар.рф').origin);
  assert.throws(()=>loadRelayConfig({...env,READY_ALLOWED_ORIGIN:'https://дачапар.рф/unsafe'},()=> 'fake-test-token-value'),/UNSAFE_READY_ORIGIN/);
});

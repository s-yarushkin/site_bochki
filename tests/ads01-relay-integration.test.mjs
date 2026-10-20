// ADS-01 real server-owned conversion contract in isolated in-memory SQLite.
// No production network, real MAX calls, or real contacts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {createRelayHandler} from '../server/garant-bani-relay.mjs';
import {openLeadStore} from '../server/lead-store.mjs';
import {CONSENT_VERSION,CONSENT_METHOD} from '../assets/js/lead-consent.js';
import {PRICEBOOK} from '../data/pricebook.js';

const origin='https://ads01.example';
const config={allowedOrigin:origin,siteBasePath:'/',chatId:'-100001',token:'mock-only-do-not-send'};
const makeQuote=({city='Ногинск',modelId='kvadro-house',sizeId='6x6',requestId=randomUUID(),extras={}}={})=>({
  flow:'quote',name:'',phone:'+7 (921) 234-56-78',contactChannel:'phone',
  district:city,base:'unknown',access:'unknown',comment:'',
  configuration:{modelId,sizeId,optionIds:[],bundleId:null,pricebookVersion:PRICEBOOK.version,finish:'pine',roof:'brown'},
  consent:true,consentVersion:CONSENT_VERSION,consentMethod:CONSENT_METHOD,
  requestId,...extras
});
async function withRelay({deliveryFails=false}={},fn){
  const store=openLeadStore(':memory:');
  let sends=0;
  const handler=createRelayHandler({config,store,log:()=>{},
    deliver:async()=>{sends++;if(deliveryFails && sends===1)throw new Error('LOCAL_MAX_OFFLINE');}});
  const server=createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const endpoint='http://127.0.0.1:'+server.address().port+'/api/lead';
  async function post(payload){
    const response=await fetch(endpoint,{method:'POST',
      headers:{Origin:origin,'Content-Type':'application/json'},
      body:JSON.stringify(payload)});
    return {status:response.status,body:await response.json()};
  }
  try {await fn({post,store,sends:()=>sends});}
  finally {
    await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    store.close();
  }
}
test('ADS-01 end to end: three allowed cities produce the expensive confirmed lead only for server priced quote',async()=>{
  for(const city of ['Ногинск','Королёв','Королев','Ивантеевка','Московская область, г. Ивантеевка']){
    await withRelay({},async({post,store,sends})=>{
      const payload=makeQuote({city,extras:{total:99999999,premiumQualified:false}});
      const response=await post(payload);
      assert.equal(response.status,200,city+JSON.stringify(response.body));
      assert.equal(response.body.ok,true);
      assert.equal(response.body.delivered,true);
      assert.deepEqual(response.body.analytics,{persisted:true,premiumQualified:true,detailedQualified:false});
      assert.equal(response.body.leadId.startsWith('GB-'),true);
      assert.equal(sends(),1);
      const row=store.byRequest(payload.requestId);
      assert.equal(row.detail.estimate.total,946000);
      assert.equal(row.notificationStatus,'delivered');
      assert.equal(row.detail.district,city);
    });
  }
});
test('ADS-01 end to end: low value and wrong city do not qualify even if client forges high value',async()=>{
  for(const data of [
    {city:'Москва',modelId:'kvadro-house',sizeId:'6x6'},
    {city:'Ногинский район',modelId:'kvadro-house',sizeId:'6x6'},
    {city:'Ногинск',modelId:'kvadro',sizeId:'500'},
    {city:'Москва, Королев',modelId:'kvadro-house',sizeId:'6x6'}]){
    await withRelay({},async({post})=>{
      const req=makeQuote({...data,extras:{total:99000000,premiumQualified:true,analytics:{premiumQualified:true}}});
      const {status,body}=await post(req);
      assert.equal(status,200);
      assert.equal(body.analytics.persisted,true);
      assert.equal(body.analytics.premiumQualified,false);
    });
  }
});
test('ADS-01 end to end: idempotent duplicate and MAX failure / retry',async()=>{
  await withRelay({},async({post,store,sends})=>{
    const payload=makeQuote();
    const a=await post(payload),b=await post(payload);
    assert.equal(a.status,200);
    assert.equal(a.body.analytics.premiumQualified,true);
    assert.equal(b.status,200);
    assert.equal(b.body.duplicate,true);
    assert.equal(sends(),1);
    assert.equal(store.stats().total,1);
  });
  await withRelay({deliveryFails:true},async({post,store,sends})=>{
    const payload=makeQuote({city:'Королёв'});
    const first=await post(payload);
    assert.equal(first.status,502);
    assert.equal(first.body.ok,false);
    assert.equal(first.body.analytics,undefined);
    const pending=store.byRequest(payload.requestId);
    assert.equal(pending.notificationStatus,'failed');
    const retry=await post(payload);
    assert.equal(retry.status,200);
    assert.equal(retry.body.analytics.premiumQualified,true);
    assert.equal(store.byRequest(payload.requestId).notificationStatus,'delivered');
    assert.equal(sends(),2);
    assert.equal(store.stats().total,1);
  });
});
test('ADS-01 end to end: call-back and payload invalid cannot become premium lead',async()=>{
  await withRelay({},async({post,store})=>{
    const p=makeQuote({city:'Ногинск'});
    const missingConsent=await post({...p,consent:false});
    assert.equal(missingConsent.status,400);
    assert.equal(store.stats().total,0);
    const wrong=await post({...p,configuration:{...p.configuration,sizeId:'999'}});
    assert.equal(wrong.status,400);
    assert.equal(store.stats().total,0);
    const cb=await post({flow:'callback',name:'',phone:'+7 (921) 234-56-78',
      contactChannel:'phone',consent:true,consentVersion:CONSENT_VERSION,
      consentMethod:CONSENT_METHOD,requestId:randomUUID()});
    assert.equal(cb.status,200);
    assert.equal(cb.body.analytics.premiumQualified,false);
  });
});
test('ADS-01 attribution server rejects untrusted free text and raw URLs without leaking to MAX',async()=>{
  await withRelay({},async({post,store})=>{
    const p=makeQuote({city:'Ногинск',extras:{
      attribution:{first:{utm_source:'yandex',utm_campaign:'bani_1',yclid:'123-A',
        utm_term:'private@example.com',landing:'/bani/kvadro/',referrer:'yandex',evil:'SHOULD_NOT_STORE'},
        last:{utm_campaign:'http://site?phone=7999',utm_medium:'cpc'}}
    }});
    const result=await post(p);
    assert.equal(result.status,200);
    const value=store.byRequest(p.requestId).detail.attribution;
    assert.equal(value.first.utm_source,'yandex');
    assert.equal(value.first.yclid,'123-A');
    assert.equal(value.first.utm_term,undefined);
    assert.equal(value.first.evil,undefined);
    assert.deepEqual(value.last,{utm_medium:'cpc'}); // safe valid field is retained; injected URL is discarded.
    assert.equal(value.first.landing,'/bani/kvadro/');
  });
});

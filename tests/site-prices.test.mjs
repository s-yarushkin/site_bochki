import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importSitePrices,updateStaticPrices} from '../scripts/import-site-prices.mjs';
import {PRICEBOOK,CATALOG} from '../data/pricebook.js';
import {LEGACY_V72_PRICEBOOK} from '../data/legacy-v72-pricebook.js';
import {PRICEBOOK as LEGACY_SITE_V1_PRICEBOOK} from '../data/legacy-site-v1-pricebook.js';
import {calculateQuote} from '../assets/js/quote-engine.js';
import {validateBaniLead,formatBaniLead,createRelayHandler,loadRelayConfig} from '../server/garant-bani-relay.mjs';
import {openLeadStore} from '../server/lead-store.mjs';
import {createServer,request} from 'node:http';
const read=name=>JSON.parse(readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const source=read('data/source/site-prices-2026-10-16.json');
const old=read('data/legacy-v72-catalog.json');
const lead=(version)=>({flow:'quote',name:'Тест изолированный',phone:'+79991234567',district:'Тестовый участок',base:'ready',access:'yes',consent:true,consentVersion:'2026-10-14',configuration:{modelId:'kvadro',sizeId:'500',optionIds:[],bundleId:null,finish:'pine',roof:'brown',...(version?{pricebookVersion:version}:{})}});
test('website matrix uses 20 new equipped base prices and removed low-value extras',()=>{
 const expected={kvadro:{400:389298,450:435770,500:500955,550:523541,600:538566},parus:{400:412230,450:451170,500:508200,550:529620,600:542220},viking:{400:447330,450:519540,500:605475,550:650580,600:668220},'kvadro-house':{'4x4':589875,'5x4':688875,'6x4':731625,'6x5':793500,'6x6':856500}};
 assert.deepEqual(CATALOG.prices,expected);
 assert.equal(CATALOG.options.stove_guard.unitPriceRub,5850);
 assert.equal(CATALOG.options.folding_table.unitPriceRub,5265);
 assert.equal(CATALOG.options.bench_chest_spruce.unitPriceRub,4095);
 assert.equal(CATALOG.options.socket_kit_owner,undefined);
 assert.equal(CATALOG.checks.bundleTotalRub,613977);
 assert.equal(CATALOG.checks.quoteRequired,false);
 assert.deepEqual(importSitePrices(source,old),read('data/legacy-site-v1-catalog.json'));
});
test('import rejects missing/zero/non-integer site price, duplicate rows and wrong column',()=>{
 for(const bad of [null,0,-1,'505000',505000.5]){
  const s=structuredClone(source);s.rows.find(r=>r.row===227).sitePriceRub=bad;
  assert.throws(()=>importSitePrices(s,old),/SITE_PRICE_REQUIRED/);
 }
 const missing=structuredClone(source);missing.rows=missing.rows.filter(r=>r.row!==227);assert.throws(()=>importSitePrices(missing,old),/BASE_ROW_NOT_UNIQUE/);
 const duplicate=structuredClone(source);duplicate.rows.push(duplicate.rows.find(r=>r.row===227));assert.throws(()=>importSitePrices(duplicate,old),/NOT_UNIQUE/);
 assert.throws(()=>importSitePrices({...source,column:'D'},old),/WRONG_SOURCE_COLUMN/);
 const absent=structuredClone(source);absent.rows.find(r=>r.name==='Ограждение печи').sitePriceRub=null;assert.throws(()=>importSitePrices(absent,old),/SITE_PRICE_REQUIRED/);
});
test('relay recalculates current version, retains old tabs and rejects an unknown price version',()=>{
 const fresh=validateBaniLead(lead(PRICEBOOK.version));assert.equal(fresh.estimate.total,500955);
 assert.equal(validateBaniLead(lead()).estimate.total,370000);
 assert.equal(validateBaniLead(lead(LEGACY_V72_PRICEBOOK.version)).estimate.total,370000);
 assert.equal(validateBaniLead(lead(LEGACY_SITE_V1_PRICEBOOK.version)).estimate.total,505000);
 assert.throws(()=>validateBaniLead(lead('untrusted-version')),/PRICEBOOK_VERSION_UNSUPPORTED/);
 const fake=lead(PRICEBOOK.version);fake.configuration.total=1;fake.configuration.basePrice=1;
 assert.equal(validateBaniLead(fake).estimate.total,500955);
 assert.match(formatBaniLead(fresh),/500\s?955/);
 for(const [modelId,prices] of Object.entries(CATALOG.prices))for(const [sizeId,value] of Object.entries(prices)){
  const input=lead(PRICEBOOK.version);input.configuration={...input.configuration,modelId,sizeId};assert.equal(validateBaniLead(input).estimate.total,value);
 }
 const input=lead(PRICEBOOK.version);input.configuration.optionIds=PRICEBOOK.bundle.optionIds;input.configuration.bundleId=PRICEBOOK.bundle.id;
 assert.equal(validateBaniLead(input).estimate.total,calculateQuote({optionIds:PRICEBOOK.bundle.optionIds,bundleId:PRICEBOOK.bundle.id}).total);
});
test('isolated HTTP lead flow keeps new and old totals in memory and delivers through an injected fake transport',async()=>{
 const store=openLeadStore(':memory:');const accepted=[];
 const config=loadRelayConfig({HOST:'127.0.0.1',PORT:'3301',ALLOWED_ORIGIN:'https://xn--80aaan1dh9b.xn--p1ai',SITE_BASE_PATH:'/',MAX_CHAT_ID:'123',MAX_TOKEN_FILE:'/isolated/token'},()=> 'isolated-secret-token-with-length');
 const handler=createRelayHandler({config,store,deliver:async lead=>{accepted.push(lead.estimate.total);return {ok:true}},log:()=>{}});
 const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  for(const version of [PRICEBOOK.version,undefined]){
   const res=await new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port:server.address().port,path:'/api/lead',method:'POST',headers:{host:'xn--80aaan1dh9b.xn--p1ai',origin:config.allowedOrigin,'content-type':'application/json'}},res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}));});
    req.on('error',reject);req.end(JSON.stringify({...lead(version),requestId:crypto.randomUUID()}));
   });
   assert.equal(res.status,200);assert.equal(res.body.ok,true);
  }
  assert.deepEqual(accepted,[500955,370000]);assert.equal(store.stats().total,2);
 }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});

test('HTML renders updated base and quotation-only bundle before JavaScript',()=>{
 const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(home,/Квадро 5 м · Комфорт/);
 assert.match(home,/id="bundleNew">613 977 ₽/);
 assert.match(home,/id="quoteTotal">500 955 ₽/);
 assert.doesNotMatch(home,/Готовый комплект за 630 000 ₽/);
});
test('server prices the featured kit with one consistent customer total',()=>{
 const x=lead(PRICEBOOK.version);
 x.configuration.optionIds=[...PRICEBOOK.bundle.optionIds];x.configuration.bundleId=PRICEBOOK.bundle.id;
 const checked=validateBaniLead(x);
 assert.equal(checked.estimate.total,613977);
 assert.match(formatBaniLead(checked),/613\s?977/);
});

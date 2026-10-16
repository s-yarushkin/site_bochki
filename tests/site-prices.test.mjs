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
test('website matrix uses 20 owner-approved public base totals and quote-only unmatched options',()=>{
 const expected={kvadro:{400:361998,450:407420,500:471555,550:494141,600:509166},parus:{400:396630,450:434970,500:491400,550:512820,600:525420},viking:{400:396630,450:464940,500:552825,550:595980,600:613620},'kvadro-house':{'4x4':574875,'5x4':673875,'6x4':716625,'6x5':778500,'6x6':841500}};
 assert.deepEqual(CATALOG.prices,expected);
 assert.equal(CATALOG.options.stove_guard.unitPriceRub,5850);
 assert.equal(CATALOG.options.folding_table.unitPriceRub,5265);
 assert.equal(CATALOG.options.bench_chest_spruce.unitPriceRub,null);
 assert.equal(CATALOG.options.socket_kit_owner.unitPriceRub,null);
 assert.equal(CATALOG.checks.knownSubtotalRub,null);
 assert.equal(CATALOG.checks.quoteRequired,true);
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
 const fresh=validateBaniLead(lead(PRICEBOOK.version));assert.equal(fresh.estimate.total,471555);
 assert.equal(validateBaniLead(lead()).estimate.total,370000);
 assert.equal(validateBaniLead(lead(LEGACY_V72_PRICEBOOK.version)).estimate.total,370000);
 assert.equal(validateBaniLead(lead(LEGACY_SITE_V1_PRICEBOOK.version)).estimate.total,505000);
 assert.throws(()=>validateBaniLead(lead('untrusted-version')),/PRICEBOOK_VERSION_UNSUPPORTED/);
 const fake=lead(PRICEBOOK.version);fake.configuration.total=1;fake.configuration.basePrice=1;
 assert.equal(validateBaniLead(fake).estimate.total,471555);
 assert.match(formatBaniLead(fresh),/471\s?555/);
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
  assert.deepEqual(accepted,[471555,370000]);assert.equal(store.stats().total,2);
 }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});

test('HTML renders updated base and quotation-only bundle before JavaScript',()=>{
 const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(home,/Готовый комплект — стоимость по расчёту/);
 assert.match(home,/id="bundleNew">По запросу/);
 assert.match(home,/id="quoteTotal">471 555 ₽/);
 assert.doesNotMatch(home,/Готовый комплект за 630 000 ₽/);
});
test('server preserves quote inquiry for an unpriced option rather than inventing 0 ₽',()=>{
 const x=lead(PRICEBOOK.version);
 x.configuration.optionIds=['socket_kit_owner'];
 const checked=validateBaniLead(x);
 assert.equal(checked.estimate.total,null);
 assert.match(formatBaniLead(checked),/ИТОГО: По запросу/);
});

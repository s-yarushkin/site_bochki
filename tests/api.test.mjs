import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createServer} from 'node:http';import {randomUUID} from 'node:crypto';
import {loadTestAPI} from '../scripts/test-api.mjs';import {buildLead,buildCallback,submitLead} from '../web/lead-client.mjs';import {selectPlan} from '../web/journey-state.mjs';
const {validateBaniLead,formatBaniLead,createRelayHandler,openLeadStore}=await loadTestAPI();const book=JSON.parse(readFileSync(new URL('../web/data/catalog-pricebook.json',import.meta.url)));
const fields={phone:'+79990000001',channel:'telegram',name:'Local test',settlement:'Test'};
const selection=selectPlan(book,book.r85.plans[0],true);const quote=()=>buildLead(book,selection,fields,randomUUID());const callback=()=>buildCallback(fields,randomUUID());
test('old quote and plan_info contracts remain valid',()=>{assert.equal(validateBaniLead(quote()).configuration.selection.planId,'p1');const p=callback();p.purpose='plan_info';p.contactChannel='telegram';p.planRequest={id:'p1',mirror:true};assert.equal(validateBaniLead(p).planRequest.mirror,true);});
test('callback keeps a server-calculated variant and exact photo, without becoming a quote',()=>{const p=callback();p.journeyContext={purpose:'photo',pagePath:'/',reference:{model:'kvadro',objectId:'timber-graphite',photoId:'kq-06'},configuration:quote().configuration};p.attribution={first:{utm_campaign:'Бани для дачи',landing:'/'},clientId:'123456789012345678'};const lead=validateBaniLead(p);assert.equal(lead.flow,'callback');assert.equal(lead.estimate,undefined);assert.equal(lead.journeyContext.variant.estimate.total,410000);assert.equal(lead.journeyContext.variant.configuration.selection.mirror,true);assert.equal(lead.attribution.first.utm_campaign,'Бани для дачи');assert.ok(formatBaniLead(lead).includes('kq-06'));});
test('server rejects invented references and ignores client prices',()=>{const p=quote();p.configuration.total=1;assert.equal(validateBaniLead(p).estimate.total,410000);p.journeyContext={purpose:'photo',reference:{model:'kvadro',objectId:'invented',photoId:'<script>'}};assert.throws(()=>validateBaniLead(p),/UNKNOWN_PHOTO/);});
test('real HTTP handler persists, delivers through stub, confirms and deduplicates',async()=>{const store=openLeadStore(':memory:');let delivered=0;let origin;const handler=createRelayHandler({config:{allowedOrigin:'http://127.0.0.1',siteBasePath:'/'},store,deliver:async()=>{delivered++},log:()=>{}});const server=createServer((req,res)=>{req.headers.origin='http://127.0.0.1';return handler(req,res)});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;try{const payload=quote(),settings={lead:{enabled:true,endpoint:'/api/lead',allowedOrigins:[origin],requiredPricebookVersion:book.version}};const transport=(url,options)=>fetch(new URL(url,origin),options);const first=await submitLead(payload,settings,origin,transport);assert.equal(first.confirmed,true);assert.equal(store.list().total,1);assert.equal(store.byRequest(payload.requestId).notificationStatus,'delivered');assert.equal(store.byRequest(payload.requestId).detail.configuration.selection.mirror,true);const second=await submitLead(payload,settings,origin,transport);assert.equal(second.duplicate,true);assert.equal(delivered,1);}finally{await new Promise(resolve=>server.close(resolve));}});

test('quiz catalog request accepts chosen MAX, WhatsApp or Telegram; other callbacks remain protected',()=>{
 for(const channel of ['max','whatsapp','telegram']){
  const payload=callback();
  payload.purpose='quiz_catalog';payload.contactChannel=channel;
  payload.comment='Квиз: планировки DP-PL-002, DP-PL-005, 3–4 человека';
  payload.journeyContext={purpose:'selection_help',pagePath:'/'};
  const lead=validateBaniLead(payload);
  assert.equal(lead.flow,'callback');
  assert.equal(lead.purpose,'quiz_catalog');
  assert.equal(lead.contactChannel,channel);
  assert.equal(lead.estimate,undefined);
  assert.match(formatBaniLead(lead),/Подбор бань: планировки и комплектации/);
  assert.match(formatBaniLead(lead),new RegExp(channel==='max'?'MAX':channel==='telegram'?'Telegram':'WhatsApp'));
 }
 const noPurpose=callback();noPurpose.contactChannel='whatsapp';
 assert.throws(()=>validateBaniLead(noPurpose),/CALLBACK_MUST_BE_PHONE/);
 const invalid=callback();invalid.purpose='quiz_catalog';invalid.contactChannel='phone';
 assert.throws(()=>validateBaniLead(invalid),/INVALID_QUIZ_REQUEST/);
 const bogus=callback();bogus.purpose='quiz_catalog';bogus.contactChannel='max';bogus.configuration=quote().configuration;
 assert.throws(()=>validateBaniLead(bogus),/INVALID_QUIZ_REQUEST/);
});

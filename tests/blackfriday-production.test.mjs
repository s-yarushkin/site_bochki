import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {CAMPAIGN,campaignPhase,campaignQuote,campaignChoiceQuote} from '../web/campaigns/blackfriday.mjs';
import {normalize} from '../web/blackfriday/state.mjs';
import {campaignLeadFields} from '../web/blackfriday/lead-data.mjs';
import {buildCallback,submitLead} from '../web/lead-client.mjs';
import {loadTestAPI} from '../scripts/test-api.mjs';
const active=Date.parse('2026-11-11T12:00:00+03:00');
const {validateBaniLead,formatBaniLead,createRelayHandler,openLeadStore}=await loadTestAPI();
test('promotion starts and ends at midnight Moscow, including all of November 21',()=>{
 const start=Date.parse(CAMPAIGN.start),end=Date.parse(CAMPAIGN.end);
 assert.equal(new Date(start).toISOString(),'2026-11-10T21:00:00.000Z');
 assert.equal(campaignPhase(start-1),'upcoming');assert.equal(campaignPhase(start),'active');
 assert.equal(campaignPhase(end-1),'active');assert.equal(campaignPhase(end),'ended');
 const upcoming=campaignQuote('parus','550','deluxe',{now:start-1,previewUpcoming:true});
 assert.equal(upcoming.priceRub,649000);assert.equal(upcoming.discountRub,35000);
 assert.equal(campaignQuote('parus','550','deluxe',{now:end,previewUpcoming:true}).discountRub,0);
 assert.equal(campaignQuote('parus','550','deluxe',{now:end}).priceRub,684000);
});
test('all 40 catalog and landing prices match; no additional Deluxe discount',()=>{
 const book=JSON.parse(readFileSync(new URL('../web/choice/catalog-pricebook.json',import.meta.url),'utf8'));
 const expected={kvadro:{comfort:25000,deluxe:35000},parus:{comfort:30000,deluxe:35000},viking:{comfort:30000,deluxe:35000},'kvadro-house':{comfort:45000,deluxe:55000}};
 assert.equal(CAMPAIGN.rows.length,40);
 for(const row of CAMPAIGN.rows){
  const state={model:row.model,size:row.size,package:row.package};
  const catalog=campaignChoiceQuote(book,state,{now:active}),landing=campaignQuote(row.model,row.size,row.package,{now:active});
  assert.deepEqual(catalog,landing);assert.equal(landing.discountRub,expected[row.model][row.package]);assert.equal(landing.priceRub,row.source-5000);
 }
 book.r85.models.parus.sizes['550'].deluxe.priceRub+=1000;
 assert.equal(campaignChoiceQuote(book,{model:'parus',size:'550',package:'deluxe'},{now:active}),null);
});
test('switching to House cannot retain a linear bath size',()=>{
 assert.deepEqual(normalize({model:'kvadro-house',size:'550',package:'deluxe'}),{model:'kvadro-house',size:'4x4',package:'deluxe'});
});
const payload=(channel='max')=>{
 const state={model:'parus',size:'550',package:'deluxe'},q=campaignQuote('parus','550','deluxe',{now:active});
 return {...buildCallback({phone:'+79990000001'},randomUUID()),...campaignLeadFields(state,q,'model',channel),intentContext:{version:'request-intent-20261109',entry:'model_offer',pagePath:'/blackfriday/',selection:state,sources:{model:'explicit',size:'default',package:'explicit'},channelSource:'default'}};
};
test('all contact channels pass existing API validation and MAX shows campaign, correct price and provenance',()=>{
 for(const channel of ['max','telegram','whatsapp','phone']){
  const lead=validateBaniLead(payload(channel)),text=formatBaniLead(lead);
  assert.equal(lead.contactChannel,channel);assert.ok(lead.comment.length<=500);
  assert.match(text,/ЧЁРНАЯ ПЯТНИЦА/);assert.match(text,/649000/);assert.match(text,/35000/);assert.doesNotMatch(text,/20000|629000/);
  assert.match(text,/Клиент выбрал на странице/);assert.match(text,/На экране по умолчанию/);assert.match(text,/\/blackfriday\//);
 }
});
test('real lead handler persists, confirms, delivers once through a stub and deduplicates',async()=>{
 const store=openLeadStore(':memory:');let delivered=0;
 const handler=createRelayHandler({config:{allowedOrigin:'http://127.0.0.1',siteBasePath:'/'},store,deliver:async()=>{delivered++;},log:()=>{}});
 const server=createServer((req,res)=>{req.headers.origin='http://127.0.0.1';return handler(req,res);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 try{
  const p=payload(),settings={lead:{enabled:true,endpoint:'/api/lead',allowedOrigins:[origin]}},transport=(url,options)=>fetch(new URL(url,origin),options);
  const first=await submitLead(p,settings,origin,transport);assert.equal(first.confirmed,true);
  const second=await submitLead(p,settings,origin,transport);assert.equal(second.duplicate,true);assert.equal(delivered,1);
  assert.equal(store.byRequest(p.requestId).notificationStatus,'delivered');assert.equal(store.byRequest(p.requestId).detail.intentContext.selection.package,'deluxe');
 }finally{await new Promise(resolve=>server.close(resolve));store.close?.();}
});

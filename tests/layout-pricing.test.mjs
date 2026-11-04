import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quoteLayout,quizLayoutQuote} from '../concepts/bath-choice/layout-pricing.mjs';
const base={priceCents:41000000,roomCount:2,included:{bench:2,OPT_46:1}};
const catalog={approval:'approved',models:{kvadro:{sizes:{400:{comfort:base,deluxe:{...base,priceCents:51900000}}}}},roomUnitCents:{standard:1354050,house:1481550},items:{OPT_46:{customerUnitCents:{standard:216648}},extraBench:{customerUnitCents:{standard:200000}}}};
const bill={id:'01-kvadro',geometryId:'dp3d-01',dimensionSha256:'verified',geometryDimensionSha256:'verified',model:'kvadro',size:'400',roomCount:2,approval:'approved',lines:[]};

test('additional rooms exclude the rooms already in the package',()=>{
 const q=quoteLayout(catalog,{...bill,roomCount:3},'comfort');
 assert.equal(q.publicTotalCents,42354050);assert.equal(q.lines[0].quantity,1);
});
test('a paid included shelf is never charged again; only an extra quantity is charged',()=>{
 const lines=[{id:'shelf',label:'Полок',status:'resolved',operation:'extra',sku:'OPT_46',quantity:2}];
 const q=quoteLayout(catalog,{...bill,lines},'comfort');
 assert.equal(q.publicTotalCents,41216648);assert.equal(q.lines[1].coveredQuantity,1);
});
test('unknown items and unresolved room baselines never become zero-price final offers',()=>{
 const lines=[{id:'toilet',label:'Унитаз',status:'unconfirmed',candidates:['OPT_151']}];
 const q=quoteLayout(catalog,{...bill,lines},'comfort');
 assert.equal(q.calculatedTotalCents,null);assert.equal(q.publicTotalCents,null);
 assert.equal(q.knownSubtotalCents,41000000);
 const c=structuredClone(catalog);c.models.kvadro.sizes[400].comfort.roomCount=null;
 assert.equal(quoteLayout(c,bill,'comfort').status,'incomplete');
});
test('an included furniture allowance cannot cover a third bench',()=>{
 const lines=[{id:'benches',status:'resolved',operation:'included',inclusionKey:'bench',quantity:3}];
 assert.equal(quoteLayout(catalog,{...bill,lines},'comfort').publicTotalCents,null);
});
test('owner-excluded furniture stays a separate agreement and never becomes a free included item',()=>{
 const lines=[{id:'bed',label:'Кровать',status:'resolved',operation:'separate_agreement'}];
 const q=quoteLayout(catalog,{...bill,lines},'comfort');
 assert.equal(q.publicTotalCents,base.priceCents);
 assert.equal(q.separateAgreementItems[0].totalCents,null);
 assert.equal(q.separateAgreementItems[0].separateAgreement,true);
 assert.equal(q.lines.find(i=>i.id==='bed').included,undefined);
});
test('the approved kitchen is charged once and its sink needs that paid bundle',()=>{
 const decision=JSON.parse(readFileSync(new URL('../concepts/bath-choice/pricing-decisions.json',import.meta.url)));
 const c=structuredClone(catalog);c.items[decision.kitchen.sku]={customerUnitCents:{standard:decision.kitchen.customerRub*100,house:decision.kitchen.customerRub*100}};
 const sink={id:'sink',label:'Мойка кухни',status:'resolved',operation:'bundle_part',bundleLineId:'kitchen',bundleSku:decision.kitchen.sku};
 const kitchen={id:'kitchen',label:'Кухня',status:'resolved',operation:'extra',sku:decision.kitchen.sku};
 const q=quoteLayout(c,{...bill,lines:[sink,kitchen]},'comfort');
 assert.equal(q.publicTotalCents,44790000);assert.equal(q.lines.find(i=>i.id==='sink').bundledWith,'kitchen');
 assert.equal(q.separateAgreementItems.length,0);
 const absent=quoteLayout(c,{...bill,lines:[sink]},'comfort');assert.equal(absent.publicTotalCents,null);assert.ok(absent.pending.some(i=>i.code==='BUNDLE_NOT_COVERED'));
 assert.equal(quoteLayout(c,{...bill,lines:[sink,{...sink,id:'second-sink'},kitchen]},'comfort').publicTotalCents,null);
});
test('prices cannot silently transfer to a different geometry revision or unknown body size',()=>{
 assert.throws(()=>quoteLayout(catalog,{...bill,dimensionSha256:'changed'},'comfort'),/REVISION/);
 assert.throws(()=>quoteLayout(catalog,{...bill,size:'6x3'},'comfort'),/UNKNOWN_MODEL_SIZE/);
});
test('the quiz uses the same exact bill and declines unmapped older plans',()=>{
 assert.deepEqual(quizLayoutQuote(catalog,[bill],{old:bill.id},'old','deluxe'),quoteLayout(catalog,bill,'deluxe'));
 assert.equal(quizLayoutQuote(catalog,[bill],{},'missing','comfort').publicTotalCents,null);
 const unapproved=quoteLayout(catalog,{...bill,approval:'draft'},'comfort');
 assert.equal(unapproved.calculatedTotalCents,41000000);assert.equal(unapproved.publicTotalCents,null);
});
test('the owner-approved House baseline does not charge its existing three or four rooms again',()=>{
 const decision=JSON.parse(readFileSync(new URL('../concepts/bath-choice/pricing-decisions.json',import.meta.url)));
 assert.deepEqual(decision.houseIncludedRooms,{'4x4':3,'5x4':3,'6x4':3,'6x5':4,'6x6':4});
 const c=structuredClone(catalog);c.models['kvadro-house']={sizes:{}};
 for(const [size,rooms] of Object.entries(decision.houseIncludedRooms)){
  c.models['kvadro-house'].sizes[size]={comfort:{...base,roomCount:rooms},deluxe:{...base,roomCount:rooms}};
  for(const pack of decision.appliesToPackages){
   const q=quoteLayout(c,{...bill,model:'kvadro-house',size,roomCount:rooms},pack);
   assert.equal(q.lines[0].quantity,0);assert.equal(q.publicTotalCents,base.priceCents);
  }
 }
 const extra=quoteLayout(c,{...bill,model:'kvadro-house',size:'6x6',roomCount:5},'comfort');
 assert.equal(extra.publicTotalCents,42481550);
});

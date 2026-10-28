import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {comfortSelection,comfortPrice,inquiryPayload,selectionLink,safeReference} from '../output/r101-site/r101/state.mjs';
import {loadTestAPI} from '../scripts/test-api.mjs';
const {validateBaniLead,formatBaniLead}=await loadTestAPI();
const book=JSON.parse(readFileSync(new URL('../web/data/catalog-pricebook.json',import.meta.url)));
const photos=JSON.parse(readFileSync(new URL('../web/data/photo-references.json',import.meta.url)));
const fields={phone:'+79990000001',name:'Local R101 QA',channel:'max',settlement:'Тестовый участок',comment:'Тест без реальной отправки'};
test('all 20 displayed Comfort prices equal independent server estimates without optional plans',()=>{
 let count=0;for(const [model,prices] of Object.entries(book.prices))for(const [size,expected] of Object.entries(prices)){
  const s=comfortSelection(book,{model,size,package:'deluxe',options:['OPT_95'],planId:'p9',mirror:true});
  assert.equal(s.package,'comfort');assert.equal(s.planId,null);assert.equal(s.mirror,false);assert.deepEqual(s.options,[]);
  assert.equal(comfortPrice(book,s),expected,model+' '+size);
  const lead=validateBaniLead(inquiryPayload(book,s,fields,{purpose:'delivery'},randomUUID()));
  assert.equal(lead.estimate.total,expected);assert.equal(lead.contactChannel,'max');assert.equal(lead.configuration.selection.planId,null);count++;
 }assert.equal(count,20);
});
test('no-model inquiry remains an honest callback, preserving site and question context',()=>{
 const lead=validateBaniLead(inquiryPayload(book,null,fields,{purpose:'selection_help',pagePath:'/kontakty/'},randomUUID()));
 assert.equal(lead.flow,'callback');assert.equal(lead.configuration,undefined);assert.equal(lead.contactChannel,'phone');assert.match(lead.comment,/Тестовый участок/);
});
test('photo orientation is exact and server validated; unknown reference never becomes a real work',()=>{
 const s=comfortSelection(book,{model:'kvadro',size:'500'});const r=safeReference(photos,'kq-08','kvadro');
 assert.equal(safeReference(photos,'kq-08','viking'),null);
 const lead=validateBaniLead(inquiryPayload(book,s,fields,{purpose:'photo',reference:r},randomUUID()));
 assert.equal(lead.journeyContext.reference.photoId,'kq-08');assert.match(formatBaniLead(lead),/kq-08/);
});
test('withdrawn plans cannot enter a new request; valid plan is only an optional comment',()=>{
 const s=comfortSelection(book,{model:'kvadro-house',size:'4x4'});
 const p=inquiryPayload(book,s,fields,{purpose:'plan',plan:{id:'p9',model:s.model,size:s.size}},randomUUID());assert.doesNotMatch(p.comment,/p9/);assert.equal(p.configuration.selection.planId,null);
 const k=comfortSelection(book,{model:'kvadro',size:'400'});const q=inquiryPayload(book,k,fields,{purpose:'plan',plan:{id:'p1',model:k.model,size:k.size}},randomUUID());assert.match(q.comment,/p1/);assert.equal(validateBaniLead(q).estimate.total,410000);
});
test('shared link has only model and size, no personal or obsolete configuration',()=>{
 assert.equal(selectionLink('https://дачапар.рф',{model:'kvadro-house',size:'6x4'}),'https://xn--80aaan1dh9b.xn--p1ai/bani/kvadro-haus/?size=6x4');
 assert.equal(comfortSelection(book,{model:'<script>'}),null);
});

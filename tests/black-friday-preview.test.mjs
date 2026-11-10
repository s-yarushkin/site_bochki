import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import '../concepts/black-friday-2026/v4/core.js';
const core=globalThis.BFPreview,read=rel=>readFileSync(new URL('../'+rel,import.meta.url),'utf8'),data=JSON.parse(read('concepts/black-friday-2026/proposed-prices.json'));
test('all 40 prices use only the specified Black Friday discount',()=>{
 const expected={kvadro:{comfort:25000,deluxe:35000},parus:{comfort:30000,deluxe:35000},viking:{comfort:30000,deluxe:35000},'kvadro-house':{comfort:45000,deluxe:55000}};
 let checked=0;
 for(const model of core.models)for(const option of core.sizes(data,model)){
  const state=core.normalize(data,{model,size:option.id});
  for(const [key,quote]of Object.entries(core.prices(data,state))){
   assert.equal(quote.model,model);assert.equal(quote.size,option.id);assert.equal(quote.package,key);
   assert.equal(quote.discountRub,expected[model][key]);assert.equal(quote.additionalDeluxeDiscountRub,0);
   assert.equal(quote.finalPriceRub,quote.proposedReferencePriceRub-expected[model][key]);
   assert.equal(quote.finalPriceRub,quote.currentDisplayedPriceRub-5000);checked++;
  }
 }
 assert.equal(checked,40);
});
test('switching models cannot leave a size or price from an incompatible model',()=>{const state=core.normalize(data,{model:'kvadro-house',size:'550',package:'deluxe'});assert.equal(state.size,'4x4');const prices=core.prices(data,state);assert.equal(prices.comfort.finalPriceRub,680000);assert.equal(prices.deluxe.finalPriceRub,825000);assert.equal(core.quote(data,state).package,'deluxe');assert.throws(()=>core.quote(data,{model:'parus',size:'4x4',package:'comfort'}));});
test('Parus 5.5 m Deluxe is 684000 minus 35000 = 649000',()=>{const state=core.normalize(data,{model:'parus',size:'550'}),q=core.prices(data,state);assert.deepEqual([q.comfort.proposedReferencePriceRub,q.comfort.discountRub,q.comfort.finalPriceRub],[550000,30000,520000]);assert.deepEqual([q.deluxe.proposedReferencePriceRub,q.deluxe.discountRub,q.deluxe.finalPriceRub],[684000,35000,649000]);const html=read('concepts/black-friday-2026/v4/index.template.html');assert.doesNotMatch(html,/ещ[её].*20\s?000|СУПЕР|Добавили жара|Убавили цену/);assert.match(html,/data-description="comfort"/);assert.match(html,/data-description="deluxe"/);});
test('additional Deluxe discounts cannot silently return to campaign arithmetic',()=>{const altered=structuredClone(data);altered.rows.find(r=>r.model==='parus'&&r.size==='550'&&r.package==='deluxe').additionalDeluxeDiscountRub=20000;assert.throws(()=>core.quote(altered,{model:'parus',size:'550',package:'deluxe'}),/Additional discounts are excluded/);});

import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {selectPlan,variantURL,referenceFromURL,selectionChange} from '../web/journey-state.mjs';
import {normalizeState,calculate,comfortState} from '../web/quote.mjs';
const catalog=JSON.parse(readFileSync(new URL('../web/data/catalog-pricebook.json',import.meta.url)));
test('public pricebook stays byte-identical to the verified R99 source',()=>assert.equal(createHash('sha256').update(readFileSync(new URL('../web/data/catalog-pricebook.json',import.meta.url))).digest('hex'),'bf03c6da29c2cd7d102431d4dd208f818b81be19c69957fb9d4a73a3cd5fa28e'));
// Comfort parity now has one canonical snapshot in tests/fixtures/pricing-parity-2026-10-31.json.
// Keep only the independent historical Deluxe contract here; do not duplicate 20 Comfort values.
const deluxe={
  kvadro:[484000,516000,562000,588000,605000],
  viking:[569000,611000,712000,729000,741000],
  parus:[526000,547000,602000,619000,631000],
  'kvadro-house':[797000,913000,969000,1039000,1109000]
};
test('20 Deluxe package amounts match previously verified R90 contract',()=>{
  for(const [model,values] of Object.entries(deluxe)) {
    Object.keys(catalog.prices[model]).forEach((size,i)=>{
      const state=normalizeState(catalog,{model,size,package:'comfort'});
      assert.equal(calculate(catalog,comfortState(catalog,state)).base,values[i]);
    });
  }
});
test('all 39 plans survive selection, mirror, URL and calculation',()=>{for(const p of catalog.r85.plans){const state=selectPlan(catalog,p,true);assert.equal(state.planId,p.id);assert.equal(state.mirror,true);const url=new URL(variantURL('https://example.test',state));assert.deepEqual(normalizeState(catalog,JSON.parse(url.searchParams.get('choice'))),state);const q=calculate(catalog,state);assert.equal(q.plan.id,p.id);if(p.wideBody)assert.equal(q.total,null);}});
test('changing size never silently keeps an incompatible plan',()=>{const state=selectPlan(catalog,catalog.r85.plans[0],true);const next=selectionChange(catalog,state,{size:'600'});assert.equal(next.planRemoved,true);assert.equal(next.state.planId,null);});
test('same-size plan change keeps chosen options; another model resets them',()=>{let state=normalizeState(catalog,{model:'kvadro',size:'400',package:'deluxe',options:['OPT_80']});state=selectPlan(catalog,catalog.r85.plans[0],true,state);assert.equal(state.package,'deluxe');assert.ok(state.options.includes('OPT_80'));const p=catalog.r85.plans.find(p=>p.model==='parus');assert.equal(selectPlan(catalog,p,false,state).package,'comfort');});
test('photo reference round trips without arbitrary URL or text',()=>{const ref={model:'kvadro',objectId:'timber-graphite',photoId:'kq-06',url:'https://evil.test',phone:'123'};const u=new URL(variantURL('https://example.test',{},ref));assert.deepEqual(referenceFromURL(u.searchParams),{model:'kvadro',objectId:'timber-graphite',photoId:'kq-06'});assert.equal(referenceFromURL(new URLSearchParams('reference={bad')),null);});

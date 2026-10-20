import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateQuote} from '../assets/js/quote-engine.js';
import {PRICEBOOK,CATALOG} from '../data/pricebook.js';

const quote=(modelId,sizeId,optionIds=[],optionQuantities={})=>calculateQuote({modelId,sizeId,optionIds,optionQuantities});
test('R7: source base J for all 20 SKU is untouched',()=>{
 assert.equal(Object.values(CATALOG.prices).reduce((s,o)=>s+Object.keys(o).length,0),20);
 assert.equal(CATALOG.prices['kvadro-house']['4x4'],590000);
 assert.equal(CATALOG.prices.kvadro['500'],505000);
});
test('R7: mandatory installation is 10% of J base and never double counted',()=>{
 for(const [size,base]of Object.entries(CATALOG.prices['kvadro-house'])){
  const q=quote('kvadro-house',size);
  assert.equal(q.basePrice,base);
  assert.equal(q.installationRub,Math.round(base*.1));
  assert.equal(q.total,base+Math.round(base*.1));
 }
 assert.equal(quote('kvadro-house','4x4').total,649000);
 assert.equal(quote('kvadro-house','6x6').total,946000);
 assert.equal(quote('kvadro','400').installationRub,0);
});
test('R7: 50mm package is 14742 and comfort still 618022',()=>{
 const b=PRICEBOOK.bundle;
 assert.equal(quote('kvadro','500',b.optionIds).total,618022);
 assert.equal(quote('kvadro','500',['floor_insulation_50mm_kvadro_500']).optionsSubtotal,14742);
});
test('R7: 100mm and 50mm area based on actual floor',()=>{
 assert.equal(quote('kvadro','500',['floor_insulation_100mm_area']).optionsSubtotal,28256);
 assert.equal(quote('kvadro','400',['floor_insulation_50mm_area']).optionsSubtotal,11794);
 assert.equal(quote('kvadro-house','4x4',['floor_insulation_100mm_area']).optionsSubtotal,43056);
 assert.throws(()=>quote('kvadro','500',['floor_insulation_50mm_kvadro_500','floor_insulation_100mm_area']),/INCOMPATIBLE_OPTIONS/);
});
test('R7: terrace RRC ×0.9×1.3 and area selection enforced by server',()=>{
 assert.equal(quote('kvadro','500',['terrace_roof_area'],{terrace_roof_area:3}).optionsSubtotal,70200);
 assert.equal(quote('kvadro','500',['terrace_open_area'],{terrace_open_area:2}).optionsSubtotal,30420);
 assert.equal(quote('kvadro','500',['terrace_dpk_area'],{terrace_dpk_area:4}).optionsSubtotal,74880);
 assert.throws(()=>quote('kvadro','500',['terrace_dpk_area','terrace_roof_area']),/INCOMPATIBLE_OPTIONS/);
 for(const n of [0,-1,41,1.5,'4',null])assert.throws(()=>quote('kvadro','500',['terrace_roof_area'],{terrace_roof_area:n}),/INVALID_OPTION_QUANTITY/);
 assert.throws(()=>quote('kvadro','500',[],{terrace_roof_area:3}),/UNEXPECTED_OPTION_QUANTITY/);
 assert.equal(quote('kvadro','500',['terrace_roof_area']).optionsSubtotal,23400);
});
test('R7: cashless internal surcharge is never applied to public quote',()=>{
 assert.equal(CATALOG.pricingAdjustments.cashlessSurchargeVisible,false);
 assert.equal(quote('kvadro','400').total,390000);
});

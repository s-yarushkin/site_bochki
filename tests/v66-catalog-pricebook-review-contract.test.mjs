import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const book=JSON.parse(readFileSync(new URL('../data/legacy-v72-catalog.json',import.meta.url),'utf8'));
const skuCount=()=>Object.values(book.prices).reduce((sum,model)=>sum+Object.keys(model).length,0);
const bundle=book.featuredBundle;
const lineTotal=id=>book.options[id].unitPriceRub*book.options[id].quantity;
const totalOptions=()=>bundle.selectedOptionIds.reduce((sum,id)=>sum+lineTotal(id),0);

test('V6.6 draft isolates 20 price SKUs and four models without modifying active price engine',()=>{
 assert.equal(book.status,'CATALOG_DRAFT');
 assert.equal(book.currency,'RUB');
 assert.equal(Object.keys(book.prices).length,4);
 assert.equal(skuCount(),20);
 assert.ok(Object.values(book.prices).every(x=>Object.values(x).every(v=>Number.isSafeInteger(v)&&v>0)));
 assert.equal(book.finishes.body.length,12);
 assert.equal(book.finishes.roof.length,4);
 for(const finish of [...book.finishes.body,...book.finishes.roof])assert.equal(finish.priceDeltaRub,null);
});

test('V6.6 owner price adjustment already included once; Viking remains unchanged',()=>{
 const rule=book.pricingAdjustments;
 assert.ok(rule.important.includes('NEVER')||rule.important.includes('Never'));
 assert.deepEqual(rule.excludedModelIds,['viking']);
 assert.deepEqual(['4','4.5','5','5.5','6'].map(key=>rule.byLengthMeters[key]),[20000,25000,30000,35000,40000]);
 assert.deepEqual(Object.values(book.prices.viking),[335000,385000,465000,490000,520000]);
 assert.deepEqual(Object.values(book.prices.kvadro),[310000,330000,370000,390000,405000]);
 assert.deepEqual(Object.values(book.prices.parus),[360000,385000,410000,430000,445000]);
 assert.deepEqual(Object.values(book.prices['kvadro-house']),[560000,629000,689000,739000,789000]);
 assert.equal(rule.calculatedSurchargesByModelSize['kvadro-house']['6x4'],40000);
 assert.equal(rule.calculatedSurchargesByModelSize['kvadro-house']['6x5'],40000);
 assert.equal(rule.calculatedSurchargesByModelSize['kvadro-house']['6x6'],40000);
});

test('V6.6 Kvadro 5m featured bundle excludes water-dependent Oblivasta and adds gated electric panel',()=>{
 assert.equal(bundle.modelId,'kvadro');
 assert.equal(bundle.sizeId,'500');
 assert.equal(book.prices.kvadro[bundle.sizeId],370000);
 assert.equal(bundle.selectedOptionIds.length,14);
 assert.ok(!bundle.selectedOptionIds.includes('oblivasta_connected'));
 assert.ok(bundle.selectedOptionIds.includes('electrical_safety_cabinet_temporary_supply'));
 assert.equal(book.options.electrical_safety_cabinet_temporary_supply.unitPriceRub,15000);
 assert.equal(book.options.electrical_safety_cabinet_temporary_supply.requiresTechnicalApproval,true);
 assert.match(book.options.electrical_safety_cabinet_temporary_supply.safetyGate,/электрик|электро/);
 assert.equal(bundle.temporaryElectricalConnectionStatus,'ENGINEERING_CONFIRMATION_REQUIRED');
 assert.equal(book.deliveryIncluded,false);
});

test('V6.6 featured subtotal is derived from one price catalogue, no demo discount or duplicate uplift',()=>{
 assert.equal(bundle.discountRub,0);
 assert.equal(totalOptions(),120000);
 assert.equal(book.checks.baseRub,book.prices.kvadro[bundle.sizeId]);
 assert.equal(book.checks.optionRub,totalOptions());
 assert.equal(book.checks.knownSubtotalRub,book.checks.baseRub+book.checks.optionRub-bundle.discountRub);
 assert.equal(book.checks.knownSubtotalRub,490000);
 assert.equal(book.checks.previousKnownSubtotalRub,469000);
});

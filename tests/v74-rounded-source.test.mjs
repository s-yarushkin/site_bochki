import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRICEBOOK,CATALOG} from '../data/pricebook.js';
import {CATALOG as V73,PRICEBOOK as V73_PRICEBOOK} from '../data/legacy-v73-pricebook.js';
import {calculateQuote} from '../assets/js/quote-engine.js';
import {validateBaniLead} from '../server/garant-bani-relay.mjs';
const snap=JSON.parse(readFileSync(new URL('../data/source/v74-public-rounded-sheet-snapshot.json',import.meta.url),'utf8'));
const lead=version=>({flow:'quote',name:'Тест',phone:'+79991234567',district:'Тестовый участок',base:'ready',access:'yes',consent:true,consentVersion:'2026-10-14',configuration:{modelId:'kvadro',sizeId:'500',optionIds:[],bundleId:null,finish:'pine',roof:'brown',pricebookVersion:version}});
test('J of Google price table is single approved public base snapshot, 20 SKU',()=>{
  assert.equal(snap.column,'J');
  assert.equal(snap.rows.length,20);
  assert.equal(CATALOG.version,snap.pricebookVersion);
  for(const row of snap.rows){
    assert.equal(CATALOG.prices[row.modelId][row.sizeId],row.sitePriceRub);
    assert.equal(row.sitePriceRub%5000,0);
    assert.equal(row.sitePriceRub,Math.ceil(V73.prices[row.modelId][row.sizeId]/5000)*5000);
  }
});
test('card builder and relay share identical base for every one of 20 SKUs',()=>{
  for(const row of snap.rows){
    const input={modelId:row.modelId,sizeId:row.sizeId,optionIds:[],bundleId:null};
    const direct=calculateQuote(input);
    const req=lead(PRICEBOOK.version);req.configuration={...req.configuration,...input};
    assert.equal(direct.basePrice,row.sitePriceRub);
    assert.equal(direct.total,row.sitePriceRub+(row.modelId==='kvadro-house'?Math.round(row.sitePriceRub*.1):0));
    assert.equal(validateBaniLead(req).estimate.total,row.sitePriceRub);
  }
});
test('historic V73 tabs preserve pre-rounding amounts and unchanged option prices',()=>{
  assert.equal(validateBaniLead(lead(V73_PRICEBOOK.version)).estimate.total,500955);
  assert.equal(validateBaniLead(lead(PRICEBOOK.version)).estimate.total,505000);
  assert.deepEqual(CATALOG.options,V73.options);
});
test('bundle follows common base without silent discount or cosmetic 5k rounding',()=>{
  const q=calculateQuote({modelId:'kvadro',sizeId:'500',optionIds:PRICEBOOK.bundle.optionIds,bundleId:PRICEBOOK.bundle.id});
  assert.equal(q.total,618022);
  assert.equal(q.basePrice,505000);
  assert.equal(q.bundleApplied,true);
  assert.equal(q.discount,0);
});

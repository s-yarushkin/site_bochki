// Pure validation imports only: never opens live SQLite or sends messages.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(process.argv[2]);
const load=file=>import(pathToFileURL(resolve(root,file)));
const {validateBaniLead}=await load('server/garant-bani-relay.mjs');
const {PRICEBOOK}=await load('data/pricebook.js');
const {PRICEBOOK:OLD}=await load('data/legacy-v73-pricebook.js');
const lead=(book,modelId='kvadro',sizeId='500',optionIds=[],bundleId=null)=>({flow:'quote',name:'Изолированная проверка',phone:'+79991234567',district:'Тест',base:'ready',access:'yes',consent:true,consentVersion:'2026-10-14',configuration:{modelId,sizeId,optionIds,bundleId,finish:'pine',roof:'brown',pricebookVersion:book.version}});
let count=0;
for(const model of PRICEBOOK.models)for(const [sizeId,amount] of Object.entries(model.sizes)){
  assert.equal(amount%5000,0);
  assert.equal(validateBaniLead(lead(PRICEBOOK,model.id,sizeId)).estimate.total,amount);
  count++;
}
assert.equal(count,20);
assert.equal(validateBaniLead(lead(PRICEBOOK)).estimate.total,505000);
assert.equal(validateBaniLead(lead(OLD)).estimate.total,500955);
for(const [book,total] of [[PRICEBOOK,618022],[OLD,613977]]){
  const quote=validateBaniLead(lead(book,'kvadro','500',book.bundle.optionIds,book.bundle.id)).estimate;
  assert.equal(quote.total,total);assert.equal(quote.discount,0);assert.equal(quote.quoteRequired,false);
}
console.log('V74_PRICE_PROBE=PASS; MATRIX=20; V73_RETAINED=YES; COMFORT=618022; DB_WRITES=0; MAX_CALLS=0');

// Pure validation against the installed server module. Never creates a store or sends a lead.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const [web,api]=process.argv.slice(2);
const {comfortSelection,comfortPrice,inquiryPayload}=await import(pathToFileURL(web+'/r101/state.mjs'));
const {validateBaniLead}=await import(pathToFileURL(api+'/server/garant-bani-relay.mjs'));
const book=JSON.parse(readFileSync(web+'/data/catalog-pricebook.json','utf8'));
const fields={phone:'+79990000002',name:'R101 validation only',channel:'max',comment:'LED, розетки'};
let prices=0;
for(const [model,sizes] of Object.entries(book.prices))for(const [size,expected] of Object.entries(sizes)){
    const selection=comfortSelection(book,{model,size,package:'deluxe',planId:'p9'});
    assert.equal(comfortPrice(book,selection),expected);
    const lead=validateBaniLead(inquiryPayload(book,selection,fields,{purpose:'quote'},'10101010-1010-4010-8010-101010101010'));
    assert.equal(lead.estimate.total,expected);assert.equal(lead.contactChannel,'max');
    assert.equal(lead.configuration.selection.planId,null);prices++;
}
assert.equal(prices,20);
const callback=validateBaniLead(inquiryPayload(book,null,fields,{purpose:'selection_help'},'10101010-1010-4010-8010-101010101011'));
assert.equal(callback.flow,'callback');assert.equal(callback.contactChannel,'phone');
console.log('SERVER_VALIDATION=PASS; prices=20; MAX context=PASS; callback=PASS; no lead submitted');

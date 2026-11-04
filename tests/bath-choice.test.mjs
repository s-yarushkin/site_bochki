import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {normalizeChoice,choiceFromUrl,choiceUrl,choicePrice} from '../concepts/bath-choice/state.mjs';
const captured=new URL('../.local/renewal-baseline/catalog-pricebook.json',import.meta.url);
const book=JSON.parse(readFileSync(existsSync(captured)?captured:new URL('../web/data/catalog-pricebook.json',import.meta.url)));
const plans=JSON.parse(readFileSync(new URL('../concepts/home-hero/layouts/index.json',import.meta.url))).plans.map(p=>[12,13].includes(p.number)?{...p,models:['parus','viking']}:p);

test('all 20 model/size selections retain exact keys and both current package prices',()=>{
 let count=0;
 for(const [model,data] of Object.entries(book.r85.models))for(const [size,row] of Object.entries(data.sizes)){
  for(const pack of ['comfort','deluxe']){
   const selected=normalizeChoice(book,plans,{model,size,package:pack});
   assert.equal(selected.model,model);assert.equal(selected.size,size);
   assert.equal(choicePrice(book,selected),pack==='comfort'?row.priceRub:row.deluxe.priceRub);
  }
  count++;
 }
 assert.equal(count,20);
});
test('an unavailable 4.5 m plan never silently falls back to a 4 m model',()=>{
 const before=normalizeChoice(book,plans,{model:'kvadro',size:'400'});
 const after=normalizeChoice(book,plans,{...before,size:'450'});
 assert.equal(after.size,'450');assert.equal(after.layout,null);
});
test('package changes preserve a selected matching alternative; model changes reject incompatible plans',()=>{
 const selected=normalizeChoice(book,plans,{model:'kvadro',size:'600',layout:'dp3d-05'});
 assert.equal(normalizeChoice(book,plans,{...selected,package:'deluxe'}).layout,'dp3d-05');
 const other=normalizeChoice(book,plans,{...selected,model:'parus'});
 assert.equal(other.layout,'dp3d-13');assert.equal(other.size,'600');
});
test('choice URLs preserve marketing tags and validate model aliases and invalid input',()=>{
 const start='https://example.test/?utm_campaign=summer&model=kvadro-haus#bath-model';
 const state=choiceFromUrl(book,plans,start);assert.equal(state.model,'kvadro-house');
 const url=choiceUrl(start,state);assert.equal(url.searchParams.get('utm_campaign'),'summer');assert.equal(url.hash,'#bath-model');
 assert.deepEqual(choiceFromUrl(book,plans,url),state);
 const invalid=normalizeChoice(book,plans,{model:'__proto__',size:'999',package:'<script>',layout:'dp3d-11'});
 assert.equal(invalid.model,'kvadro');assert.equal(invalid.size,'400');assert.equal(invalid.package,'comfort');assert.equal(invalid.layout,'dp3d-01');
});

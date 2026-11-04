import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {normalizeChoice,choiceFromUrl,choiceUrl,choicePrice,choiceSizeLabel} from '../concepts/bath-choice/state.mjs';
const captured=new URL('../.local/renewal-baseline/catalog-pricebook.json',import.meta.url);
const book=JSON.parse(readFileSync(existsSync(captured)?captured:new URL('../web/data/catalog-pricebook.json',import.meta.url)));
const plans=JSON.parse(readFileSync(new URL('../concepts/home-hero/layouts/index.json',import.meta.url))).plans.map(p=>[12,13].includes(p.number)?{...p,models:['parus','viking']}:p);
const completePlans=JSON.parse(readFileSync(new URL('../concepts/bath-choice/geometry/index-draft.json',import.meta.url))).plans;

test('the final 19 geometries cover every model and size without borrowing another size',()=>{
 assert.equal(completePlans.length,19);
 for(const [model,data] of Object.entries(book.r85.models))for(const size of Object.keys(data.sizes)){
  const state=normalizeChoice(book,completePlans,{model,size});
  const p=completePlans.find(p=>p.id===state.layout);
  assert.ok(p,model+' '+size);assert.equal(p.size,size);assert.ok(p.models.includes(model));
 }
 assert.equal(normalizeChoice(book,completePlans,{model:'kvadro',size:'450'}).layout,'dp3d-15');
 assert.equal(normalizeChoice(book,completePlans,{model:'kvadro-house',size:'5x4'}).layout,'dp3d-17');
 assert.equal(normalizeChoice(book,completePlans,{model:'viking',size:'550'}).layout,'dp3d-19');
});

test('House width × length labels match its floor plans while preserving price keys',()=>{
 const state=normalizeChoice(book,plans,{model:'kvadro-house',size:'6x5'});
 assert.equal(state.size,'6x5');assert.equal(choiceSizeLabel(book,state.model,state.size),'5×6 м');
 assert.equal(choiceSizeLabel(book,'kvadro-house','5x4'),'4×5 м');
 assert.equal(choicePrice(book,state),book.r85.models['kvadro-house'].sizes['6x5'].priceRub);
});

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

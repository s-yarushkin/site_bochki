import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {heroOffer,validHeroModel} from '../concepts/home-hero/catalog.mjs';
import {calculate} from '../web/quote.mjs';
const book=JSON.parse(readFileSync(new URL('../web/data/catalog-pricebook.json',import.meta.url)));

test('hero starting prices are real Comfort configurations from the existing engine',()=>{
  for(const model of ['kvadro','parus','viking','kvadro-house']){
    const offer=heroOffer(book,model);
    const result=calculate(book,{model,size:offer.size,package:'comfort',options:[],quantities:{},planId:null,mirror:false});
    assert.equal(offer.price,result.total);
    assert.equal(book.prices[model][offer.size],offer.price);
  }
});
test('plans use the existing model filter; House model ID and page slug stay distinct',()=>{
  const house=heroOffer(book,'kvadro-house');
  assert.equal(house.plans,'/planirovki/?model=kvadro-house');
  assert.equal(house.detail,'/bani/kvadro-haus/');
  assert.equal(validHeroModel('https://example.com'),'kvadro');
  assert.equal(validHeroModel('__proto__'),'kvadro');
});

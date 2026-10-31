import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateSelection} from '../web/r85-pricing.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const contract = JSON.parse(read('./fixtures/pricing-parity-2026-10-31.json'));
const catalog = JSON.parse(read('../web/data/catalog-pricebook.json'));

const slugs = {kvadro:'kvadro',viking:'viking',parus:'parus','kvadro-house':'kvadro-haus'};
const rub = value => Number(String(value).replace(/<[^>]*>/g,'').replace(/[^\d]/g,''));
const plansByCode = new Map(contract.quizPlans.map(plan => [plan.code, plan]));
const baseByKey = new Map(contract.comfortPrices.map(row => [row.model+':'+row.size, row.comfortRub]));

function staticTable(html) {
  const table=new Map();
  for(const m of html.matchAll(/<tr data-size="([^"]+)">([\s\S]*?)<\/tr>/g)){
    const cells=[...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x=>x[1]);
    if(cells.length>=2)table.set(m[1],rub(cells[1]));
  }
  return table;
}
function productOffers(html){
  const offers=new Map();
  for(const match of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)){
    const data=JSON.parse(match[1]);
    const visit=node=>{
      if(Array.isArray(node)){for(const x of node)visit(x);return;}
      if(!node||typeof node!=='object')return;
      if(typeof node.sku==='string'&&node.sku.startsWith('dp-')&&Number.isFinite(Number(node.offers?.price)))offers.set(node.sku,Number(node.offers.price));
      for(const child of Object.values(node))visit(child);
    };
    visit(data);
  }
  return offers;
}

test('Google Sheets reference snapshot has 20 unique Comfort prices and 41 unique layout codes',()=>{
  assert.equal(contract.type,'PRICING_PARITY_REFERENCE_SNAPSHOT_NOT_LIVE_AUTHORITY');
  assert.equal(contract.comfortPrices.length,20);
  assert.equal(baseByKey.size,20);
  assert.equal(contract.quizPlans.length,41);
  assert.equal(plansByCode.size,41);
  assert.equal(contract.quizPlans.filter(x=>x.baseComfortRub!==null).length,33);
  assert.equal(contract.quizPlans.filter(x=>x.wideBody).length,8);
  assert.equal(contract.quizRules.layoutPricesApproved,false);
});
test('All 20 approved Comfort prices equal public pricebook, quote engine and source snapshot',()=>{
  assert.equal(Object.values(catalog.prices).reduce((n,o)=>n+Object.keys(o).length,0),20);
  for(const {model,size,comfortRub} of contract.comfortPrices){
    assert.equal(catalog.prices[model]?.[size],comfortRub,model+':'+size+' public pricebook');
    assert.equal(catalog.r85.models[model]?.sizes[size]?.priceRub,comfortRub,model+':'+size+' r85 quote book');
    assert.equal(calculateSelection(catalog.r85,{model,size,package:'comfort'}).basePrice,comfortRub,model+':'+size+' calculator');
  }
});
test('All 20 visible model-page price rows match Comfort snapshot',()=>{
  for(const [model,slug] of Object.entries(slugs)){
    const table=staticTable(read('../web/bani/'+slug+'/index.html'));
    const expected=contract.comfortPrices.filter(x=>x.model===model);
    assert.equal(table.size,expected.length,model+' table row count');
    for(const row of expected)assert.equal(table.get(row.size),row.comfortRub,model+':'+row.size+' model page');
  }
});
test('20 structured-data offers on model pages match approved Comfort prices',()=>{
  for(const [model,slug] of Object.entries(slugs)){
    const offers=productOffers(read('../web/bani/'+slug+'/index.html'));
    const expected=contract.comfortPrices.filter(x=>x.model===model);
    for(const row of expected)assert.equal(offers.get('dp-'+model+'-'+row.size),row.comfortRub,model+':'+row.size+' JSON-LD');
  }
});
test('Four home model cards and 15 compare-page offers match approved Comfort prices',()=>{
  const home=read('../web/index.html');
  const cards=[...home.matchAll(/<div class="model-heading"><h3>([^<]+)<\/h3><p>Комфорт · от <strong>([\d\s\u00a0]+) ₽<\/strong>/g)];
  const names={Квадро:'kvadro',Викинг:'viking',Парус:'parus','Квадро Хаус':'kvadro-house'};
  assert.equal(cards.length,4);
  for(const [,label,visibleRub] of cards){
    const model=names[label];
    const minimum=Math.min(...contract.comfortPrices.filter(x=>x.model===model).map(x=>x.comfortRub));
    assert.equal(rub(visibleRub),minimum,label+' homepage min');
  }
  const compare=read('../web/compare/index.html');
  const links=[...compare.matchAll(/href="\.\.\/bani\/(kvadro|viking|parus)\/\?size=(\d+)">([\d\s\u00a0]+) ₽<\/a>/g)];
  assert.equal(links.length,15,'Compare page must show all fifteen 4–6 m prices');
  for(const [,model,size,value] of links)assert.equal(rub(value),baseByKey.get(model+':'+size),model+':'+size+' comparison');
});
test('41 quiz price rows derive only from approved Comfort + extra rooms + stove replacement',()=>{
  const {extraRoomRub,osaRub,aston12Rub,aston16Rub}=contract.quizRules;
  assert.equal(osaRub,0);
  assert.equal(aston12Rub,7000);
  assert.equal(aston16Rub,12000);
  assert.equal(extraRoomRub,13540.5);
  for(const plan of contract.quizPlans){
    assert.match(plan.code,/^DP-PL-\d{3}$/);
    assert.ok(Number.isInteger(plan.rooms)&&Number.isInteger(plan.baseRooms));
    const key=plan.model+':'+plan.size;
    assert.ok(baseByKey.has(key),plan.code+' missing product size');
    if(plan.wideBody){
      for(const field of ['baseComfortRub','osaRub','aston12Rub','aston16Rub'])assert.equal(plan[field],null,plan.code+' wide body '+field);
      continue;
    }
    assert.equal(plan.baseComfortRub,baseByKey.get(key),plan.code+' base Comfort');
    const baseline=plan.baseComfortRub+Math.max(0,plan.rooms-plan.baseRooms)*extraRoomRub;
    assert.equal(plan.osaRub,baseline+osaRub,plan.code+' Osa 1–2');
    assert.equal(plan.aston12Rub,baseline+aston12Rub,plan.code+' ASTON 12 3–4');
    assert.equal(plan.aston16Rub,baseline+aston16Rub,plan.code+' ASTON 16 5–8');
  }
});
test('A supplied fresh export of live Google Sheets must equal this repo reference',()=>{
  const filename=process.env.DACHAPAR_LIVE_PRICE_EXPORT;
  if(!filename)return; // Offline CI checks repo snapshot; live check is a separate mandatory release action.
  const live=JSON.parse(readFileSync(filename,'utf8'));
  assert.deepEqual(live.comfortPrices,contract.comfortPrices,'Live Comfort sheet != repository reference');
  assert.deepEqual(live.quizPlans,contract.quizPlans,'Live quiz sheet != repository reference');
  assert.deepEqual(live.quizRules,contract.quizRules,'Live quiz price inputs != repository reference');
});

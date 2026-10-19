import {test} from 'node:test';import assert from 'node:assert/strict';
import {calculateQuote,resolveOptions,formatMoney} from '../assets/js/quote-engine.js';
import {PRICEBOOK,CATALOG} from '../data/pricebook.js';
const bundle=PRICEBOOK.bundle;const required=bundle.optionIds;
const q=(patch={})=>calculateQuote({modelId:'kvadro',sizeId:'500',optionIds:[],...patch});
test('T01 Kvadro 5m base follows new published matrix',()=>{assert.equal(q().total,484155);});
test('T02 featured bundle requiring unpriced components has no invented total',()=>{const r=q({optionIds:required,bundleId:bundle.id});assert.equal(r.total,null);assert.equal(r.quoteRequired,true);assert.equal(r.unpricedOptionIds.length,0);assert.match(r.quoteApprovalReason,/электрощита/);});
test('T03 featured gross price is unknown, not a stale snapshot',()=>{assert.equal(q({optionIds:required,bundleId:bundle.id}).beforeDiscount,null);});
test('T04 no invented bundle discount',()=>{assert.equal(q({optionIds:required,bundleId:bundle.id}).discount,0);});
test('T05 featured has 12 meaningful options including insulation',()=>{assert.equal(required.length,12);});
test('T06 bundle invalid when one item removed',()=>{assert.equal(q({optionIds:required.slice(0,-1),bundleId:bundle.id}).bundleApplied,false);});
test('T07 bundle accepts extra compatible item without discounted double count',()=>{assert.equal(q({optionIds:required,bundleId:bundle.id}).discount,0);});
test('T08 catalog prices 20 exact model size combinations',()=>{assert.equal(PRICEBOOK.models.reduce((v,m)=>v+Object.keys(m.sizes).length,0),20);});
test('T09 body finishes count twelve',()=>{assert.equal(CATALOG.finishes.body.length,12);});
test('T10 roof choices count four',()=>{assert.equal(CATALOG.finishes.roof.length,4);});
test('T11 finish surcharges remain unknown, not zero',()=>{assert.ok(CATALOG.finishes.body.every(c=>c.priceDeltaRub===null));});
test('T12 roof surcharges remain unknown, not zero',()=>{assert.ok(CATALOG.finishes.roof.every(c=>c.priceDeltaRub===null));});
test('T13 duplicate option forbidden',()=>{assert.throws(()=>q({optionIds:['stove_guard','stove_guard']}),/DUPLICATE/);});
test('T14 unknown product option forbidden',()=>{assert.throws(()=>q({optionIds:['not-real']}),/UNKNOWN/);});
test('T15 wrong ID type forbidden',()=>{assert.throws(()=>q({optionIds:[3]}),/INVALID_OPTION/);});
test('T16 size 4.5m calculates',()=>{assert.equal(q({sizeId:'450'}).total,419570);});
test('T17 size 5.5m calculates',()=>{assert.equal(q({sizeId:'550'}).total,506741);});
test('T18 Kvadro House all dimensions present',()=>{assert.deepEqual(Object.keys(PRICEBOOK.models.find(m=>m.id==='kvadro-house').sizes),['4x4','5x4','6x4','6x5','6x6']);});
test('T19 Kvadro House 6x5 correct value',()=>{assert.equal(q({modelId:'kvadro-house',sizeId:'6x5'}).total,778500);});
test('T20 Viking base follows site column',()=>{assert.deepEqual(Object.values(PRICEBOOK.models.find(m=>m.id==='viking').sizes),[431730,502740,589275,633780,651420]);});
test('T21 Viking model selection works',()=>{assert.equal(q({modelId:'viking',sizeId:'500'}).total,589275);});
test('T22 unknown model rejected',()=>{assert.throws(()=>q({modelId:'alien'}),/UNKNOWN_MODEL/);});
test('T23 unknown size rejected',()=>{assert.throws(()=>q({sizeId:'200'}),/UNAVAILABLE_SIZE/);});
test('T24 no invented delivery inclusion',()=>{assert.equal(q().deliveryKnown,false);});
test('T25 protected preview remains demo until price approval',()=>{assert.equal(q().pricebookStatus,'DEMO_ONLY');});
test('T26 pricebook version in result',()=>{assert.equal(q().pricebookVersion,PRICEBOOK.version);});
test('T27 all models and size values quoted exactly',()=>{for(const m of PRICEBOOK.models)for(const [size,p] of Object.entries(m.sizes))assert.equal(q({modelId:m.id,sizeId:size}).total,p);});
test('T28 option API requires array',()=>{assert.throws(()=>resolveOptions('stove_guard'),/ARRAY/);});
test('T29 currency formatting RUB',()=>{assert.match(formatMoney(630000),/630\s?000\s?₽/);});
test('T30 unapproved catalog input fails closed',()=>{assert.throws(()=>calculateQuote({}, {...PRICEBOOK,status:'UNVERIFIED'}),/UNAPPROVED/);});
test('T31 negative base rejected',()=>{assert.throws(()=>calculateQuote({modelId:'kvadro',sizeId:'500'},{...PRICEBOOK,models:[{...PRICEBOOK.models[0],sizes:{'500':-5}}]}),/INVALID_BASE/);});
test('T32 sum of model options discount invariant',()=>{for(const ids of [[],['stove_guard'],['stove_guard','folding_table']]){const r=q({optionIds:ids});assert.equal(r.total,r.basePrice+r.optionsSubtotal-r.discount)};});
test('T33 unknown bundle gets no discount',()=>{assert.equal(q({optionIds:required,bundleId:'unknown'}).discount,0);});
test('T34 order of independent options preserves total',()=>{assert.equal(q({optionIds:['stove_guard','folding_table']}).total,q({optionIds:['folding_table','stove_guard']}).total);});
test('T35 Oblivasta remains excluded from featured set',()=>{assert.ok(!required.includes('oblivasta_connected'));});
test('T36 electrical panel is part of the required base spec, but factory cost blocks feature-bundle price',()=>{assert.equal(PRICEBOOK.baseInclusions.priceApprovalGate.electricalShield,'PENDING_FACTORY_SPEC_AND_PRICE');assert.equal(bundle.quotePendingApproval,true);});

test('T37 outlet mini-kits are removed from paid site options',()=>{assert.throws(()=>q({optionIds:['socket_kit_owner']}),/UNKNOWN_OPTION/);assert.throws(()=>q({optionIds:['electrical_distribution_owner']}),/UNKNOWN_OPTION/);});
test('T38 priced add-on and base are summed exactly in public rubles',()=>{const x=q({optionIds:['stove_guard']});assert.equal(x.optionsSubtotal,5850);assert.equal(x.total,484155+5850);});
test('T39 saved historic site-v1 catalog is not rewritten by the new book',async()=>{const legacy=(await import('../data/legacy-site-v1-pricebook.js')).PRICEBOOK;assert.equal(legacy.version,'2026-10-16-sheet-site-v1');assert.equal(legacy.models.find(m=>m.id==='kvadro').sizes['500'],505000);});

test('T40 Viking new base contains the centered arched entrance for all five sizes',()=>{
  const v=PRICEBOOK.models.find(m=>m.id==='viking');
  assert.deepEqual(Object.values(v.sizes),[431730,502740,589275,633780,651420]);
  assert.equal(q({modelId:'viking',sizeId:'500'}).total,589275);
});
test('T41 50mm insulated floor is included only in the Kvadro 5m featured kit',()=>{
  const id='floor_insulation_50mm_kvadro_500';
  assert.ok(required.includes(id));
  const option=PRICEBOOK.options.find(o=>o.id===id);
  assert.equal(option.price,14742);
  assert.equal(option.compatibleModelId,'kvadro');
  assert.equal(option.compatibleSizeId,'500');
  assert.equal(q({optionIds:[id]}).total,484155+14742);
  assert.throws(()=>q({modelId:'viking',sizeId:'500',optionIds:[id]}),/OPTION_NOT_AVAILABLE_FOR_SIZE/);
  assert.throws(()=>q({modelId:'kvadro',sizeId:'400',optionIds:[id]}),/OPTION_NOT_AVAILABLE_FOR_SIZE/);
});
test('T42 Kvadro center entrance is included in all five base prices',()=>{
  assert.deepEqual(Object.values(CATALOG.prices.kvadro),[373698,419570,484155,506741,521766]);
});

test('T43 base plus selected 12 priced options has a transparent provisional sum, but final feature kit stays gated',()=>{
  const partial=q({optionIds:required});assert.equal(partial.total,597177);assert.equal(partial.quoteRequired,false);
  const kit=q({optionIds:required,bundleId:bundle.id});assert.equal(kit.total,null);assert.equal(kit.quoteRequired,true);
});
test('T44 bench is a 2m replacement and the cabinet uses the lower confirmed specification',()=>{
  const a=PRICEBOOK.options.find(o=>o.id==='bench_chest_spruce');
  const b=PRICEBOOK.options.find(o=>o.id==='cabinet_single_50x50');
  assert.equal(a.price,4095);assert.equal(a.quantity,1);assert.match(a.name,/2 м/);
  assert.equal(b.price,9360);assert.match(b.name,/между душевой/);
});

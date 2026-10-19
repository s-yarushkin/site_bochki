import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CATALOG,PRICEBOOK} from '../data/pricebook.js';
import {PRICEBOOK as PREVIOUS_SITE} from '../data/legacy-site-v1-pricebook.js';
import {calculateQuote,formatMoney} from '../assets/js/quote-engine.js';
import {validateBaniLead,formatBaniLead} from '../server/garant-bani-relay.mjs';

const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const base={
  kvadro:[373698,419570,484155,506741,521766],
  parus:[396630,434970,491400,512820,525420],
  viking:[431730,502740,589275,633780,651420],
  'kvadro-house':[574875,673875,716625,778500,841500]
};
test('V73 exactly matches the 20 owner-approved public base outputs',()=>{
  assert.equal(PRICEBOOK.version,'2026-10-19-v73-full-bases-scope-pending-panel');
  for(const [id,amounts] of Object.entries(base))assert.deepEqual(Object.values(CATALOG.prices[id]),amounts);
  assert.equal(Object.values(base).flat().length,20);
});
test('V73 catalogue keeps only meaningful priced extras; mandatory wiring and panel excluded from paid extras',()=>{
  assert.equal(CATALOG.options.stove_guard.unitPriceRub,5850);
  assert.equal(CATALOG.options.folding_table.unitPriceRub,5265);
  assert.equal(CATALOG.options.glass_sauna_door_700x1700.unitPriceRub,10530);
  assert.equal(CATALOG.options.bench_chest_spruce.unitPriceRub,4095);
  assert.equal(CATALOG.options.cabinet_single_50x50.unitPriceRub,9360);
  for(const id of ['socket_kit_owner','electrical_distribution_owner','electrical_safety_cabinet_temporary_supply'])assert.equal(CATALOG.options[id],undefined);
  assert.equal(CATALOG.checks.optionCount,13);assert.equal(CATALOG.checks.featureOptionCount,12);
});
test('V73 featured bundle is not a final quote until electrical shield approval',()=>{
  const bundle=calculateQuote({modelId:'kvadro',sizeId:'500',optionIds:PRICEBOOK.bundle.optionIds,bundleId:PRICEBOOK.bundle.id});
  assert.equal(bundle.total,null);assert.equal(bundle.quoteRequired,true);assert.equal(bundle.unpricedOptionIds.length,0);assert.match(bundle.quoteApprovalReason,/электрощита/);
  assert.equal(formatMoney(bundle.total),'По запросу');
  assert.match(read('index.html'),/id="bundleNew">По запросу/);
  assert.doesNotMatch(read('index.html'),/Готовый комплект за 630 000 ₽/);
});
test('V73 server recomputes current amounts, old site-v1 tabs and legacy tabs independently',()=>{
  const lead=(version,opts=[])=>({flow:'quote',name:'Изолированный тест',phone:'+79991234567',district:'Тестовый район',base:'ready',access:'yes',consent:true,consentVersion:'2026-10-14',configuration:{modelId:'kvadro',sizeId:'500',optionIds:opts,bundleId:null,finish:'pine',roof:'brown',pricebookVersion:version}});
  assert.equal(validateBaniLead(lead(PRICEBOOK.version)).estimate.total,484155);
  assert.equal(validateBaniLead(lead(PREVIOUS_SITE.version)).estimate.total,505000);
  assert.throws(()=>validateBaniLead(lead(PRICEBOOK.version,['socket_kit_owner'])),/UNKNOWN_OPTION/);
  const pending=lead(PRICEBOOK.version,PRICEBOOK.bundle.optionIds);pending.configuration.bundleId=PRICEBOOK.bundle.id;
  const unpriced=validateBaniLead(pending);
  assert.equal(unpriced.estimate.total,null);
  assert.match(formatBaniLead(unpriced),/ИТОГО: По запросу/);
});
test('V73 source preserves mobile conversion UX, scenic rain fix and previous social cover',()=>{
  const html=read('index.html');
  const p=html.indexOf('mobile-cta-v2.css'),q=html.indexOf('mobile-layout-audit.css');
  assert.ok(p>0 && q>p);
  assert.match(html,/href="tel:\+79517349999"/);
  assert.match(read('assets/css/weather-v6.css'),/DACHA_PAR_RAIN_PRODUCT_PHOTO_DOUBLE_EXPOSURE_FIX_20261016/);
  assert.match(read('assets/css/mobile-cta-v2.css'),/safe-area-inset-bottom/);
  assert.match(read('assets/css/mobile-layout-audit.css'),/\.catalog \.product-sizes/);
});
test('V73 every SEO model table uses the current prices',()=>{
  const pages={kvadro:'kvadro',parus:'parus',viking:'viking','kvadro-house':'kvadro-haus'};
  for(const [id,slug] of Object.entries(pages)){
    const html=read('bani/'+slug+'/index.html');
    for(const sum of base[id])assert.ok(html.includes(new Intl.NumberFormat('ru-RU').format(sum)+' ₽'),id+':'+sum);
  }
});

test('V73 central entrances and insulated floor are transparent while base panel economics are pending',()=>{
  const kvadro=CATALOG.models.kvadro, viking=CATALOG.models.viking;
  assert.match(kvadro.baseEntrance,/Центральный/);assert.match(viking.baseEntrance,/Арочный/);
  assert.equal(CATALOG.checks.proposedKnownBundleSubtotalRub,597177);
  assert.equal(CATALOG.baseInclusions.priceApprovalGate.electricalShield,'PENDING_FACTORY_SPEC_AND_PRICE');
  assert.equal(CATALOG.options.floor_insulation_50mm_kvadro_500.unitPriceRub,14742);
});

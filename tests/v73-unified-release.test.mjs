import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CATALOG,PRICEBOOK} from '../data/pricebook.js';
import {PRICEBOOK as PREVIOUS_SITE} from '../data/legacy-site-v1-pricebook.js';
import {calculateQuote,formatMoney} from '../assets/js/quote-engine.js';
import {validateBaniLead,formatBaniLead} from '../server/garant-bani-relay.mjs';

const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const base={
  kvadro:[361998,407420,471555,494141,509166],
  parus:[396630,434970,491400,512820,525420],
  viking:[396630,464940,552825,595980,613620],
  'kvadro-house':[574875,673875,716625,778500,841500]
};
test('V73 exactly matches the 20 owner-approved public base outputs',()=>{
  assert.equal(PRICEBOOK.version,'2026-10-16-v73-public-snapshot');
  for(const [id,amounts] of Object.entries(base))assert.deepEqual(Object.values(CATALOG.prices[id]),amounts);
  assert.equal(Object.values(base).flat().length,20);
});
test('V73 matched add-ons have final public prices; unmatched remain undefined rather than fake numbers',()=>{
  assert.equal(CATALOG.options.stove_guard.unitPriceRub,5850);
  assert.equal(CATALOG.options.folding_table.unitPriceRub,5265);
  assert.equal(CATALOG.options.glass_sauna_door_700x1700.unitPriceRub,10530);
  for(const id of ['socket_kit_owner','electrical_distribution_owner','cabinet_single_50x50','electrical_safety_cabinet_temporary_supply','bench_chest_spruce']){
    assert.equal(CATALOG.options[id].unitPriceRub,null,id);
    assert.equal(CATALOG.options[id].priceStatus,'ON_REQUEST');
  }
});
test('V73 bundle and unpriced options never display stale 630k or 0 rubles',()=>{
  const bundle=calculateQuote({modelId:'kvadro',sizeId:'500',optionIds:PRICEBOOK.bundle.optionIds,bundleId:PRICEBOOK.bundle.id});
  assert.equal(bundle.total,null);assert.equal(bundle.quoteRequired,true);assert.ok(bundle.unpricedOptionIds.length>=4);
  assert.equal(formatMoney(bundle.total),'По запросу');
  assert.match(read('index.html'),/id="bundleNew">По запросу/);
  assert.doesNotMatch(read('index.html'),/Готовый комплект за 630 000 ₽/);
});
test('V73 server recomputes current amounts, old site-v1 tabs and legacy tabs independently',()=>{
  const lead=(version,opts=[])=>({flow:'quote',name:'Изолированный тест',phone:'+79991234567',district:'Тестовый район',base:'ready',access:'yes',consent:true,consentVersion:'2026-10-14',configuration:{modelId:'kvadro',sizeId:'500',optionIds:opts,bundleId:null,finish:'pine',roof:'brown',pricebookVersion:version}});
  assert.equal(validateBaniLead(lead(PRICEBOOK.version)).estimate.total,471555);
  assert.equal(validateBaniLead(lead(PREVIOUS_SITE.version)).estimate.total,505000);
  const unpriced=validateBaniLead(lead(PRICEBOOK.version,['socket_kit_owner']));
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

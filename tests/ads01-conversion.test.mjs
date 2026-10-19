import test from 'node:test';
import assert from 'node:assert/strict';
import {premiumCity,classifyConfirmedLead,PREMIUM_MIN_RUB} from '../server/ads01-conversion.mjs';
const q=(sum,city,options=[],journeyComplete=false)=>({flow:'quote',district:city,journeyComplete,estimate:{total:sum,options}});
test('ADS01 premium whitelist exact city, spelling and province',()=>{
  for(const name of ['Ногинск','г. Ногинск','город Королев','Королёв','Ивантеевка','Московская область, Ивантеевка','г. Королёв, Московская обл.'])
    assert.ok(premiumCity(name),name);
  for(const name of ['Москва','Ногинский район','Подмосковье, Ивантеевка','Ногинск и Королев','Москва, Ногинск','Ногинск, ул. Ленина','','Ногинск, Королёв','Ивантеевка-2','город Ногинск, Москва'])
    assert.equal(premiumCity(name),null,name);
});
test('ADS01 exact threshold, null, underprice, non-city and non-quote',()=>{
  assert.equal(PREMIUM_MIN_RUB,750000);
  assert.equal(classifyConfirmedLead(q(750000,'Ногинск')).premiumQualified,true);
  assert.equal(classifyConfirmedLead(q(749999,'Ногинск')).premiumQualified,false);
  assert.equal(classifyConfirmedLead(q(null,'Ногинск')).premiumQualified,false);
  assert.equal(classifyConfirmedLead(q(860000,'Москва')).premiumQualified,false);
  assert.equal(classifyConfirmedLead({...q(860000,'Ногинск'),estimate:{total:860000,quoteRequired:true}}).premiumQualified,false);
  assert.equal(classifyConfirmedLead({...q(860000,'Ногинск'),flow:'callback'}).premiumQualified,false);
});
test('ADS01 detailed independent from premium, no fake paid extras',()=>{
  assert.equal(classifyConfirmedLead(q(550000,'Сергиев Посад',[{price:5000},{price:7000}],true)).detailedQualified,true);
  assert.equal(classifyConfirmedLead(q(550000,'Сергиев Посад',[{price:5000},{price:0}],true)).detailedQualified,false);
  assert.equal(classifyConfirmedLead(q(550000,'Сергиев Посад',[{price:5000},{price:7000}],false)).detailedQualified,false);
  assert.equal(classifyConfirmedLead(q(800000,'Ивантеевка',[{price:null},{price:null}],true)).premiumQualified,true);
});
test('ADS01 uses owner counter without extra UI and Webvisor disabled',async()=>{
  const cfg=await import('../assets/js/analytics-config.js');
  assert.equal(cfg.ADS01_COUNTER_ID,113675581);
  assert.equal(cfg.ADS01_OWNER_RELEASE_GO,true);
  assert.equal(cfg.ADS01_WEBVISOR_ENABLED,false);
  const m=await import('../assets/js/analytics.js');
  assert.equal(m.trackGoal('dp_lead_confirmed'),false);
  assert.equal(m.attributionForLead(),null);
  const adapter=readFileSync(new URL('../assets/js/analytics.js',import.meta.url),'utf8');
  assert.ok(adapter.includes('metrika/tag.js?id='));
  assert.doesNotMatch(adapter,/displayConsent|consentSettings|dp_analytics_consent_v1|Разрешить аналитику|Без аналитики|Настройки аналитики/);
});

import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('ADS01 CTA and journey hooks are present in current V74 code',()=>{
  const app=read('assets/js/app.js'),relay=read('server/garant-bani-relay.mjs'),html=read('index.html');
  for(const token of ["dp_form_open","dp_form_error","dp_builder_complete","dp_model_select","dp_size_select","confirmedLead(receipt"])assert.ok(app.includes(token),token);
  assert.match(relay,/analytics:\{persisted:true,\.\.\.classifyConfirmedLead\(record\.detail\)\}/);
  assert.match(relay,/attribution/);
  assert.match(html,/class="contact-dialog ym-hide-content"/);
  for(const field of ['phone','customerName','district','website'])assert.ok(html.includes('name="'+field+'"'),'missing field '+field);
  assert.equal((html.match(/class="ym-disable-keys"/g)||[]).length,5);
  assert.match(html,/class="ym-disable-keys" name="comment"/);
  assert.match(app,/class="ym-disable-keys" id="regionInput"/);
});
test('ADS01 all indexable pages share one script, without manager tracking',()=>{
  const pages=['bani/','bani/kvadro/','bani/viking/','bani/parus/','bani/kvadro-haus/','dostavka-i-ustanovka/','voprosy/','kontakty/'];
  for(const page of pages){
    const html=read(page+'index.html');
    assert.equal(html.split('src="/assets/js/analytics.js"').length-1,1,page);
    assert.match(html,/href="tel:/);
  }
  assert.ok(!read('assets/js/manager.js').includes('analytics.js'));
});

test('ADS01 all 18 owner-created event identifiers match the deployed measurement adapter',()=>{
  const code=read('assets/js/analytics.js');
  const section=code.split("const goals=new Set([")[1]?.split("]);")[0];
  assert.ok(section,'event allowlist exists');
  const ids=[...section.matchAll(/'([^']+)'/g)].map(x=>x[1]);
  const expected=[
    'dp_premium_quote_confirmed','dp_detailed_quote_confirmed','dp_lead_confirmed',
    'dp_quote_lead_confirmed','dp_callback_lead_confirmed','dp_phone_click',
    'dp_form_open','dp_form_close','dp_form_error','dp_builder_start',
    'dp_builder_complete','dp_builder_interaction','dp_model_view','dp_model_select',
    'dp_size_select','dp_base_kit_open','dp_gallery_open','dp_cta_click'
  ];
  assert.equal(new Set(ids).size,18);
  assert.deepEqual([...ids].sort(),expected.sort());
  assert.match(code,/initCounter\\(\\);/);
  assert.doesNotMatch(code,/displayConsent|consentSettings|dp_analytics_consent_v1/);
  assert.match(read('privacy.html'),/Яндекс Метрик/);
});

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
  assert.match(adapter,/tag\\.js\\?id=/);
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

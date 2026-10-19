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
  assert.equal(classifyConfirmedLead({...q(860000,'Ногинск'),flow:'callback'}).premiumQualified,false);
});
test('ADS01 detailed independent from premium, no fake paid extras',()=>{
  assert.equal(classifyConfirmedLead(q(550000,'Сергиев Посад',[{price:5000},{price:7000}],true)).detailedQualified,true);
  assert.equal(classifyConfirmedLead(q(550000,'Сергиев Посад',[{price:5000},{price:0}],true)).detailedQualified,false);
  assert.equal(classifyConfirmedLead(q(550000,'Сергиев Посад',[{price:5000},{price:7000}],false)).detailedQualified,false);
  assert.equal(classifyConfirmedLead(q(800000,'Ивантеевка',[{price:null},{price:null}],true)).premiumQualified,true);
});
test('ADS01 no real counter configured before owner approval',async()=>{
  const cfg=await import('../assets/js/analytics-config.js');
  assert.equal(cfg.ADS01_COUNTER_ID,null);
  assert.equal(cfg.ADS01_PRIVACY_APPROVED,false);
  const m=await import('../assets/js/analytics.js');
  assert.equal(m.trackGoal('dp_lead_confirmed'),false);
  assert.equal(m.attributionForLead(),null);
});

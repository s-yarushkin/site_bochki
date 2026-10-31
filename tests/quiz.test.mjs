import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {validAnswers,matchingPlans,rankPlans,planPrice,selectStove} from '../web/quiz-engine.mjs';
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const quiz=read('../web/data/quiz-v1.json');
const book=read('../web/data/catalog-pricebook.json');
const parity=read('./fixtures/pricing-parity-2026-10-31.json');
const parties=['p2','p4','p6','p8'],wash=['w_yes','w_no','w_compare'],beds=['b_yes','b_no'];
test('41 stable unique v04 plan codes; exactly 39 published images and two honest fallbacks',()=>{
 assert.equal(quiz.plans.length,41);
 assert.equal(Object.hasOwn(quiz,'sourceAlbum'),false);
 assert.equal(new Set(quiz.plans.map(p=>p.code)).size,41);
 assert.equal(quiz.plans.filter(p=>p.image).length,39);
 assert.deepEqual(quiz.plans.filter(p=>!p.image).map(p=>p.code),['DP-PL-022','DP-PL-023']);
 quiz.plans.forEach((p,i)=>{
   assert.equal(p.code,'DP-PL-'+String(i+1).padStart(3,'0'));
   assert.equal(Object.hasOwn(p,'slideId'),false);
   assert.equal(Object.hasOwn(p,'mirrorSlideId'),false);
   assert.equal(p.wideBody,parity.quizPlans[i].wideBody);
   assert.equal(p.model,parity.quizPlans[i].model);
   assert.equal(p.size,parity.quizPlans[i].size);
   assert.equal(p.bedroom,parity.quizPlans[i].bedroom);
   assert.equal(p.wash,parity.quizPlans[i].wash);
   if(p.image){
     assert.ok(existsSync(new URL('../web/'+p.image.slice(1),import.meta.url)),p.code+' main image missing');
     assert.ok(existsSync(new URL('../web/'+p.mirrorImage.slice(1),import.meta.url)),p.code+' mirrored image missing');
   }
 });
});
test('all 24 quiz combinations return results or documented bedroom compromise',()=>{
 for(const party of parties)for(const washing of wash)for(const bedroom of beds){
   const answers={party,wash:washing,bedroom};
   assert.equal(validAnswers(answers),true);
   const r=rankPlans(quiz.plans,answers,4);
   assert.ok(r.top.length>0&&r.top.length<=4,JSON.stringify(answers));
   assert.equal(new Set(r.top.map(x=>x.code)).size,r.top.length);
   for(const p of r.all){
      assert.equal(p.bedroom,bedroom==='b_yes');
      if(!r.compromise&&washing==='w_yes')assert.equal(p.wash,'Отдельная');
      if(!r.compromise&&washing==='w_no')assert.notEqual(p.wash,'Отдельная');
   }
   assert.equal(r.compromise,bedroom==='b_yes'&&washing==='w_no');
   if(washing==='w_compare'&&bedroom==='b_no'){
     assert.ok(r.top.some(p=>p.wash==='Отдельная'));
     assert.ok(r.top.some(p=>p.wash!=='Отдельная'));
   }
 }
});
test('price quote uses only live Comfort book + accepted room and stove surcharges',()=>{
 assert.deepEqual(quiz.priceRules.stoves,{p2:{id:'osa',surchargeRub:0},p4:{id:'aston12',surchargeRub:7000},p6:{id:'aston16',surchargeRub:12000},p8:{id:'aston16',surchargeRub:12000}});
 assert.equal(quiz.priceRules.extraRoomRub,13540.5);
 for(const plan of quiz.plans){
   const reference=parity.quizPlans.find(p=>p.code===plan.code);
   for(const [party,key] of [['p2','osaRub'],['p4','aston12Rub'],['p6','aston16Rub'],['p8','aston16Rub']]){
     const cost=planPrice(plan,party,book,quiz.priceRules);
     assert.equal(cost.rub,reference[key],plan.code+' '+party);
     if(plan.wideBody)assert.equal(cost.status,'needs-quote');
     else assert.equal(cost.status,'preliminary');
   }
 }
});
test('invalid answers and unknown stove are blocked',()=>{
 assert.equal(validAnswers({party:'p2',wash:'w_no'}),false);
 assert.throws(()=>rankPlans(quiz.plans,{party:'p12',wash:'w_no',bedroom:'b_no'}),/QUIZ_ANSWERS_INCOMPLETE/);
 assert.throws(()=>selectStove('p12',quiz.priceRules),/QUIZ_PARTY_INVALID/);
});
test('quiz flow is wired into homepage without modifying protected pricebook',()=>{
 const home=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
 assert.match(home,/quiz\.css\?v=dpq-20261031/);
 assert.match(home,/quiz\.mjs\?v=dpq-20261031/);
 assert.equal(quiz.priceRules.assertComfortPriceFromExistingPricebook,true);
 assert.ok(quiz.plans.every(p=>!Object.hasOwn(p,'priceRub')));
});

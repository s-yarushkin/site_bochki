import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {validAnswers,matchingPlans,rankPlans,planPrice,selectStove,recommendModels,recommendModelRanges} from '../web/quiz-engine.mjs';
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

test('small parties see standard compact bodies before larger House alternatives',()=>{
 for(const party of ['p2','p4']){
  const result=rankPlans(quiz.plans,{party,wash:'w_compare',bedroom:'b_no'},4);
  assert.notEqual(result.top[0].model,'kvadro-house');
  assert.ok(result.top.some(p=>p.wash==='Отдельная'));
  assert.ok(result.top.some(p=>p.wash!=='Отдельная'));
 }
 assert.ok(rankPlans(quiz.plans,{party:'p8',wash:'w_yes',bedroom:'b_yes'},4).top.every(p=>p.model==='kvadro-house'&&p.bedroom));
});
test('quiz flow is wired into homepage without modifying protected pricebook',()=>{
 const home=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
 assert.match(home,/quiz\.css\?v=dpq-20261031/);
 assert.match(home,/quiz\.mjs\?v=dpq-20261031/);
 assert.equal(quiz.priceRules.assertComfortPriceFromExistingPricebook,true);
 assert.ok(quiz.plans.every(p=>!Object.hasOwn(p,'priceRub')));
});

test('customer-facing quiz text has no internal pricing or development language',()=>{
 const ui=readFileSync(new URL('../web/quiz.mjs',import.meta.url),'utf8');
 const engine=readFileSync(new URL('../web/quiz-engine.mjs',import.meta.url),'utf8');
 for(const phrase of [
  'Цены предварительные: указаны базовый',
  'доплата за новые помещения',
  'Изображение ещё не перенесено',
  'Эта схема обновлена в альбоме',
  'Актуальную схему откроем из альбома',
  'Требуется индивидуальный расчёт',
  'Комфортное число гостей уточним',
  'Оснащение уточняется',
  'Размещение и оснащение согласуем',
  'Без регистрации и звонков'
 ]){
   assert.equal(ui.includes(phrase),false,'Internal commentary visible in quiz: '+phrase);
   assert.equal(engine.includes(phrase),false,'Internal commentary visible in guest messaging: '+phrase);
 }
 assert.match(ui,/Куда отправить индивидуальное предложение\?/);
 assert.match(ui,/Выберите мессенджер/);
 assert.match(ui,/name="channel"/);
 for(const channel of ['max','whatsapp','telegram'])assert.ok(ui.includes("['"+channel+"',"),'Missing messenger '+channel);
 assert.equal((ui.match(/data-dpq="form"/g)||[]).length,1,'Contact invitation occurs once after results');
 for(const phrase of ['без телефона','Без телефона','По вашему запросу','Стоимость по запросу','Получить планировку →','Пришлём подробную планировку','Номер телефона нужен, только если'])
   assert.equal(ui.includes(phrase),false,'Repeated sales message: '+phrase);
 assert.match(ui,/payload\.purpose='quiz_catalog'/);
 assert.match(ui,/payload\.contactChannel=state\.channel/);
});

test('model-only results cover all answers with priced unique models and no image dependency',()=>{
 const noImages=quiz.plans.map(({image,mirrorImage,...p})=>p);
 for(const party of parties)for(const washing of wash)for(const bedroom of beds){
  const found=recommendModels(noImages,{party,wash:washing,bedroom},book,quiz.priceRules);
  assert.ok(found.offers.length>=1&&found.offers.length<=3);
  assert.equal(new Set(found.offers.map(o=>o.plan.model)).size,found.offers.length);
  for(const {plan,price} of found.offers){assert.ok(Number.isFinite(price.rub));assert.equal(plan.bedroom,bedroom==='b_yes');assert.notEqual(plan.sitePlanId,'v03_Q6_rest');}
 }
});

test('large center invitation appears after 10s/35%, while quiz itself waits for a click',()=>{
 const ui=readFileSync(new URL('../web/quiz.mjs',import.meta.url),'utf8');
 assert.match(ui,/const inviteDelayMs=10000,inviteScrollFraction=0\.35;/);
 assert.match(ui,/Date\.now\(\)-startedAt>=inviteDelayMs/);
 assert.match(ui,/scrollY\/height>=inviteScrollFraction/);
 assert.match(ui,/window\.setTimeout\(maybeInvite,inviteDelayMs\+500\)/);
 assert.match(ui,/Date\.now\(\)-startedAt>15000/,'Desktop exit signal remains delayed');
 assert.match(ui,/localStorage\.setItem\(hiddenKey,String\(Date\.now\(\)\+7\*86400000\)\)/);
 assert.match(ui,/invite\.showModal\(\)/,'The new invitation itself is a large centered modal');
 assert.match(ui,/invite\.addEventListener\('cancel'/,'Escape dismisses the invitation');
 assert.match(ui,/dialog\.showModal\(\)/);
 const builder=readFileSync(new URL('../r107/build.py',import.meta.url),'utf8');
 assert.match(builder,/r107-invite35/,'New preview must invalidate cached R106 script');
 assert.match(builder,/R107-PREVIEW/);
 const trigger=ui.slice(ui.indexOf('const maybeInvite='),ui.indexOf('function launch('));
 assert.doesNotMatch(trigger,/dialog\.showModal\(/,'The full quiz still opens only on an intentional click');
});

test('R108 buyer choices are literal: straightforward guest counts and requested washing language',()=>{
 const ui=readFileSync(new URL('../web/quiz.mjs',import.meta.url),'utf8');
 for(const phrase of ['1–2 человека','До 4 человек','5–6 человек','Для большой семьи и друзей','До 8 человек','встречать праздники в бане с компанией','Исторически мылись в самой парной','Предпочитаю сэкономить','Хочу сравнить']){
   assert.ok(ui.includes(phrase),'Missing approved copy: '+phrase);
 }
 for(const phrase of ['Вспомните обычный выходной на даче.','Отдельная спальня — или больше места для общего отдыха.','Да, отдельная комната']){
   assert.equal(ui.includes(phrase),false,'Obsolete question copy '+phrase);
 }
});
test('R108 range matching: 5/6 m, no intermediate 4.5/5.5 m, and no Kvadro for 5–8 guests',()=>{
 for(const party of parties)for(const wash of ['w_yes','w_no','w_compare'])for(const bedroom of beds){
   const a={party,wash,bedroom};
   const {offers,compromise}=recommendModelRanges(quiz.plans,a,book,quiz.priceRules);
   assert.ok(offers.length>0,'No offers '+JSON.stringify(a));
   assert.equal(new Set(offers.map(o=>o.model)).size,offers.length);
   assert.ok(offers.length<=4);
   if(['p6','p8'].includes(party))assert.ok(offers.every(o=>o.model!=='kvadro'),'Kvadro unexpectedly offered to a large party');
   if(bedroom==='b_yes')assert.ok(offers.every(o=>o.model==='kvadro-house'&&o.sizes.every(s=>s==='6x6')));
   if(['p2','p4'].includes(party)&&wash==='w_compare'&&bedroom==='b_no'){
     assert.ok(offers.some(o=>o.model==='kvadro-house'&&o.sizes.length===1&&o.sizes[0]==='4x4'));
   }
   for(const offer of offers){
     assert.ok(offer.plans.every(p=>!p.wideBody&&!['450','550'].includes(p.size)&&p.sitePlanId!=='v03_Q6_rest'));
     assert.ok(offer.plans.every(p=>p.model===offer.model));
     assert.ok(offer.displayMinRub>=offer.minRub&&offer.displayMinRub-offer.minRub<1000);
     assert.ok(offer.displayMaxRub>=offer.maxRub&&offer.displayMaxRub-offer.maxRub<1000);
     assert.ok(offer.displayMaxRub>=offer.displayMinRub);
     if(offer.model!=='kvadro-house')assert.ok(offer.sizes.every(s=>['500','600'].includes(s)));
   }
   assert.equal(compromise,bedroom==='b_yes'&&wash==='w_no');
 }
 const noWash=recommendModelRanges(quiz.plans,{party:'p4',wash:'w_no',bedroom:'b_no'},book,quiz.priceRules);
 assert.deepEqual(noWash.offers.map(o=>o.model),['kvadro','parus','viking']);
 assert.ok(noWash.offers.every(o=>o.firstSize==='500'&&o.lastSize==='600'));
 const compare=recommendModelRanges(quiz.plans,{party:'p2',wash:'w_compare',bedroom:'b_no'},book,quiz.priceRules);
 assert.deepEqual(compare.offers.map(o=>o.model),['kvadro','parus','viking','kvadro-house']);
 const washOnly=recommendModelRanges(quiz.plans,{party:'p4',wash:'w_yes',bedroom:'b_no'},book,quiz.priceRules);
 const k=washOnly.offers.find(o=>o.model==='kvadro');
 assert.deepEqual(k?.sizes,['600'],'Don't claim a nonexistent 5 m Kvadro with separate washroom');
});
test('R108 price spans use original Comfort prices, room surcharges and stove surcharges',()=>{
 const a={party:'p4',wash:'w_yes',bedroom:'b_no'};
 const {offers}=recommendModelRanges(quiz.plans,a,book,quiz.priceRules);
 const parus=offers.find(o=>o.model==='parus');
 assert.equal(parus.minRub,530540.5);
 assert.equal(parus.maxRub,555540.5);
 assert.equal(parus.displayMinRub,531000);
 assert.equal(parus.displayMaxRub,556000);
 const kvadro=offers.find(o=>o.model==='kvadro');
 assert.equal(kvadro.displayMinRub,546000);
 assert.equal(kvadro.displayMaxRub,546000);
});
test('Deluxe extra bonus is never subtracted from Comfort price ranges',()=>{
 const a={party:'p4',wash:'w_yes',bedroom:'b_no'};
 const offers=recommendModelRanges(quiz.plans,a,book,quiz.priceRules).offers;
 assert.equal(offers.find(o=>o.model==='parus').minRub,530540.5);
 const ui=readFileSync(new URL('../web/quiz.mjs',import.meta.url),'utf8');
 assert.ok(ui.includes('20 000 ₽'));
 assert.ok(ui.includes('Суммируется с остальными акциями'));
 assert.ok(ui.includes('комплектации «Делюкс»'));
 assert.ok(ui.includes('/privacy.html'));
 assert.equal((ui.match(/data-dpq="form"/g)||[]).length,1);
 assert.equal(ui.includes('cost.rub-20000'),false);
});

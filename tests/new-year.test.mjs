import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {campaignInquiry,createRequestIdentity} from '../concepts/new-year-2027/lead-contract.mjs';
import {submitLead} from '../web/lead-client.mjs';
import {CONSENT_VERSION,CONSENT_METHOD} from '../web/lead-consent.mjs';
import {readFileSync} from 'node:fs';
import {MODELS,modelOffer} from '../concepts/new-year-2027/catalog.mjs';
const book=JSON.parse(readFileSync(new URL('../web/data/catalog-pricebook.json',import.meta.url)));

const origin='https://xn--80aaan1dh9b.xn--p1ai';
const settings={lead:{enabled:true,allowedOrigins:[origin],endpoint:'/api/lead'}};
const values={phone:'+7 (999) 000-00-01',name:'Тест',settlement:'Вологодская область',comment:'Хочу встретить Новый год в бане'};
test('campaign uses standard callback and consent, without inventing a model or MAX URL',()=>{
  const payload=campaignInquiry(values,randomUUID());
  assert.equal(payload.flow,'callback');assert.equal(payload.phone,'+79990000001');
  assert.equal(payload.contactChannel,'phone');
  assert.equal(payload.consentVersion,CONSENT_VERSION);assert.equal(payload.consentMethod,CONSENT_METHOD);
  assert.equal(payload.configuration,undefined);assert.equal(payload.purpose,undefined);
  assert.deepEqual(payload.journeyContext,{purpose:'selection_help',pagePath:'/novyy-god/',district:values.settlement});
  assert.match(payload.comment,/Новый год 2027/);assert.match(payload.comment,/Вологодская область/);
  assert.match(payload.comment,/Пришлите варианты планировок и комплектаций/);
  assert.ok(payload.comment.length<=500);
});
test('same request keeps its idempotency key after timeout; edited wishes get a new key',()=>{
  const identity=createRequestIdentity(randomUUID);
  const first=identity.assign(campaignInquiry(values,randomUUID()));
  const retry=identity.assign(campaignInquiry(values,randomUUID()));
  assert.equal(first.requestId,retry.requestId);
  assert.notEqual(first.requestId,identity.assign(campaignInquiry({...values,settlement:'Москва'},randomUUID())).requestId);
});
test('existing lead client posts to the same MAX relay endpoint and accepts a confirmed receipt',async()=>{
  const payload=campaignInquiry(values,randomUUID());let call;
  const receipt={ok:true,delivered:true,analytics:{persisted:true}};
  const result=await submitLead(payload,settings,origin,async(url,options)=>{
    call={url,options};return {ok:true,json:async()=>receipt};
  });
  assert.equal(call.url,'/api/lead');assert.equal(call.options.method,'POST');
  assert.equal(call.options.credentials,'same-origin');assert.deepEqual(JSON.parse(call.options.body),payload);
  assert.equal(result.confirmed,true);assert.equal(result.receipt,receipt);
});
test('no success if server did not confirm MAX delivery and persisted analytics',async()=>{
  for(const receipt of [{ok:true},{ok:true,delivered:false,analytics:{persisted:true}},{ok:true,delivered:true,analytics:{persisted:false}}]){
    await assert.rejects(submitLead(campaignInquiry(values,randomUUID()),settings,origin,async()=>({ok:true,json:async()=>receipt})),/DELIVERY_NOT_CONFIRMED/);
  }
});
test('unapproved origins cannot submit and invalid phone cannot create a campaign lead',async()=>{
  let requests=0;
  await assert.rejects(submitLead(campaignInquiry(values,randomUUID()),settings,'https://unrelated.example',async()=>{requests++;}),/LEAD_NOT_CONNECTED/);
  assert.equal(requests,0);assert.throws(()=>campaignInquiry({...values,phone:'123'},randomUUID()),/PHONE_INVALID/);
});
test('all 20 holiday offers use the existing Comfort engine and exact catalogue prices',()=>{
  let count=0;
  for(const [model,sizes] of Object.entries(book.prices))for(const [size,expected] of Object.entries(sizes)){
    const offer=modelOffer(book,{model,size});assert.equal(offer.price,expected,`${model}/${size}`);
    assert.equal(offer.selection.package,'comfort');assert.deepEqual(offer.selection.options,[]);count++;
  }
  assert.equal(count,20);assert.equal(Object.keys(MODELS).length,4);
});
test('switching from a length to a House size selects an available real size',()=>{
  const house=modelOffer(book,{model:'kvadro-house',size:'450'});
  assert.equal(house.selection.size,'4x4');assert.equal(house.price,book.prices['kvadro-house']['4x4']);
  const parus=modelOffer(book,{model:'parus',size:'6x6'});assert.equal(parus.selection.size,'400');
});
test('selected model and size use a standard quote payload for the existing MAX relay',()=>{
  for(const model of Object.keys(MODELS)){
    const offer=modelOffer(book,{model,size:model==='kvadro-house'?'6x5':'550'});
    const payload=campaignInquiry(values,randomUUID(),{book,selection:offer.selection});
    assert.equal(payload.flow,'quote');assert.equal(payload.contactChannel,'phone');
    assert.equal(payload.configuration.modelId,model);assert.equal(payload.configuration.sizeId,offer.selection.size);
    assert.equal(payload.configuration.pricebookVersion,book.version);assert.equal(payload.journeyContext.purpose,'quote');
    assert.match(payload.comment,/Новый год 2027/);assert.ok(payload.comment.includes(offer.name));
  }
});


test('R5 preserves wide lead form, short footer, independent consent link and supports multiple model inquiries',()=>{
 const html=readFileSync(new URL('../concepts/new-year-2027/index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../concepts/new-year-2027/style.css',import.meta.url),'utf8');
 const lead=readFileSync(new URL('../concepts/new-year-2027/lead.mjs',import.meta.url),'utf8');
 assert.match(html,/<h2 id="form-heading">Пришлём подходящие варианты, цены и комплектации<\/h2>/);
 assert.match(html,/class="dialog-story"/);
 assert.match(html,/class="dialog-action"/);
 assert.match(html,/<form id="lead-form" action="\/api\/lead" method="post">/);
 assert.match(html,/<p id="delivery-geography-title" class="delivery-footer-line">Производство — Вологда\.<br>Доставка: Москва и Подмосковье, Петербург и Ленобласть, Вологодская и Ярославская области\.<\/p>/);
 assert.match(html,/class="footer-links"[\s\S]*?<a href="\/privacy.html">Политика обработки данных<\/a><a href="\/consent.html">Согласие на обработку<\/a>/);
 assert.ok(html.indexOf('id="delivery-geography-title"')>html.indexOf('</main>'));
 assert.equal(html.includes('class="delivery-geography"'),false);
 assert.equal(html.includes('Основные направления:'),false);
 assert.equal(html.includes('id="inquiry-summary"'),false);
 assert.equal(html.includes('выбранной бани'),false);
 assert.match(html,/style\.css\?v=ny2027-r5/);
 assert.match(html,/holiday-quiz\.mjs\?v=ny2027-r5/);
 assert.match(html,/\/quiz\.css\?v=r115-footer-0290aab2/);
 assert.match(css,/NY2027 R5/);
 assert.match(css,/#lead-dialog\{[\s\S]*?width:min\(1280px,calc\(100vw - 48px\)\)/);
 assert.match(css,/#lead-dialog #submit-lead\{\s*min-height:90px/);
 assert.match(lead,/callbackAvailable\(settings,location\.origin\)/);
 assert.match(lead,/campaignInquiry\(values,crypto\.randomUUID\(\)\)/);
 assert.doesNotMatch(lead,/selectionContext/);
});
test('R5 literally retains original questions, options, answer keys, engine and discount',()=>{
 const js=readFileSync(new URL('../concepts/new-year-2027/holiday-quiz.mjs',import.meta.url),'utf8');
 const old=readFileSync(new URL('../web/quiz.mjs',import.meta.url),'utf8');
 const questionBlock=s=>s.slice(s.indexOf('const question=['),s.indexOf('const safe=s=>'));
 // Holiday copy is based on R117; its exact question block must match the immutable original,
 // even when runtime triggers, illustrations and campaign attribution change.
 const expected=[
  ["['p2','1–2 человека','Для спокойного отдыха']","['p4','До 4 человек','Для семьи и небольшой компании']",
   "['p6','5–6 человек','Для большой семьи и друзей']","['p8','До 8 человек','Когда в планах — встречать праздники в бане с компанией']"],
  ["title:'Нужна отдельная помывочная?'","['w_yes','Да, отдельная помывочная','Мыться отдельно от парной']",
   "['w_no','Без отдельной помывочной','Предпочитаю сэкономить']",
   "['w_compare','Хочу сравнить','Посмотрю оба варианта и решу']"],
  ["title:'Нужно место, чтобы остаться на ночь?'",
   "['b_yes','Да, со спальней','Закончить банный вечер и остаться до утра']",
   "['b_no','Только для банного отдыха','Для ночёвки у нас есть дом']"]
 ];
 for(const group of expected)for(const term of group)assert.ok(questionBlock(js).includes(term),term);
 assert.ok(js.includes("from '/quiz-engine.mjs?v=r108-ranges'"));
 assert.ok(js.includes('recommendModelRanges(quiz.plans,state.answers,book,quiz.priceRules)'));
 assert.ok(js.includes('Скидка 20 000 ₽ — при выборе комплектации «Делюкс»'));
 assert.ok(js.includes("payload.comment=('Источник: квиз новый год. Новый год 2027."));
 assert.ok(js.includes("pagePath:'/novyy-god/'"));
 assert.ok(js.includes('visibleRemainingMs=8000'));
 assert.ok(js.includes('dp_ny2027_quiz_invite_seen_session'));
 assert.ok(!js.includes('modelsIdleMs=18000'));
 assert.ok(!js.includes('reachedYourBath'));
 for(const img of ['winter-house-960.webp','winter-sauna-960.webp','winter-parus-960.webp','winter-viking-960.webp'])
   assert.ok(js.includes(img),'Winter visual: '+img);
 // Never claim zero-time delivery from New Year's countdown.
 assert.ok(!js.includes('Гарантируем к Новому году'));
});


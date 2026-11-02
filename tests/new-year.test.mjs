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


test('R2 holiday lead dialog has agreed sales headline, larger readable typography and delivery geography',()=>{
 const html=readFileSync(new URL('../concepts/new-year-2027/index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../concepts/new-year-2027/style.css',import.meta.url),'utf8');
 assert.match(html,/<h2 id="form-heading">Пришлём подходящие варианты, цены и комплектации<\/h2>/);
 assert.doesNotMatch(html,/Пришлём варианты<br>для вашей мечты/);
 assert.match(html,/<section class="delivery-geography" aria-labelledby="delivery-geography-title">/);
 assert.match(html,/<h2 id="delivery-geography-title">География доставки<\/h2>/);
 for(const region of ['Москва и Московская область','Ярославская область','Вологодская область','Ленинградская область'])
   assert.ok(html.includes('<li>'+region+'</li>'),region);
 assert.ok(html.indexOf('delivery-geography')>html.indexOf('</section>'),'Delivery must be below hero');
 assert.ok(html.indexOf('delivery-geography')<html.indexOf('</main>'),'Delivery must precede footer');
 assert.match(html,/style\.css\?v=ny2027-r2/);
 assert.match(css,/#lead-dialog\{\s*width:min\(660px,calc\(100% - 40px\)\)/);
 assert.match(css,/#lead-dialog h2\{font-size:clamp\(34px,3vw,42px\)/);
 assert.match(css,/@media\(max-width:700px\)\{\s*#lead-dialog\{width:calc\(100% - 20px\)/);
 assert.match(css,/\.delivery-regions\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.delivery-regions\{grid-template-columns:1fr/);
});

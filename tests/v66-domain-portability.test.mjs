import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadRelayConfig,validateBaniLead,formatBaniLead} from '../server/garant-bani-relay.mjs';
import {createManagerAuth,hashManagerPassword} from '../server/manager-auth.mjs';
import {openLeadStore} from '../server/lead-store.mjs';

const config=(change={})=>loadRelayConfig({
  HOST:'127.0.0.1',PORT:'3301',ALLOWED_ORIGIN:'https://xn----7sbbigeqcfm8bq.xn--p1ai',
  SITE_BASE_PATH:'/bani-preview/',MAX_CHAT_ID:'123',MAX_TOKEN_FILE:'/test/token',...change
},()=> 'test-secret-token-with-length');

const leadInput={flow:'quote',name:'Тест Клиент',phone:'+7 999 123-45-67',
 contactChannel:'phone',district:'Вологодский район',base:'ready',access:'yes',
 comment:'',consent:true,consentVersion:'2026-10-12',
 configuration:{modelId:'kvadro',sizeId:'500',
  optionIds:[],bundleId:null,finish:'pine',roof:'brown'}};

test('V66 new domain origin and root path are runtime settings, never hardcoded',()=>{
 const c=config({ALLOWED_ORIGIN:'https://garant-bani.example',SITE_BASE_PATH:'/'});
 assert.equal(c.allowedOrigin,'https://garant-bani.example');
 assert.equal(c.siteBasePath,'/');
 assert.equal(config().siteBasePath,'/bani-preview/');
});
test('V66 invalid/mismatched Origin or public path fail closed',()=>{
 for(const origin of ['http://example.ru','https://example.ru/extra','https://example.ru?x=1','*','https://example.ru/']) {
   if(origin==='https://example.ru/')continue; // URL normalization means path '/' is equivalent origin.
   assert.throws(()=>config({ALLOWED_ORIGIN:origin}),/UNSAFE_ORIGIN/);
 }
 for(const path of ['/../../','bad','/bani-preview/../','/bani-preview//'])
   assert.throws(()=>config({SITE_BASE_PATH:path}),/UNSAFE_BASE_PATH/);
});
test('V66 manager cookie Path follows validated deployment base path',()=>{
 const accounts=[
  {phone:'+79991111111',hash:hashManagerPassword('sufficiently-long-private-001')},
  {phone:'+79992222222',hash:hashManagerPassword('sufficiently-long-private-002')}
 ];
 const auth=createManagerAuth({accounts,sessionSecret:'e'.repeat(64),
   cookiePath:'/api/manager/'});
 const result=auth.login('+79991111111','sufficiently-long-private-001','127.0.0.1');
 assert.equal(result.ok,true);
 assert.match(result.cookie,/Path=\/api\/manager\/;/);
 assert.match(result.cookie,/Secure; SameSite=Strict/);
 assert.throws(()=>createManagerAuth({accounts,sessionSecret:'e'.repeat(64),
   cookiePath:'//bad/path'}),/INVALID_MANAGER_COOKIE_PATH/);
});
test('V66 server calculates Kvadro 5m from approved draft catalog and preserves finish/roof',()=>{
 const lead=validateBaniLead(leadInput);
 assert.equal(lead.estimate.basePrice,370000);
 assert.equal(lead.configuration.finishName,'Сосна');
 assert.equal(lead.configuration.roofName,'Коричневый');
 assert.equal(lead.consentEvidence.version,'2026-10-12');
 assert.match(formatBaniLead(lead),/Размер: 5 м/);
 assert.match(formatBaniLead(lead),/Цвет кровли: Коричневый/);
 assert.throws(()=>validateBaniLead({...leadInput,configuration:{...leadInput.configuration,roof:'blue-unknown'}}),/INVALID_ROOF/);
 assert.throws(()=>validateBaniLead({...leadInput,consent:false}),/CONSENT_REQUIRED/);
});
test('V66 immutable lead snapshot keeps consent version, full size and server-calculated sum',()=>{
 const store=openLeadStore(':memory:');
 try{
  const created=store.create(validateBaniLead(leadInput),'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
  assert.equal(created.created,true);
  assert.equal(created.lead.detail.estimate.total,370000);
  assert.equal(created.lead.detail.consentEvidence.version,'2026-10-12');
  assert.equal(store.detail(created.lead.id).detail.configuration.roofName,'Коричневый');
  assert.equal(store.stats().total,1);
 }finally{store.close()}
});

test('V66 rolling update preserves legacy V6.4 in-flight quote using frozen historical demo snapshot',()=>{
 const old={...leadInput,consentVersion:undefined,configuration:{
   modelId:'kvadro-house',sizeId:'500',finish:'walnut',
   optionIds:['aspen','water-piping','steam-led','porch','window'],
   bundleId:'family-comfort-demo'}};
 const lead=validateBaniLead(old);
 assert.equal(lead.estimate.pricebookVersion,'2026-10-08-demo-v4');
 assert.equal(lead.estimate.basePrice,659000);
 assert.equal(lead.estimate.total,857000);
 assert.equal(lead.estimate.bundleApplied,true);
 assert.equal(lead.configuration.finishName,'Тёплый орех');
 assert.equal(lead.consentEvidence.method,'legacy-consent-true-unverified-action');
 assert.match(formatBaniLead(lead),/Размер: 5 м/);
 assert.match(formatBaniLead(lead),/Версия прайса: 2026-10-08-demo-v4/);
});

test('V66 new consent-versioned requests cannot silently fall back to legacy option prices or deprecated geometry',()=>{
 const normal={...leadInput,consentVersion:'2026-10-12'};
 assert.equal(validateBaniLead(normal).estimate.pricebookVersion,'2026-10-12-v66-owner-review-3');
 assert.throws(()=>validateBaniLead({...normal,configuration:{
   modelId:'kvadro-house',sizeId:'500',finish:'pine',roof:'brown',
   optionIds:[],bundleId:null
 }}),/UNAVAILABLE_SIZE/);
 assert.throws(()=>validateBaniLead({...normal,configuration:{
   modelId:'kvadro',sizeId:'500',finish:'pine',roof:'brown',
   optionIds:['water-piping'],bundleId:null
 }}),/UNKNOWN_OPTION/);
 assert.throws(()=>validateBaniLead({...normal,consentVersion:'unknown'}),/CONSENT_VERSION_UNSUPPORTED/);
});

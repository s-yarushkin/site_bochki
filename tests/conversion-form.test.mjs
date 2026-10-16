import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {validateBaniLead,formatBaniLead} from '../server/garant-bani-relay.mjs';
import {CONSENT_VERSION,CONSENT_METHOD,CONSENT_DOCUMENT_SHA256} from '../assets/js/lead-consent.js';
import {PRICEBOOK} from '../data/pricebook.js';
const lead={flow:'quote',phone:'+79991234567',name:'',district:'',base:'unknown',access:'unknown',consent:true,consentVersion:CONSENT_VERSION,consentMethod:CONSENT_METHOD,configuration:{modelId:'kvadro',sizeId:'500',optionIds:[],bundleId:null,pricebookVersion:PRICEBOOK.version}};
test('phone-only request retains server-calculated configuration and exact consent document fingerprint',()=>{
 const value=validateBaniLead(lead);assert.equal(value.estimate.total,505000);assert.equal(value.name,'');assert.equal(value.district,'');
 assert.equal(value.consentEvidence.method,CONSENT_METHOD);assert.equal(value.consentEvidence.version,CONSENT_VERSION);
 assert.equal(createHash('sha256').update(readFileSync(new URL('../consent.html',import.meta.url))).digest('hex'),CONSENT_DOCUMENT_SHA256);
 assert.equal(value.consentEvidence.documentSha256,CONSENT_DOCUMENT_SHA256);assert.match(formatBaniLead(value),/Район: Не указан/);assert.match(formatBaniLead(value),/ДАЧА ПАР/);
 for(const bad of [undefined,false,0])assert.throws(()=>validateBaniLead({...lead,consent:bad}),/CONSENT_REQUIRED/);
 for(const bad of [undefined,'checkbox','accepted'])assert.throws(()=>validateBaniLead({...lead,consentMethod:bad}),/CONSENT_METHOD_REQUIRED/);
});
test('optional current fields stay bounded and historic checkbox clients keep their original rules',()=>{
 assert.throws(()=>validateBaniLead({...lead,name:'a'.repeat(81)}),/FIELD_TOO_LONG/);
 assert.throws(()=>validateBaniLead({...lead,district:'a'.repeat(141)}),/FIELD_TOO_LONG/);
 for(const version of ['2026-10-12','2026-10-14']){
  const historic={...lead,consentVersion:version,name:'Тест',district:'Вологда'};delete historic.configuration.pricebookVersion;
  assert.equal(validateBaniLead(historic).estimate.total,370000);assert.equal(validateBaniLead(historic).consentEvidence.method,'explicit-checkbox-v66');
  assert.throws(()=>validateBaniLead({...historic,name:''}),/INVALID_NAME/);
 }
});

test('stored request retains button consent evidence and missing evidence never creates a lead',async()=>{
 const {createServer,request}=await import('node:http');
 const {openLeadStore}=await import('../server/lead-store.mjs');
 const {createRelayHandler}=await import('../server/garant-bani-relay.mjs');
 const store=openLeadStore(':memory:');let sent=0;
 const origin='https://dachapar.test';
 const server=createServer(createRelayHandler({config:{allowedOrigin:origin,siteBasePath:'/'},store,deliver:async()=>{sent++;},log:()=>{}}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const post=input=>new Promise((resolve,reject)=>{
  const req=request({hostname:'127.0.0.1',port:server.address().port,path:'/api/lead',method:'POST',headers:{origin,'content-type':'application/json'}},res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}));});req.on('error',reject);req.end(JSON.stringify({...input,requestId:crypto.randomUUID()}));
 });
 try{
  const rejected=await post({...lead,consentMethod:undefined});assert.equal(rejected.status,400);assert.equal(store.stats().total,0);assert.equal(sent,0);
  const accepted=await post(lead);assert.equal(accepted.status,200);assert.equal(sent,1);
  const saved=store.detail(accepted.body.leadId);assert.equal(saved.detail.consentEvidence.documentSha256,CONSENT_DOCUMENT_SHA256);assert.equal(saved.detail.name,'');assert.ok(saved.createdAt);
 }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});

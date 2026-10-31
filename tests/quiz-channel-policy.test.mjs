import {test} from 'node:test';
import assert from 'node:assert/strict';
import {QUIZ_CONTACT_CHANNELS,validQuizCatalogRequest} from '../api/server/quiz-channel-policy.mjs';
test('catalog-request callback allows only MAX WhatsApp Telegram',()=>{
 assert.deepEqual(QUIZ_CONTACT_CHANNELS,['max','whatsapp','telegram']);
 for(const channel of QUIZ_CONTACT_CHANNELS){
   assert.equal(validQuizCatalogRequest({purpose:'quiz_catalog',flow:'callback'},channel),true);
 }
});
test('catalog purpose never authorizes ordinary callbacks or quote configuration',()=>{
 for(const channel of ['phone','email','unknown','']){
   assert.equal(validQuizCatalogRequest({purpose:'quiz_catalog',flow:'callback'},channel),false);
 }
 assert.equal(validQuizCatalogRequest({flow:'callback'},'max'),false);
 assert.equal(validQuizCatalogRequest({purpose:'plan_info',flow:'callback'},'telegram'),false);
 assert.equal(validQuizCatalogRequest({purpose:'quiz_catalog',flow:'quote'},'telegram'),false);
 assert.equal(validQuizCatalogRequest({purpose:'quiz_catalog',flow:'callback',configuration:{}},'max'),false);
 assert.equal(validQuizCatalogRequest({purpose:'quiz_catalog',flow:'callback',planRequest:{id:'p1'}},'whatsapp'),false);
});

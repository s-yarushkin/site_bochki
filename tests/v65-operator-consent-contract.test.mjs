import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html');
const css=read('assets/css/site.css');
const app=read('assets/js/app.js');
const relay=read('server/garant-bani-relay.mjs');
const privacy=read('privacy.html');
const consent=read('consent.html');

test('V6.7 operator identity retained in privacy and consent documents, not on sales page',()=>{
  for(const source of [privacy,consent]){
    for(const id of ['«ВУДАРТ-ГРУПП»','3500023844','350001001','1263500003590']){
      assert.ok(source.includes(id),'Missing registered operator data '+id);
    }
    assert.ok(source.includes('Ленинградская, д. 97, помещение 25'),'Missing legal address');
  }
  assert.doesNotMatch(html,/class="container footer-operator"/);
  assert.doesNotMatch(html,/ВУДАРТ-ГРУПП|ООО|ИНН|Ленинградская, д. 97/);
  assert.match(html,/aria-label="Правовая информация"/);
  assert.match(html,/href="privacy\.html"/);
  assert.match(html,/href="consent\.html"/);
  assert.match(html,/Доставку, разгрузку, монтаж, основание/);
});

test('V6.5 policy is a separate noindex operator document with truthful MAX and external-fonts disclosures',()=>{
  for(const doc of [privacy,consent]){
    assert.match(doc,/noindex,nofollow/);
    assert.doesNotMatch(doc,/индивидуальному предпринимателю|ОГРНИП|\[EMAIL ДЛЯ ПДН\]|\[ФИО ИП/);
    assert.match(doc,/Российской Федерации|персональных данных/);
    assert.doesNotMatch(doc,/Проект для согласования|Проект для утверждения|требует согласования/);
  }
  assert.match(privacy,/закрытую рабочую группу мессенджера MAX/);
  assert.match(privacy,/Google Fonts/);
  assert.match(privacy,/не запрашивает через формы паспортные/);
  assert.match(privacy,/отзыв[ае]? согласия|отзыве согласия/i);
  assert.match(privacy,/30 дней/);
  assert.match(consent,/не распространяется на рекламные рассылки/);
  assert.match(consent,/кнопки «Отправить заявку»/);
});

test('submit consent has an individual linked document and server rejects absent or mismatched evidence',()=>{
  assert.doesNotMatch(html,/type="checkbox" name="leadConsent"/);
  assert.match(html,/id="submitConsentNotice"/);assert.match(html,/href="consent\.html"/);
  assert.match(app,/consentVersion:CONSENT_VERSION,consentMethod:CONSENT_METHOD/);
  assert.match(app,/comment,consent:true,consentVersion:CONSENT_VERSION,consentMethod:CONSENT_METHOD/);
  assert.match(html,/Отправляя заявку, вы подтверждаете/);
  assert.match(relay,/value\.consent!==true/);assert.match(relay,/CONSENT_METHOD_REQUIRED/);
});
test('submit notice stays readable and linked below the button on narrow screens',()=>{
 assert.ok(html.indexOf('id="submitConsentNotice"')<html.indexOf('id="submitButton"'));
 assert.match(css,/\.contact-dialog \.submit-consent-notice/);assert.match(css,/font-size:12px;line-height:1\.55/);
});

test('Consent version and signed document hash match the public consent revision',()=>{
  const contract=read('assets/js/lead-consent.js');
  const digest=createHash('sha256').update(consent,'utf8').digest('hex');
  assert.match(contract,/CONSENT_VERSION='2026-10-20'/);
  assert.match(contract,/CONSENT_METHOD='submit-button-v2'/);
  assert.ok(contract.includes(digest),'Consent digest must match public document');
  assert.match(privacy,/Нажатие кнопки «Отправить заявку»/);
});

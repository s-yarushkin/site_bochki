import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html');
const css=read('assets/css/site.css');
const app=read('assets/js/app.js');
const relay=read('server/garant-bani-relay.mjs');
const privacy=read('privacy.html');
const consent=read('consent.html');

test('V6.5 operator identity is precise and consistent in footer, policy and separate consent',()=>{
  for(const source of [html,privacy,consent]){
    for(const id of ['«ГАРАНТ-ГРУПП»','3525486964','352501001','1233500004650']){
      assert.ok(source.includes(id),'Missing registered operator data '+id);
    }
    assert.ok(source.includes('Герцена, д. 114, кв. 8'),'Missing postal/legal address');
  }
  assert.match(html,/class="container footer-operator"/);
  assert.match(html,/aria-label="Правовая информация"/);
  assert.match(html,/href="privacy\.html"/);
  assert.match(html,/href="consent\.html"/);
  assert.match(html,/Доставка рассчитывается отдельно/);
});

test('V6.5 policy is a separate noindex operator document with truthful MAX and external-fonts disclosures',()=>{
  for(const doc of [privacy,consent]){
    assert.match(doc,/noindex,nofollow/);
    assert.doesNotMatch(doc,/индивидуальному предпринимателю|ОГРНИП|\[EMAIL ДЛЯ ПДН\]|\[ФИО ИП/);
    assert.match(doc,/Российской Федерации|персональных данных/);
    assert.match(doc,/доработ|проверк|утверждени/i);
  }
  assert.match(privacy,/закрытую рабочую группу мессенджера MAX/);
  assert.match(privacy,/Google Fonts/);
  assert.match(privacy,/не запрашивает через формы паспортные/);
  assert.match(privacy,/отзыв[ае]? согласия|отзыве согласия/i);
  assert.match(privacy,/Конкретные сроки хранения/);
  assert.match(consent,/не распространяется на рекламные рассылки/);
  assert.match(consent,/отдельной установкой отметки/);
});

test('V6.5 explicit user consent is not prechecked or fabricated by app; server retains fail-closed validation',()=>{
  assert.match(html,/<input type="checkbox" id="leadConsent" name="leadConsent" required>/);
  assert.doesNotMatch(html,/name="leadConsent"[^>]*checked/);
  assert.match(html,/Согласию на обработку персональных данных/);
  assert.match(app,/if\(!f\.elements\.leadConsent\.checked\)/);
  assert.match(app,/consent:f\.elements\.leadConsent\.checked/);
  assert.doesNotMatch(app,/consent:true/);
  assert.match(relay,/value\.consent!==true/);
  assert.match(relay,/CONSENT_REQUIRED/);
});

test('V6.5 legal footer and consent control adapt to narrow screens and both themes',()=>{
  assert.match(css,/\.footer-operator\{display:grid/);
  assert.match(css,/@media\(max-width:700px\)\{\.footer-operator\{grid-template-columns:1fr/);
  assert.match(css,/\.contact-dialog label\.lead-consent-label\{display:grid/);
  assert.match(css,/\.contact-dialog \.lead-consent-label input\[type="checkbox"\]/);
  assert.match(css,/@media\(max-width:360px\)\{\.contact-dialog \.lead-consent-label/);
});

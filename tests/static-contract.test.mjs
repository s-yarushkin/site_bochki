import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/css/site.css',import.meta.url),'utf8');
const data=readFileSync(new URL('../data/pricebook.js',import.meta.url),'utf8');
const privacy=readFileSync(new URL('../privacy.html',import.meta.url),'utf8');
const consent=readFileSync(new URL('../consent.html',import.meta.url),'utf8');

test('S01 main publicly visible phone or tel link absent',()=>{assert.doesNotMatch(html,/\+7\s?9\d{2}\s?\d{3}/);assert.doesNotMatch(html,/href\s*=\s*["']tel:/i);});
test('S02 no messenger links in UI',()=>assert.doesNotMatch(html,/(t\.me\/|wa\.me\/|max\.ru\/|vk\.ru\/)/));
test('S03 only designated same-origin lead endpoint in forms',()=>{assert.match(script,/fetch\(new URL\('api\/lead',document\.baseURI\)/);assert.doesNotMatch(script,/XMLHttpRequest|sendBeacon|localStorage|sessionStorage/);});
test('S04 demo prices explicit, MAX forms declared',()=>{assert.match(html,/Цены и скидки условные/);assert.match(html,/Заявки принимаются через MAX/);});
test('S05 full and short callback flows',()=>{assert.match(html,/data-flow="quote"/);assert.match(html,/data-flow="callback"/);});
test('S06 asset slots for catalog and story',()=>{for(const item of ['catalog-kvadro','catalog-parus','catalog-viking','catalog-kvadro-house','hero-sun-desktop','hero-rain-desktop','stove-water-tank','polok-backlight','bundle-comfort'])assert.ok(html.includes(item)||script.includes(item)||data.includes(item),item);});
test('S07 seven defined screens',()=>assert.match(script,/const stepNames=\[[^;]+\];/));
test('S08 keyboard and motion accessibility',()=>{assert.match(css,/:focus-visible/);assert.match(css,/prefers-reduced-motion/);});
test('S09 no pricing engine embedded directly in UI',()=>assert.match(script,/from '\.\/quote-engine\.js'/));
test('S10 no invented first firing time',()=>assert.doesNotMatch(html,/за (?:30|60|90|120) минут|за 2 часа/));
test('S11 success only after MAX receipt; independent privacy and consent documents linked',()=>{
  assert.match(script,/receipt\?\.delivered!==true/);
  assert.doesNotMatch(html,/name="leadConsent"/);
  assert.match(html,/href="privacy\.html"/);
  assert.match(html,/href="consent\.html"/);
  assert.match(html,/Нажимая «Отправить заявку»/);
  assert.match(privacy,/Политика в отношении обработки персональных данных/);
  assert.match(consent,/Согласие на обработку персональных данных/);
});
test('S12 no unconditional price valid statement',()=>assert.match(html,/не оферта/));

test('S13 protected preview noindex and honeypot',()=>{assert.match(html,/name="robots" content="noindex,nofollow"/);assert.match(html,/name="website" tabindex="-1"/);assert.match(css,/\.honeypot/);});

test('S14 callback phone-only; quote four channels all tied to mobile number',()=>{
  for(const choice of ['phone','telegram','max','whatsapp'])assert.match(html,new RegExp('value="'+choice+'"'));
  assert.match(html,/id="phoneHint"/);
  assert.match(html,/id="contactChannelField"/);
  assert.match(script,/contactChannelField'\)\.hidden=callback/);
  assert.match(script,/formatRussianMobile/);
  assert.match(script,/phone\.addEventListener\('blur'/);
  assert.match(script,/showError\(/);
  assert.match(script,/document\.addEventListener\('click'/);
  assert.doesNotMatch(html,/id="contactAccountField"/);
  assert.doesNotMatch(script,/contactAccount/);
  assert.match(css,/\.phone-hint\[data-valid="false"\]/);
});
test('S15 privacy and separate consent pages have operator placeholders and processing terms',()=>{
  for(const doc of [privacy,consent]){
    for(const term of ['[ФИО ИП','[ИНН','[ОГРНИП','[EMAIL','[АДРЕС'])assert.ok(doc.includes(term),term);
    assert.match(doc,/152-ФЗ|персональных данных/);
    assert.match(doc,/noindex,nofollow/);
  }
  assert.match(privacy,/Права посетителя/);
  assert.match(privacy,/Сроки обработки и хранения/);
  assert.match(consent,/Отзыв согласия/);
  assert.match(html,/footer-legal/);
});

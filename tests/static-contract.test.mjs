import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/css/site.css',import.meta.url),'utf8');
const themeCss=readFileSync(new URL('../assets/css/themes-v5.css',import.meta.url),'utf8');
const data=readFileSync(new URL('../data/pricebook.js',import.meta.url),'utf8');
const privacy=readFileSync(new URL('../privacy.html',import.meta.url),'utf8');
const consent=readFileSync(new URL('../consent.html',import.meta.url),'utf8');
const manager=readFileSync(new URL('../manager.html',import.meta.url),'utf8');
const managerJs=readFileSync(new URL('../assets/js/manager.js',import.meta.url),'utf8');
const managerCss=readFileSync(new URL('../assets/css/manager.css',import.meta.url),'utf8');
const systemd=readFileSync(new URL('../ops/systemd/garant-bani-relay.service',import.meta.url),'utf8');


test('S01 main publicly visible phone or tel link absent',()=>{assert.doesNotMatch(html,/\+7\s?9\d{2}\s?\d{3}/);assert.doesNotMatch(html,/href\s*=\s*["']tel:/i);});
test('S02 no messenger links in UI',()=>assert.doesNotMatch(html,/(t\.me\/|wa\.me\/|max\.ru\/|vk\.ru\/)/));
test('S03 only designated same-origin lead endpoint in forms',()=>{assert.match(script,/fetch\(new URL\('api\/lead',document\.baseURI\)/);assert.doesNotMatch(script,/XMLHttpRequest|sendBeacon|localStorage|sessionStorage/);});
test('S04 demo prices explicit, MAX forms declared',()=>{assert.match(html,/Цены и скидки условные/);assert.match(html,/Заявки принимаются через MAX/);});
test('S05 full and short callback flows',()=>{assert.match(html,/data-flow="quote"/);assert.match(html,/data-flow="callback"/);});
test('S06 real asset slots for catalog and story',()=>{
  // The former unverified polok/stove image slots are replaced by documented
  // real-object/interior photography. Do not reintroduce misleading placeholders.
  const staticSlots=['hero-sun-desktop','bundle-comfort','cta-evening-cozy',
    'product-steam','product-interior','site-example','side-kvadro-house'];
  for(const slot of staticSlots)assert.ok(
    html.includes('data-slot="'+slot+'"'), 'Missing real-page slot '+slot);
  for(const slot of ['catalog-kvadro','catalog-parus','catalog-viking','catalog-kvadro-house']){
    assert.ok(data.includes("slot:'"+slot+"'"),'Missing catalog model slot '+slot);
  }
  const media=readFileSync(new URL('../assets/js/media-v5.js',import.meta.url),'utf8');
  for(const slot of [...staticSlots.filter(v=>v!=='hero-sun-desktop'),'hero-sun-desktop','hero-rain-desktop',
      'catalog-kvadro','catalog-parus','catalog-viking','catalog-kvadro-house']){
    assert.ok(media.includes("'"+slot+"'"),'Missing local media mapping '+slot);
  }
  assert.doesNotMatch(html,/data-slot="(?:stove-water-tank|polok-backlight)"/);
});
test('S06b catalog buttons are registered as a collection and full startup remains reachable',()=>{
  // A single querySelector result has no forEach; this silently broke all
  // startup handlers including SUN/RAIN despite 77/77 passing previously.
  assert.match(script,/\$\$\('\[data-catalog-select\]'\)\.forEach/);
  assert.doesNotMatch(script,/(?<!\$)\$\('\[data-catalog-select\]'\)\.forEach/);
  assert.match(script,/function boot\(\)\{renderCatalog\(\);renderBundle\(\);initWeather\(\);initAtmosphere\(\);initBuilder\(\);initMobileMenu\(\);initForms\(\);syncMedia\(\)/);
});
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
test('S15 mobile validation feedback clears on edit; required marker remains inline',()=>{
  assert.match(script,/form\.addEventListener\('input'/);
  assert.match(script,/form\.addEventListener\('change'/);
  assert.match(css,/\.contact-dialog label:not\(\.demo-consent\)\{display:block\}/);
  assert.match(css,/\.contact-dialog label b\{display:inline\}/);
  assert.match(css,/\.contact-dialog \.form-error:empty\{display:none\}/);
});
test('S15 privacy and separate consent pages have operator placeholders and processing terms',()=>{
  for(const doc of [privacy,consent]){
    for(const term of ['[ФИО ИП','[ИНН','[ОГРНИП','[EMAIL','АДРЕС'])assert.ok(doc.includes(term),term);
    assert.match(doc,/152-ФЗ|персональных данных/);
    assert.match(doc,/noindex,nofollow/);
  }
  assert.match(privacy,/Права посетителя/);
  assert.match(privacy,/Сроки обработки и хранения/);
  assert.match(consent,/Отзыв согласия/);
  assert.match(html,/footer-legal/);
});

test('S16 protected manager interface has separate login, full quote and status editor',()=>{
  assert.match(manager,/id="loginForm"/);
  assert.match(manager,/id="managerPhone"/);
  assert.match(manager,/id="activeManager"/);
  assert.match(manager,/id="leadsList"/);
  assert.match(manager,/id="selectedOptions"/);
  assert.match(manager,/id="editStatus"/);
  assert.match(manager,/id="editNote"/);
  assert.match(manager,/noindex,nofollow,noarchive/);
  assert.match(manager,/default-src 'none'/);
  assert.match(managerJs,/\.textContent/);
  assert.doesNotMatch(managerJs,/innerHTML|localStorage|sessionStorage/);
  assert.match(managerCss,/@media\(max-width:690px\)/);
  assert.match(html,/href="manager\.html"/);
});
test('S17 lead snapshots include finish and request id; service persists SQLite separately from public files',()=>{
  assert.match(script,/requestId:formRequestId/);
  assert.match(script,/finish:state\.finish/);
  assert.match(systemd,/StateDirectory=garant-bani-relay/);
  assert.doesNotMatch(systemd,/LoadCredential=manager-password-hash/);
  assert.match(systemd,/LoadCredential=manager-accounts/);
  assert.match(systemd,/LoadCredential=manager-session-secret/);
  assert.match(systemd,/LEADS_DB_PATH=\/var\/lib\/garant-bani-relay\/leads\.sqlite/);
});

test('S18 full SUN/RAIN layer and off-photo switcher',()=>{
  assert.match(html,/<html lang="ru" data-theme="sun">/);
  assert.match(html,/href="assets\/css\/themes-v5\.css"/);
  const hero=html.search(/<section\s+class="hero(?:\s[^\"]*)?"/);
  const toolbar=html.indexOf('class="container hero-toolbar"');
  const toggle=html.indexOf('<div class="hero-weather">');
  const copy=html.indexOf('<div class="hero-copy">');
  const art=html.indexOf('<div class="hero-art">');
  assert.ok(hero>=0&&toolbar>hero&&toggle>toolbar&&toggle<copy&&copy<art,
    'weather switch must be in a standalone toolbar before hero product grid');
  assert.ok(html.slice(hero,toolbar).includes('class="weather-sky"'),
    'V6 decorative sky must precede toolbar and never intercept the switch');
  assert.match(themeCss,/\.hero-toolbar\{display:flex/);
  assert.match(themeCss,/\.hero-grid\{grid-template-columns:minmax\(0,1\.03fr\)/);
  assert.match(script,/document\.documentElement\.dataset\.theme=weather/);
  assert.match(themeCss,/:root\[data-theme="sun"\]/);
  assert.match(themeCss,/:root\[data-theme="rain"\]/);
  assert.match(themeCss,/\.hero-weather\{position:static/);
  for(const section of ['hero','catalog','builder-section','faq','final-cta','footer','contact-dialog']){
    assert.ok(themeCss.includes('.'+section),section);
  }
  assert.doesNotMatch(script,/localStorage|sessionStorage/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {validateBaniLead,formatBaniLead} from '../server/garant-bani-relay.mjs';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('index.html'),js=read('assets/js/app.js'),css=read('assets/css/dachapar-v72.css');
const privacy=read('privacy.html'),consent=read('consent.html'),requisites=read('requisites.html');

test('V7.2 visible identity is Dacha Par; company appears only in linked legal documents',()=>{
  assert.match(html,/<title>Готовые бани с доставкой в Москву и области — Дача Пар<\/title>/);
  assert.match(html,/>ДАЧА ПАР<\/strong>/);
  assert.match(html,/href="requisites\.html">Юридическая информация<\/a>/);
  assert.match(html,/href="privacy\.html">Политика обработки персональных данных<\/a>/);
  assert.match(html,/href="consent\.html">Согласие на обработку персональных данных<\/a>/);
  assert.doesNotMatch(html,/ГАРАНТ БАНИ|Гарант Бани|ООО|ВУДАРТ-ГРУПП|3500023844/);
  assert.doesNotMatch(js,/«Гарант Бани»|«ГАРАНТ БАНИ»/);
  assert.match(read('manager.html'),/Заявки — Дача Пар/);
  assert.match(html,/href="assets\/images\/dachapar-favicon\.svg"/);
  assert.match(html,/href="assets\/css\/dachapar-v72\.css"/);
  assert.match(requisites,/ООО «ВУДАРТ-ГРУПП»/);
  assert.match(requisites,/3500023844/);
  assert.match(requisites,/1263500003590/);
  assert.match(requisites,/Ленинградская, д\. 97/);
  assert.match(privacy,/ВУДАРТ-ГРУПП/);
  assert.match(consent,/ВУДАРТ-ГРУПП/);
  assert.doesNotMatch(privacy+consent+requisites,/ГАРАНТ-ГРУПП|Герцена|3525486964/);
});
test('V73 retains original base elements and adds floor and electrical safety panel',()=>{
  const base=html.match(/<section class="base-kit section"[\s\S]*?<\/section>/)?.[0]||'';
  assert.match(base,/всё главное для вашей бани/);
  assert.equal((base.match(/<li>/g)||[]).length,19);
  for(const item of ['Надёжная, проверенная печь','Дымоход','55 л','Двухъярусные лежаки','Трапик','минерита',
                     'Две скамейки','Вешалка','60 × 80','вынесенный по центру',
                     'Ступенька','Внутренняя электрика и освещение','Слив','Вентиляция',
                     'Электрощит','Напольная конструкция','Обручи','гибкой черепицы','в два слоя'])assert.ok(base.includes(item),item);
  assert.match(base,/data-flow="callback" data-topic=/);
  assert.match(html,/id="bundleNew">618 022 ₽/);
  assert.match(html,/id="quoteTotal">505 000 ₽/);
  assert.match(js,/Базовая комплектация от/);
  assert.match(js,/from '\.\/quote-engine\.js'/);
});
test('V7.2 custom and delivery blocks guide directly to a manager, with no false universal promise',()=>{
  assert.match(html,/id="personal"/);
  assert.match(html,/id="delivery"/);
  assert.match(html,/Подсветка полков/);
  assert.match(html,/скамейки с ящиками/i);
  assert.match(html,/топки на улицу/);
  assert.match(html,/манипулятором/);
  assert.match(html,/ориентировочно за два дня/);
  assert.match(html,/собираем и вывозим монтажный мусор/);
  assert.doesNotMatch(html,/гарантируем сборку за два дня|бесплатная доставка/);
  assert.ok((html.match(/data-flow="callback" data-topic=/g)||[]).length>=3);
  assert.match(js,/trigger\.dataset\.topic\|\|''/);
  assert.match(js,/elements\.comment\.value=formFlow==='callback'\?formTopic:''/);
  assert.match(css,/@media\(max-width:600px\)/);
});
test('V7.2 new consent edition works while existing 2026-10-12 clients remain supported',()=>{
  assert.match(js,/consentVersion:CONSENT_VERSION/);
  const example=version=>({
    flow:'callback',consent:true,consentVersion:version,name:'',phone:'+7 (900) 123-45-67',
    contactChannel:'phone',comment:'Подбор комплектации'
  });
  for(const v of ['2026-10-12','2026-10-14']){
    const lead=validateBaniLead(example(v));
    assert.equal(lead.consentEvidence.version,v);
    const alert=formatBaniLead(lead);
    assert.match(alert,v==='2026-10-14'?/НОВАЯ ЗАЯВКА — ДАЧА ПАР/:/НОВАЯ ЗАЯВКА — ГАРАНТ БАНИ/);
  }
  assert.throws(()=>validateBaniLead(example('2026-10-15')),/CONSENT_VERSION_UNSUPPORTED/);
});

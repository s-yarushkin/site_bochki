import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html'), app=read('assets/js/app.js');
const pricebook=read('data/pricebook.js'), consent=read('consent.html'),privacy=read('privacy.html');
const styles=read('assets/css/weather-v6.css');

test('client-facing preview has no development labels but preserves honest pricing and legal routes',()=>{
  const client=html+'\n'+app;
  assert.doesNotMatch(client,/ДЕМО-КАТАЛОГ|ФОТОСЛОТ|2D · демо|деморасчёт|демоцена|демопрайс|демосмета|демонстрационный прототип|заявки принимаются через MAX/i);
  assert.doesNotMatch(html,/Чаще всего у нас покупают/);
  assert.doesNotMatch(html,/href="manager\.html"/);
  assert.doesNotMatch(html,/data-view="plan"/);
  assert.match(html,/Стоимость комплекта/);
  assert.match(html,/id="bundleNew">613 977 ₽/);
  assert.match(html,/Расчёт ориентировочный, не является офертой/);
  assert.doesNotMatch(html,/Газон и деревянные дорожки добавлены для наглядности и в комплектацию не входят/);
  assert.doesNotMatch(html,/Это рекламные изображения, а не фото готового заказа/);
  assert.match(html,/href="privacy\.html"/);
  assert.match(html,/href="consent\.html"/);
  assert.match(pricebook,/status:CATALOG.status==='APPROVED'\?'APPROVED':'DEMO_ONLY'/); // Owner catalog remains a draft.
  for(const doc of [privacy,consent]){
    assert.match(doc,/«ВУДАРТ-ГРУПП»/);
    assert.match(doc,/3500023844/);
    assert.match(doc,/1263500003590/);
    assert.doesNotMatch(doc,/индивидуальному предпринимателю|ОГРНИП|\[ФИО ИП/);
    assert.match(doc,/Ленинградская, д\. 97, помещение 25/); // Postal request address is stated without invented email.
  }
});

test('V6.3 links land below sticky header and catalog has a compact viewport layout',()=>{
  for(const id of ['models','bundle','delivery','builder']){
    assert.match(html,new RegExp('id="'+id+'"'));
    assert.match(styles,new RegExp('#'+id));
  }
  assert.match(styles,/scroll-margin-top:88px/);
  assert.match(styles,/max-height:850px/);
  assert.match(styles,/\.catalog \.product-media\{aspect-ratio:1\.64\}/);
  assert.match(html,/Четыре модели\. Выберите баню для своих выходных/);
  assert.match(html,/class="editorial-keep">Не&nbsp;руководить стройкой/);
  assert.doesNotMatch(html,/Реальная баня\. Газон и деревянные дорожки на изображении/);
});
test('same scene has identical sun and rain crop selectors',()=>{
  for(const slot of ['catalog-kvadro-house','bundle-comfort','side-kvadro-house']){
    assert.match(styles,new RegExp('data-slot="'+slot+'-rain"'));
  }
  assert.match(styles,/hero-rain-desktop/);
});

test('no unfinished internal copy leaks into customer-facing strings',()=>{
  const client=html+'\n'+app;
  for(const bad of [
    'Подтверждённые показатели добавим после получения данных производителя',
    'пока у нас нет утверждённого прайса',
    'Это поможет затем уточнить доставку и установку. Это поможет',
    'Заявка доставлена менеджеру «Гарант Бани» в MAX',
    'Не удалось доставить заявку в MAX',
    'Выгода комплекта','Скидка на допы',
    'Расчётное уменьшение '
  ])assert.doesNotMatch(client,new RegExp(bad));
  assert.match(client,/Корректировка предварительной суммы/);
  assert.match(html,/Большинство наших бань готовы к парению примерно через 2–3 часа/);
});

test('V6.3 short laptop catalog and exact release packaging keep viewport/nav and favicon coherent',()=>{
  assert.match(styles,/html\{scroll-padding-top:0\}/);
  assert.match(styles,/\.hero\{overflow:clip\}/); // No programmatic hero scroll after 320px RAIN click.
  assert.match(styles,/@media\(min-width:1100px\) and \(max-height:800px\)/);
  assert.match(styles,/@media\(min-width:1100px\) and \(max-height:740px\)/);
  assert.match(html,/assets\/images\/dachapar-favicon\.svg/);
  const packageScript=read('ops/v63-build-preview-zip.ps1');
  assert.match(packageScript,/assets\/images\/garant-bani-favicon\.svg/);
  assert.match(read('ops/v72-build-preview-bundle.ps1'),/assets\/images\/dachapar-favicon\.svg/);
  assert.doesNotMatch(packageScript,/'assets\/images\/placeholder\.svg'/);
  assert.match(styles,/window-masked dusk|window-masked/i);
});

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
  assert.match(html,/Ориентировочная стоимость комплекта/);
  assert.match(html,/Расчёт ориентировочный, не является офертой/);
  assert.match(html,/Газон и деревянные дорожки добавлены для наглядности и в комплектацию не входят/);
  assert.match(html,/href="privacy\.html"/);
  assert.match(html,/href="consent\.html"/);
  assert.match(pricebook,/status: 'DEMO_ONLY'/); // Never turn sample prices into a certified pricebook.
  assert.match(privacy,/\[ФИО ИП/);
  assert.match(consent,/\[ФИО ИП/);
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
  assert.match(html,/Время прогрева зависит от модели, печи и погоды/);
});

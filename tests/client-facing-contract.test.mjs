import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html'), app=read('assets/js/app.js');
const pricebook=read('data/pricebook.js'), consent=read('consent.html'),privacy=read('privacy.html');

test('client-facing preview has no development labels but preserves honest pricing and legal routes',()=>{
  const client=html+'\n'+app;
  assert.doesNotMatch(client,/ДЕМО-КАТАЛОГ|ФОТОСЛОТ|2D · демо|деморасчёт|демоцена|демопрайс|демосмета|демонстрационный прототип|заявки принимаются через MAX/i);
  assert.doesNotMatch(html,/Чаще всего у нас покупают/);
  assert.doesNotMatch(html,/href="manager\.html"/);
  assert.doesNotMatch(html,/data-view="plan"/);
  assert.match(html,/Ориентировочная стоимость комплекта/);
  assert.match(html,/Расчёт ориентировочный, не является офертой/);
  assert.match(html,/Газон и деревянные дорожки на изображении — визуализация благоустройства/);
  assert.match(html,/href="privacy\.html"/);
  assert.match(html,/href="consent\.html"/);
  assert.match(pricebook,/status: 'DEMO_ONLY'/); // Never turn sample prices into a certified pricebook.
  assert.match(privacy,/\[ФИО ИП/);
  assert.match(consent,/\[ФИО ИП/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=source('index.html');
const app=source('assets/js/app.js');
const media=source('assets/js/media-v5.js');
const css=source('assets/css/site.css');
const book=JSON.parse(source('data/catalog-pricebook.json'));

test('V6.6 retail-facing copy contains no internal rendering or source-provenance notices',()=>{
  const publicCopy=html+'\n'+app;
  for(const phrase of [
    /Это рекламные изображения, а не фото готового заказа/i,
    /Визуализация модели по каталогу/i,
    /Каталог: интерьер модели/i,
    /Каталоговый вид модели/i,
    /Изображение рекламное/i,
    /фактическ.*визуализ.*из каталог/i
  ])assert.doesNotMatch(publicCopy,phrase);
  assert.match(html,/У каждой модели — свой характер/);
  assert.match(html,/Квадро 5 м · Комфорт/);
  assert.doesNotMatch(html,/Комплектация без обливного устройства/);
  assert.match(html,/Парная, комната отдыха и всё полезное/);
  assert.match(css,/\.bundle-list \.bundle-item::before\{content:none;display:none\}/);
  for(const id of ['socket_kit_owner','electrical_distribution_owner','electrical_safety_cabinet_temporary_supply']){
    assert.doesNotMatch(book.options[id].label,/\(.*уточнить|после проверки проекта/);
  }
  assert.equal(book.options.electrical_safety_cabinet_temporary_supply.requiresTechnicalApproval,true);
});

test('V6.6 customer gallery identifies four models with distinct interiors, no shared generic room',()=>{
  for(const model of ['kvadro','parus','viking','kvadro-house']){
    assert.match(html,new RegExp('data-model-jump="'+model+'"'));
    assert.ok(media.includes("'interior-"+model+"'"),'missing interior for '+model);
    assert.ok(media.includes("'catalog-"+model+"'"),'missing exterior for '+model);
  }
  assert.doesNotMatch(html,/data-slot="product-interior"/);
});

test('V6.6 SUN/RAIN hero remains present, while catalog media metadata stays internal',()=>{
  assert.match(html,/id="heroMedia" data-slot="hero-sun-desktop"/);
  assert.match(app,/weather==='rain'\?'hero-rain-desktop':'hero-sun-desktop'/);
  assert.ok(media.includes("'hero-sun-desktop':{file:'hero-sun.webp'"));
  assert.ok(media.includes("'hero-rain-desktop':{file:'hero-sun.webp'"));
  for(const term of ['по каталогу производителя','каталоговая визуализация','из каталога']){
    const catalogBlock=media.split("  'catalog-kvadro':")[1].split("  'product-front':null")[0];
    assert.ok(!catalogBlock.includes(term),'accessibility text leaks implementation detail '+term);
  }
});

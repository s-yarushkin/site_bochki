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
  assert.match(html,/Четыре модели\. Выберите баню/);
  assert.match(html,/Квадро 5 м · Комфорт/);
  assert.doesNotMatch(html,/Комплектация без обливного устройства/);
  // The catalogue may contain twelve priced options, but the buyer sees benefits,
  // not technical quantities or a bill of materials.
  assert.equal(book.featuredBundle.selectedOptionIds.length,12);
  const feature=html.match(/<section class="bundle-section section"[\s\S]*?<\/section>/)?.[0]||'';
  assert.match(feature,/Больше света, больше уюта/);
  assert.match(feature,/увеличенному окну/);
  assert.match(feature,/стеклянной двери в парную/);
  assert.match(feature,/утеплённый пол/);
  assert.match(feature,/места для хранения/);
  assert.match(feature,/id="bundleNew">613 977 ₽/);
  assert.doesNotMatch(feature,/\b\d+\s+(?:дополнени[йя]|опци[йя]|позиций)/i);
  assert.doesNotMatch(app,/q\.options\.length\} дополнительных опций\$\{q\.bundleApplied/);
  assert.match(html,/id="base"[\s\S]*?всё главное для вашей бани/);
  assert.match(css,/\.bundle-list \.bundle-item::before\{content:none;display:none\}/);
  for(const id of ['socket_kit_owner','electrical_distribution_owner','electrical_safety_cabinet_temporary_supply']){
    assert.equal(book.options[id],undefined);
  }
  assert.equal(book.baseInclusions.priceApprovalGate.electricalShield,'OWNER_PLANNING_RESERVE_INCLUDED');
});

test('V6.6 model cards show a full unbroken price and all size choices',()=>{
  const responsive=source('assets/css/weather-v6.css');
  assert.match(app,/const catalogSizes=model=>/);
  assert.match(app,/Object\.keys\(model\.sizes\)\.map\(sz=>\(Number\(sz\)\/100\)/);
  assert.match(responsive,/\.catalog \.product-meta\{[\s\S]*?display:grid;/);
  assert.match(responsive,/\.catalog \.product-price\{\s*white-space:nowrap;/);
  assert.match(responsive,/\.catalog \.product-sizes\{\s*white-space:normal;/);
});

test('V6.6 customer gallery identifies four models with distinct interiors, no shared generic room',()=>{
  for(const model of ['kvadro','parus','viking','kvadro-house']){
    assert.match(app,/data-gallery-open=/);
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

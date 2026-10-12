import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html');
const css=read('assets/css/weather-v6.css');

test('V6.4 removes two requested distracting captions while preserving photo and price transparency elsewhere',()=>{
  assert.doesNotMatch(html,/На фото — настоящая баня\. Газон и деревянные дорожки добавлены для наглядности и в комплектацию не входят\./);
  assert.doesNotMatch(html,/Стоимость приведена для примера\. Состав комплекта, окончательную цену и возможность установки опций уточнит менеджер\./);
  assert.doesNotMatch(html,/class="hero-art-note"/);
  assert.doesNotMatch(html,/Это рекламные изображения, а не фото готового заказа/); // Owner requests no internal production notes in customer copy.
  assert.match(html,/Указаны ориентировочные цены для примера подбора/);
  assert.match(html,/Предварительная стоимость комплекта/);
  assert.match(html,/Расчёт ориентировочный, не является офертой/);
  assert.match(html,/href="privacy\.html"/);
  assert.match(html,/href="consent\.html"/);
});

test('V6.4 substantive comparison answers cheaper lookalikes without unsupported competitor allegations',()=>{
  assert.match(html,/<section class="difference section" id="why-us" aria-labelledby="differenceTitle">/);
  assert.match(html,/На фото бани похожи\. <em>Но разница — в конструкции\.<\/em>/);
  assert.match(html,/Да, похожую баню можно найти дешевле/);
  assert.match(html,/Мы не пытаемся выпускать 50 разных бань/);
  assert.match(html,/За годы работы мы изготовили сотни бань этих моделей/);
  for(const topic of ['Прогрев и комфорт','Водоотведение','Надёжность на годы','Путь до участка']){
    assert.ok(html.includes(topic),'missing comparative aspect '+topic);
  }
  assert.equal((html.match(/class="difference-point"/g)||[]).length,4);
  assert.match(html,/href="#builder">Выбрать свою модель/);
  assert.doesNotMatch(html,/другие производители делают некачественно|конкуренты обманывают/);
});

test('V6.4 FAQ has five concise and specific customer answers',()=>{
  const items=[...html.matchAll(/<details><summary>(.*?)<\/summary><p>(.*?)<\/p><\/details>/g)];
  assert.equal(items.length,5);
  const faq=new Map(items.map(([,question,answer])=>[question,answer]));
  assert.match(faq.get('Нужно ли строить баню на участке?'),/Большинство наших бань приезжают уже в готовом виде/);
  assert.match(faq.get('Нужно ли строить баню на участке?'),/Подготовьте основание/);
  assert.match(faq.get('Можно ли париться в день доставки?'),/^Да\./);
  assert.match(faq.get('Можно ли париться в день доставки?'),/Если основание заранее подготовлено/);
  assert.match(faq.get('Входит ли доставка в стоимость?'),/доставка оплачивается отдельно/);
  assert.match(faq.get('За сколько баня прогревается?'),/2–3 часа после растопки печи/);
  assert.match(faq.get('Можно ли изменить выбранную комплектацию?'),/До начала изготовления согласуем/);
  assert.doesNotMatch(items.map(x=>x[2]).join(' '),/зависит от модели, печи и погоды|без пустых обещаний/);
});

test('V6.4 trust section supports both themes and a single-column mobile layout',()=>{
  assert.match(css,/\.difference-intro\{[\s\S]*?grid-template-columns:minmax\(0,1\.15fr\)/);
  assert.match(css,/\.difference-grid\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css,/\.difference-point\{/);
  assert.match(css,/:root\[data-theme="rain"\] \.difference h2 em/);
  assert.match(css,/@media\(max-width:650px\)\{/);
  assert.match(css,/\.difference-grid\{grid-template-columns:1fr/);
  assert.match(css,/\.difference-bottom\{align-items:stretch;flex-direction:column/);
});

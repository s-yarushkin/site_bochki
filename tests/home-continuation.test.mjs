import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {homeSelectionText,homeInquiryPayload} from '../concepts/bath-choice/continuation-state.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const page=read('output/bath-choice-prototype/index.html');
const baseline=read('concepts/bath-choice/baseline-v5/index.html');
const book=JSON.parse(read('output/bath-choice-prototype/data/catalog-pricebook.json'));
const plans=JSON.parse(read('concepts/bath-choice/geometry/index.json')).plans;

test('every protected lower section keeps its markup except approved edits and care directly precedes the closing',()=>{
 const report=JSON.parse(read('concepts/bath-choice/home-preservation-audit.json'));
 assert.equal(report.pass,true);assert.equal(report.sections.length,7);
 assert.equal(report.sections.filter(s=>s.unchanged).length,5);
 for(const section of baseline.slice(baseline.indexOf('<section class="ritual"'),baseline.indexOf('</main>')).matchAll(/<section\b.*?<\/section>/gs)){
  if(section[0].includes('id="comfort"'))continue;
  const expected=section[0].includes('id="individual"')
   ? section[0].replace('<a class="textlink" href="/planirovki/">Посмотреть примеры планировок →</a>','')
   : section[0];
  assert.ok(page.includes(expected),section[0].slice(0,100));
 }
 assert.match(page,/<\/section>\s*<section class="choice-page choice-care"[^]*?<\/section>\s*<section class="closing section"/);
 assert.equal((page.match(/id="care"/g)||[]).length,1);
 assert.match(page, /Почему нам можно доверять/);
 assert.doesNotMatch(page, /data-production[ >]/);
 assert.equal((page.match(/id="ritual"/g)||[]).length,1);
});

test('the first screen has no Vologda copy and the original footer remains truthful',()=>{
 const hero=page.match(/<section class="hero.*?<\/section>/s)[0];
 assert.doesNotMatch(hero,/Вологд/i);assert.match(hero,/Поможем выбрать, изготовим и установим/);
 assert.match(page.slice(page.indexOf('<footer')),/Производство — Вологда/);
});

test('the included equipment is described plainly, with the package named correctly',()=>{
 const text=page.match(/<section class="quiet section" id="comfort">.*?<\/section>/s)[0];
 assert.match(text,/В комплектации «Комфорт»/);assert.match(text,/Печь с камнями и дымоходом/);
 assert.doesNotMatch(text,/в Комфорте|ASTON|2200|687|Увеличенное окно/);
 assert.ok(text.includes('href="/komplektaciya/"'));
});

test('closing text and inquiry preserve size, package, layout and the chosen contact channel',()=>{
 const state={model:'viking',size:'550',package:'deluxe',layout:'dp3d-19'};
 assert.match(homeSelectionText(book,state),/Викинг · 5,5 м.*в комплектации «Делюкс»/);
 const payload=homeInquiryPayload(book,plans,state,{phone:'+79991234567',channel:'max',name:'Тест',settlement:'Московская область'},'00000000-0000-4000-8000-000000000001');
 assert.equal(payload.contactChannel,'max');assert.match(payload.comment,/DP3D-19/);assert.match(payload.comment,/Делюкс/);assert.match(payload.comment,/5,5 м/);
 assert.equal(payload.journeyContext.pagePath,'/');
 assert.throws(()=>homeInquiryPayload(book,plans,{...state,layout:'dp3d-06'},{phone:'+79991234567',channel:'max'},'test-no-send'),/SELECTION_MISMATCH/);
});

test('the R117 quiz remains byte-for-byte identical in the assembled page',()=>{
 const files=JSON.parse(read('concepts/bath-choice/baseline/metadata.json')).files;
 const hash=createHash('sha256').update(readFileSync(new URL('../output/bath-choice-prototype/quiz.mjs',import.meta.url))).digest('hex');
 assert.equal(hash,files.find(f=>f.path==='quiz.mjs').sha256);
});

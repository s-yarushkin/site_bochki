import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../quadro-ready/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../quadro-ready/site.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../quadro-ready/site.js',import.meta.url),'utf8');
const privacy=readFileSync(new URL('../quadro-ready/privacy.html',import.meta.url),'utf8');
const consent=readFileSync(new URL('../quadro-ready/consent.html',import.meta.url),'utf8');
test('standalone READY landing has honest noindex draft and real CTA targets',()=>{
  assert.match(html,/name="robots" content="noindex,nofollow/);
  for(const id of ['choice','inside','plan','delivery','faq','request'])assert.ok(html.includes('id="'+id+'"'));
  for(const id of ['choice','inside','request'])assert.ok(html.includes('href="#'+id+'"'));
  assert.match(html,/КВАДРО READY/);
  assert.doesNotMatch(html,/href=["']#["']/);
  assert.doesNotMatch(html,/href=["']tel:|href=["']javascript:/);
});
test('form captures the standard-only 5/6 and color, asks explicit consent',()=>{
  for(const x of ['data-size="5"','data-size="6"','data-color="natural"','data-color="walnut"','data-color="graphite"'])
    assert.ok(html.includes(x),x);
  assert.match(html,/name="consent" required/);
  assert.match(html,/\.\/privacy\.html/);
  assert.match(html,/\.\/consent\.html/);
  assert.match(js,/api\/leads\/quadro-ready/);
  assert.match(js,/result\?\.persisted/);
  assert.match(js,/requestId/);
  assert.doesNotMatch(js,/optionIds|extraPackage|bundleChoice/);
});
test('price shown as provisional, no fake discount or hidden foundation cost',()=>{
  assert.match(html,/Проектная стоимость/);
  assert.match(html,/Фундамент не входит/);
  assert.match(html,/Бесплатно расскажем/);
  assert.doesNotMatch(html,/<del>|<s>|text-decoration:\s*line-through|829\s?000|879\s?000/);
  assert.match(privacy,/НЕ ДЛЯ ПУБЛИКАЦИИ/);
  assert.match(consent,/НЕ ДЛЯ ПУБЛИКАЦИИ/);
});
test('photo placeholders are named, honest and never replaced by stock',()=>{
  for(const x of ['ФОТО 01','ФОТО 02','ФОТО 03','ФОТО 04','ФОТО 05','ФОТО 06','Чертёж с размерами','Разрез бани'])
    assert.ok(html.includes(x),x);
  assert.match(html,/не строительный чертёж/);
  assert.match(html,/Боковой вход/);
  assert.doesNotMatch(css,/@import|fonts\.googleapis\.com/);
  assert.match(css,/@media\(max-width:560px\)/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {layoutOverview,layoutSeparateAgreement} from '../concepts/home-hero/layout-story.mjs';
const spec=n=>JSON.parse(readFileSync(new URL('../concepts/home-hero/layouts/specs/'+String(n).padStart(2,'0')+'.json',import.meta.url)));

test('room descriptions keep the steam bench separate from the two lounge benches',()=>{
 const rooms=layoutOverview(spec(1));
 assert.equal(rooms.length,2);
 assert.match(rooms.find(r=>r.kind==='steam').description,/скамейка/);
 assert.match(rooms.find(r=>r.kind==='lounge').description,/две лавки/);
 assert.doesNotMatch(rooms.find(r=>r.kind==='lounge').description,/скамейка/);
});
test('all 14 layouts describe their actual rooms without stove brands or appliance dimensions',()=>{
 for(let n=1;n<=14;n++){
  const source=spec(n),rooms=layoutOverview(source);
  assert.equal(rooms.length,source.items.filter(i=>i.kind==='floor').length,'room count '+n);
  assert.ok(rooms.every(r=>r.label&&r.description&&/м²$/.test(r.area)),'room content '+n);
  assert.doesNotMatch(JSON.stringify(rooms),/ASTON|Термофор|2200|420\s*[×*]|687/,'human description '+n);
 }
});
test('bedroom and sanitary layouts keep the relevant equipment in their descriptions',()=>{
 const rooms=layoutOverview(spec(9));
 assert.match(rooms.find(r=>r.kind==='bedroom').description,/спальное место/i);
 assert.match(rooms.find(r=>r.kind==='wc').description,/унитаз/i);
 assert.match(rooms.find(r=>r.kind==='wc').description,/раковина/i);
});
test('separate furniture and plumbing are explained, while a kitchen sink stays in its kitchen set',()=>{
 assert.match(layoutSeparateAgreement(spec(9)),/Кровать и сантехнику.*отдельно/);
 assert.match(layoutSeparateAgreement(spec(10)),/Диван и сантехнику.*отдельно/);
 assert.equal(layoutSeparateAgreement({items:[{kind:'kitchen'},{kind:'kitchen_sink'}]}),null);
 assert.equal(layoutSeparateAgreement(spec(1)),null);
});

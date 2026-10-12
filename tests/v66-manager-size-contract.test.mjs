import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const manager=readFileSync(new URL('../assets/js/manager.js',import.meta.url),'utf8');
test('V6.6 manager shows full 6x5 dimensions rather than leading digit only',()=>{
 assert.match(manager,/const displaySize=value=>/);
 assert.match(manager,/String\(value\)\.replace\('x','×'\)/);
 assert.match(manager,/pair\(cd,'Размер',displaySize\(q\.sizeId\)\)/);
 assert.match(manager,/displaySize\(detail\.estimate\.sizeId\)/);
 assert.doesNotMatch(manager,/sizeId\[0\]/);
});
test('V6.6 manager shows selected roof color alongside body finish in stored quote',()=>{
 assert.match(manager,/pair\(cd,'Отделка',configuration\.finishName/);
 assert.match(manager,/pair\(cd,'Цвет кровли',configuration\.roofName/);
});

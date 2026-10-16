import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../assets/css/weather-v6.css',import.meta.url),'utf8');
const registry=readFileSync(new URL('../assets/js/media-v5.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');

test('rain mode product cards do not blend the hero photograph over another model',()=>{
  const patchAt=css.lastIndexOf('/* DACHA_PAR_RAIN_PRODUCT_PHOTO_DOUBLE_EXPOSURE_FIX_20261016 */');
  assert.ok(patchAt>0,'missing shipped rain overlay fix');
  const patch=css.slice(patchAt);
  for(const slot of ['catalog-kvadro-house-rain','bundle-comfort-rain','side-kvadro-house-rain']){
    assert.ok(patch.includes('[data-slot="'+slot+'"].media-ready::before'),'missing product slot '+slot);
    assert.ok(registry.includes("'"+slot+"'"),'missing image registry '+slot);
  }
  assert.match(patch,/content:\s*none\s*!important/);
  assert.match(patch,/display:\s*none\s*!important/);
  assert.match(patch,/background-image:\s*none\s*!important/);
  // The dedicated hero retains its own overcast treatment; product tiles do not.
  assert.doesNotMatch(patch,/\[data-slot="hero-rain-desktop"\]/);
  assert.match(css,/filter:brightness\(\.47\) saturate\(\.72\) contrast\(1\.06\)/);
  assert.match(app,/weatherPhotoSlot\(/);
});

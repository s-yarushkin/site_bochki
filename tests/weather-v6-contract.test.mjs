import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html');
const weather=read('assets/css/weather-v6.css');
const motion=read('assets/js/weather-v6.js');
const app=read('assets/js/app.js');
const media=read('assets/js/media-v5.js');
const pricebook=read('data/pricebook.js');

test('V6 has independently loadable CSS/JS and keeps original media and price source',()=>{
  assert.match(html,/href="assets\/css\/weather-v6\.css"/);
  assert.match(app,/import \{initAtmosphere,syncAtmosphereText\} from '\.\/weather-v6\.js'/);
  assert.match(app,/function setWeather\(weather\)/);
  assert.match(app,/syncAtmosphereText\(weather\)/);
  assert.match(app,/renderCatalog\(\);renderBundle\(\);initWeather\(\);initAtmosphere\(\)/);
  assert.match(media,/catalog-kvadro-house\.webp/);
  assert.match(pricebook,/DEMO_ONLY/);
});

test('V6 SUN is a real blue-sky scene and RAIN a navy slate, not green',()=>{
  assert.match(weather,/:root\[data-theme="sun"\]\{/);
  assert.match(weather,/--v6-sky-top:#83c5ee/);
  assert.match(weather,/:root\[data-theme="rain"\]\{/);
  assert.match(weather,/--v5-page:#0c192a/);
  assert.match(weather,/--v6-sky-top:#142b45/);
  assert.match(weather,/\.weather-sky::before/);
  assert.match(weather,/@keyframes v6-cloud-drift/);
  assert.match(weather,/\.weather-window-content h2/);
});

test('V6 has precisely two scenic scroll separators with switchable copy',()=>{
  assert.equal((html.match(/class="weather-window/g)||[]).length,2);
  assert.equal((html.match(/data-weather-scene=/g)||[]).length,2);
  assert.equal((html.match(/data-v6-sun=/g)||[]).length,4);
  assert.equal((html.match(/data-v6-rain=/g)||[]).length,4);
  assert.match(motion,/node\.textContent=weather==='rain'/);
  assert.match(html,/Пусть дождь идёт/);
});

test('V6 rains only on approved real photo areas, not on four product cards',()=>{
  assert.equal((html.match(/class="atmos-rain"/g)||[]).length,5);
  assert.match(html,/id="heroMedia"[^>]*>[\s\S]*?class="atmos-rain"/);
  assert.match(html,/class="bundle-photo media-frame"[\s\S]*?class="atmos-rain"/);
  assert.match(html,/data-slot="cta-evening-cozy"[\s\S]*?class="atmos-rain"/);
  const cards=html.match(/id="catalogGrid"[^>]*><\/div>/);
  assert.ok(cards,'Catalog cards are rendered dynamically and have no rain injection in markup');
  assert.doesNotMatch(app,/atmos-rain/);
  assert.match(weather,/@keyframes v6-rain-fall/);
  assert.match(weather,/pointer-events:none/);
});

test('V6 weather motion respects reduced-motion, page visibility and viewport visibility',()=>{
  assert.match(weather,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(weather,/:root\[data-motion="off"\]/);
  assert.match(motion,/prefers-reduced-motion: reduce/);
  assert.match(motion,/document\.visibilityState==='visible'/);
  assert.match(motion,/IntersectionObserver/);
  assert.match(motion,/entry\.isIntersecting/);
  assert.doesNotMatch(motion,/fetch\(|WebSocket|XMLHttpRequest|localStorage|sessionStorage|setInterval|setTimeout|requestAnimationFrame/);
});

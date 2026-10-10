import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html');
const css=read('assets/css/weather-v6.css');
const motion=read('assets/js/weather-v6.js');
const app=read('assets/js/app.js');
const media=read('assets/js/media-v5.js');
const pricebook=read('data/pricebook.js');

test('V6.1 preserves feature modules, source-owned pricebook and backend isolation',()=>{
  assert.match(html,/href="assets\/css\/weather-v6\.css"/);
  assert.match(app,/import \{initAtmosphere,syncAtmosphereText\} from '\.\/weather-v6\.js'/);
  assert.match(app,/renderCatalog\(\);renderBundle\(\);initWeather\(\);initAtmosphere\(\)/);
  assert.match(pricebook,/DEMO_ONLY/);
  assert.doesNotMatch(app,/localStorage|sessionStorage/);
});

test('V6.1 completely removes rain streaks and image overlays',()=>{
  assert.doesNotMatch(html,/atmos-rain/);
  assert.doesNotMatch(css,/atmos-rain|v6-rain-fall|repeating-linear-gradient/);
  assert.doesNotMatch(motion,/atmos-rain|v6-rain-fall/);
  assert.doesNotMatch(app,/atmos-rain/);
  assert.match(html,/class="site-clouds"/);
  assert.match(css,/\.site-clouds\{/);
  assert.match(css,/pointer-events:none/);
});

test('V6.1 supports blue sky and navy overcast clouds below content',()=>{
  assert.match(css,/--v6-sky-top:#83c5ee/);
  assert.match(css,/--v5-page:#0c192a/);
  assert.match(css,/@keyframes v61-cloud-drift-near/);
  assert.match(css,/\.cloud-bank-near\{/);
  assert.match(css,/main\{position:relative;z-index:1\}/);
  assert.match(css,/\.cloud-bank-far\{/);
});

test('V6.1 has exactly two scenic interludes with no falling-rain copy',()=>{
  assert.equal((html.match(/class="weather-window/g)||[]).length,2);
  assert.equal((html.match(/data-weather-scene=/g)||[]).length,2);
  assert.equal((html.match(/data-v6-sun=/g)||[]).length,4);
  assert.equal((html.match(/data-v6-rain=/g)||[]).length,4);
  assert.doesNotMatch(html,/Пусть дождь идёт|капли стучат/);
  assert.match(motion,/node\.textContent=weather==='rain'/);
});

test('V6.1 inherits common container width without full bleed window copy',()=>{
  const scenicBlock=css.match(/\.weather-window-content\{([^}]+)\}/);
  assert.ok(scenicBlock);
  assert.doesNotMatch(scenicBlock[1],/width\s*:/);
  assert.match(css,/\.container\{width:min\(1200px,calc\(100% - 80px\)\)/);
  assert.match(html,/class="container weather-window-content"/);
  assert.match(css,/@media\(max-width:550px\)/);
});

test('V6.1 has one consistent Kvadro House photo in hero, catalog, bundle and details',()=>{
  for(const slot of ['hero-sun-desktop','hero-rain-desktop','catalog-kvadro-house','bundle-comfort','side-kvadro-house']){
    const escaped=slot.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');
    assert.match(media,new RegExp("'"+escaped+"':\\{file:'hero-sun\\.webp'"));
  }
  assert.match(app,/\$\('#heroMedia'\)\.dataset\.slot='hero-sun-desktop'/);
  assert.match(html,/благоустройство территории визуализировано/);
});

test('V6.1 scroll-bound clouds pause when hidden or reduced-motion',()=>{
  assert.match(motion,/requestAnimationFrame\(updateCloudScroll\)/);
  assert.match(motion,/addEventListener\('scroll',onScroll,\{passive:true\}\)/);
  assert.match(motion,/document\.visibilityState==='visible'/);
  assert.match(motion,/prefers-reduced-motion: reduce/);
  assert.match(motion,/IntersectionObserver/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/:root\[data-motion="off"\] \.cloud-bank/);
  assert.doesNotMatch(motion,/fetch\(|WebSocket|XMLHttpRequest|localStorage|sessionStorage|setInterval|setTimeout/);
});

test('V6.1 SUN final CTA uses the approved Kvadro House image without changing composition',()=>{
  const cta=css.match(/:root\[data-theme="sun"\] \.final-cta\{([\s\S]*?)\}/);
  assert.ok(cta,'Missing SUN final CTA');
  assert.match(cta[1],/url\('\.\.\/media-v5\/hero-sun\.webp'\)/);
  assert.doesNotMatch(cta[1],/side-kvadro-house\.webp/);
  assert.match(cta[1],/linear-gradient\(100deg,rgba\(24,54,56,\.86\),rgba\(22,66,65,\.48\) 80%\)/);
  assert.match(cta[1],/center\/cover no-repeat/);
});

test('V6.1 preserves owner-approved final CTA',()=>{
  assert.match(html,/ВАША ДАЧА\. ВАШ ВЕЧЕР\./);
  assert.match(html,/Хорошие выходные<br><em>не нужно откладывать\.<\/em>/);
  assert.match(html,/Выберите свою баню сейчас — и увидьте, какой она может быть/);
});

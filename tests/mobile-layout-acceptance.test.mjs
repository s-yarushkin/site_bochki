import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const mobile=readFileSync(new URL('../assets/css/mobile-layout-audit.css',import.meta.url),'utf8');
const priority=readFileSync(new URL('../assets/css/mobile-cta-v2.css',import.meta.url),'utf8');
const catalogCss=readFileSync(new URL('../assets/css/weather-v6.css',import.meta.url),'utf8');

test('MOBILE-01 layout CSS runs after CTA hierarchy while keeping the telephone action',()=>{
  assert.ok(html.indexOf('assets/css/mobile-layout-audit.css')>html.indexOf('assets/css/mobile-cta-v2.css'));
  assert.match(html,/href="tel:\+79517349999"/);
  assert.match(html,/class="mobile-cta mobile-cta-dual"/);
  assert.match(priority,/position: fixed/);
  assert.match(priority,/safe-area-inset-bottom/);
  assert.match(priority,/body:has\(\.contact-dialog\[open\]\)/);
  assert.doesNotMatch(mobile,/data\/pricebook|optionIds|quoteTotal|calculateQuote/i);
});

test('MOBILE-01 full model dimensions wrap instead of overflowing narrow cards',()=>{
  assert.match(catalogCss,/\.catalog \.product-sizes\{white-space:nowrap\}/);
  assert.match(mobile,/@media \(max-width: 550px\)/);
  assert.match(mobile,/\.catalog \.product-meta \{[^}]*flex-direction: column/);
  assert.match(mobile,/\.catalog \.product-sizes \{[^}]*white-space: normal/);
  assert.match(mobile,/overflow-wrap: anywhere/);
});

test('MOBILE-01 gallery, filters, dialog close and submit meet target sizes',()=>{
  for(const selector of ['.gallery-photo-action','.model-gallery-close','.model-gallery-arrow',
    '.model-gallery-scene','.builder-photo-controls button','.dialog-close','#submitButton']){
    assert.ok(mobile.includes(selector),selector+' missing');
  }
  assert.match(mobile,/min-height: 44px/);
  assert.match(mobile,/min-height: 50px/);
  assert.match(mobile,/scroll-padding-bottom:/);
});

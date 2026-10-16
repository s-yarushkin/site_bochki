import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/css/mobile-cta-v2.css',import.meta.url),'utf8');
const seo=readFileSync(new URL('../assets/css/search-pages.css',import.meta.url),'utf8');

test('high-priority mobile CTA remains directly callable and keeps callback flow',()=>{
  assert.match(html,/href="tel:\+79517349999"/);
  assert.match(html,/class="mobile-cta mobile-cta-dual"/);
  assert.match(html,/data-topic="Помощь с выбором бани"/);
  assert.match(html,/href="assets\/css\/mobile-cta-v2\.css"/);
  assert.match(css,/--dp-action: #ffc563/);
  assert.match(css,/--dp-action: #ffca6d/);
  assert.match(css,/\.mobile-cta\.mobile-cta-dual/);
  assert.match(css,/grid-template-columns: minmax\(0, 1\.08fr\) minmax\(0, 1fr\)/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/min-height: 50px/);
  assert.match(css,/body:has\(\.contact-dialog\[open\]\)/);
});
test('contact actions have consistent priority without modifying filters or photos',()=>{
  assert.match(css,/\.catalog \.product-card \.btn\.btn-dark/);
  assert.match(css,/\.btn\.btn-dark\[data-flow="callback"\]/);
  assert.match(css,/\.header-phone-icon/);
  assert.match(css,/\.footer-ask a\[href="tel:\+79517349999"\]/);
  assert.doesNotMatch(css,/\.v5-photo\s*\{/);
  assert.doesNotMatch(css,/\.catalog-filters\s*\{/);
  assert.match(seo,/DACHA_PAR_SEO_CTA_PRIORITY_20261016/);
});

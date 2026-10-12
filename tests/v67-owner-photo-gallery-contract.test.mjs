import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MODEL_ALBUMS} from '../assets/js/catalog-gallery-v67.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const manifest=JSON.parse(read('assets/catalog-v66/MEDIA-MANIFEST.json'));
const book=JSON.parse(read('data/catalog-pricebook.json'));
const html=read('index.html'),app=read('assets/js/app.js');
const css=read('assets/css/weather-v6.css');
const pack=read('ops/v66-build-preview-bundle.ps1');

test('V6.7: all four galleries contain only their own brochure photos and all associated scenes',()=>{
  assert.deepEqual(Object.keys(MODEL_ALBUMS).sort(),Object.keys(book.models).sort());
  const expected={kvadro:4,parus:5,viking:4,'kvadro-house':5};
  for(const [model,album] of Object.entries(MODEL_ALBUMS)){
    const photos=manifest.images.filter(m=>m.model===model);
    assert.equal(album.photos.length,expected[model],model);
    assert.equal(album.photos.length,photos.length,model);
    assert.equal(album.photos[0][0],model+'-outside.webp');
    assert.deepEqual(new Set(album.photos.map(row=>row[0])),new Set(photos.map(row=>row.file)),model);
    assert.equal(new Set(album.photos.map(row=>row[0])).size,album.photos.length,model);
  }
});
test('V6.7: gallery is accessible from model photo, name, miniatures and configurator',()=>{
  assert.match(app,/import \{initModelGallery\} from '\.\/catalog-gallery-v67\.js'/);
  assert.match(app,/function boot\(\)\{initModelGallery\(\);renderCatalog\(\)/);
  assert.match(app,/data-gallery-open="\$\{model\.id\}"/);
  assert.match(app,/dataset\.galleryOpen=state\.modelId/);
  assert.match(html,/data-gallery-open="kvadro" data-gallery-first="1"/);
  assert.match(css,/\.catalog \.gallery-cover\.media-ready \.v5-photo\{[\s\S]*?object-fit:contain/);
  assert.match(css,/\.bundle-photo\.gallery-bundle-cover\.media-ready \.v5-photo\{[\s\S]*?object-fit:contain/);
});
test('V6.7: featured kit presents 14 included options without line item pricing',()=>{
  assert.equal(book.featuredBundle.selectedOptionIds.length,14);
  assert.match(app,/\$\('#bundleOptions'\)\.innerHTML=markup/);
  assert.doesNotMatch(app,/\$\('#bundleOptions'\)\.innerHTML=options\.map/);
  assert.match(html,/id="bundleNew"/);
  assert.match(html,/Готовый комплект за 490 000 ₽/);
  assert.match(html,/Доставку рассчитываем отдельно/);
});
test('V6.7: no repeated fake interior section and no legal street address in visible footer',()=>{
  assert.doesNotMatch(html,/id="mood"/);
  assert.doesNotMatch(html,/id="model-interiors"/);
  assert.doesNotMatch(html,/footer-operator/);
  assert.match(html,/href="privacy.html"/);
  assert.match(read('privacy.html'),/Герцена, д\. 114/);
});
test('V6.7: standalone gallery module included in exact review ZIP and syntax gate',()=>{
  assert.match(pack,/assets\/js\/catalog-gallery-v67\.js/);
  assert.match(read('package.json'),/node --check assets\/js\/catalog-gallery-v67\.js/);
});

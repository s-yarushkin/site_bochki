import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MODEL_ALBUMS,V68_MEDIA_PATHS} from '../assets/js/catalog-gallery-v67.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const manifest=JSON.parse(read('assets/catalog-v68-ai/MEDIA-MANIFEST.json'));
const book=JSON.parse(read('data/catalog-pricebook.json'));
const html=read('index.html'),app=read('assets/js/app.js');
const css=read('assets/css/weather-v6.css');
const pack=read('ops/v67-build-preview-bundle.ps1');

test('V6.9: albums remain model-specific and real Viking photos stay grouped',()=>{
  assert.deepEqual(Object.keys(MODEL_ALBUMS).sort(),Object.keys(book.models).sort());
  const expected={kvadro:3,parus:2,viking:4,'kvadro-house':1};
  for(const [model,album] of Object.entries(MODEL_ALBUMS)){
    assert.equal(album.photos.length,expected[model],model);
    if(model==='viking'){
      assert.deepEqual(album.photos.map(([p])=>p),[
        'viking-outside.webp',
        'assets/real-objects/viking/viking-001/outside-01.jpg',
        'assets/real-objects/viking/viking-001/outside-02.jpg',
        'assets/real-objects/viking/viking-001/inside-01.jpg'
      ]);
      assert.equal(V68_MEDIA_PATHS[album.photos[0][0]],'assets/catalog-v68-ai/viking-outside-v68.webp');
      continue;
    }
    const photos=manifest.images.filter(m=>m.model===model);
    assert.equal(album.photos.length,photos.length,model);
    assert.equal(album.photos[0][0],model+'-outside.webp');
    const mapped=album.photos.map(([file])=>V68_MEDIA_PATHS[file]?.split('/').at(-1));
    assert.deepEqual(new Set(mapped),new Set(photos.map(row=>row.file)),model);
    assert.equal(new Set(mapped).size,album.photos.length,model);
  }
});
test('V6.7: gallery is accessible from model photo, name, miniatures and configurator',()=>{
  assert.match(app,/import \{initModelGallery,getModelScenePhotos\} from '\.\/catalog-gallery-v67\.js'/);
  assert.match(app,/function boot\(\)\{initModelGallery\(\);renderCatalog\(\)/);
  assert.match(app,/data-gallery-open="\$\{model\.id\}"/);
  assert.match(app,/dataset\.galleryOpen=state\.modelId/);
  assert.match(html,/data-gallery-open="kvadro" data-gallery-first="1"/);
  assert.doesNotMatch(html,/data-gallery-open="kvadro" data-gallery-first="3"/);
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

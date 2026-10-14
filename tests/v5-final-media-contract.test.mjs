import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {MEDIA_SLOTS,resolveMedia,MEDIA_ASSET_ROOT} from '../assets/js/media-v5.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const html=readFileSync(join(root,'index.html'),'utf8');
const css=readFileSync(join(root,'assets/css/v5-finish.css'),'utf8');
const js=readFileSync(join(root,'assets/js/app.js'),'utf8');
const mediaPath=join(root,MEDIA_ASSET_ROOT);
const required=['hero-sun.webp','hero-rain.webp','catalog-kvadro.webp',
  'catalog-parus.webp','catalog-viking.webp','catalog-kvadro-house.webp',
  'mood-evening.webp','interior.webp','site-example.webp','side-kvadro-house.webp',
  'catalog-parus-alt.webp','catalog-viking-alt.webp'];

test('V5 site loads third layer and photographic image controller',()=>{
  assert.match(html,/href="assets\/css\/themes-v5\.css"/);
  assert.match(html,/href="assets\/css\/v5-finish\.css"/);
  assert.match(js,/import \{syncMedia\} from '\.\/media-v5\.js'/);
  assert.match(js,/function setWeather\(weather\)/);
  assert.match(js,/document\.documentElement\.dataset\.theme=weather/);
  assert.match(js,/syncMedia\(\)/);
  assert.match(css,/\.media-frame\.media-ready \.v5-photo/);
});

test('V6.9 SUN/RAIN hero and V6.8 Viking cover unchanged; three real photos are additional',()=>{
  for(const id of ['kvadro','parus','kvadro-house']){
    assert.equal(resolveMedia('catalog-'+id).path,'assets/catalog-v68-ai/'+id+'-outside-v68.webp');
  }
  assert.equal(resolveMedia('real-parus-outside-01').path,'assets/real-objects/parus/parus-001/outside-01.png');
  assert.equal(resolveMedia('real-parus-outside-02').path,'assets/real-objects/parus/parus-001/outside-02.png');
  assert.equal(resolveMedia('catalog-viking').path,'assets/catalog-v68-ai/viking-outside-v68.webp');
  assert.equal(resolveMedia('real-viking-outside-01').path,'assets/real-objects/viking/viking-001/outside-01.jpg');
  assert.equal(resolveMedia('real-viking-outside-02').path,'assets/real-objects/viking/viking-001/outside-02.jpg');
  assert.equal(resolveMedia('real-viking-inside-01').path,'assets/real-objects/viking/viking-001/inside-01.jpg');
  assert.equal(resolveMedia('interior-viking').path,'assets/catalog-v66/viking-lounge.webp');
  assert.equal(resolveMedia('detail-viking-steam').path,'assets/catalog-v66/viking-steam.webp');
  assert.equal(resolveMedia('cta-evening-cozy').path,'assets/catalog-v66/viking-outside.webp');
  for(const id of ['kvadro','parus']){
    assert.equal(resolveMedia('interior-'+id).path,'assets/catalog-v68-ai/'+id+'-lounge-v68.webp');
  }
  // Archived interior frames stay available for rollback but must not enter the V6.8 albums.
  assert.equal(resolveMedia('interior-kvadro-house').path,'assets/catalog-v66/kvadro-house-lounge.webp');
  assert.equal(resolveMedia('hero-sun-desktop').file,'hero-sun.webp');
  assert.equal(resolveMedia('hero-rain-desktop').file,'hero-sun.webp');
  assert.equal(resolveMedia('hero-sun-desktop').file,resolveMedia('hero-rain-desktop').file);
  assert.equal(resolveMedia('bundle-comfort').file,'kvadro-outside-v68.webp');
  assert.match(readFileSync(new URL('../assets/css/weather-v6.css',import.meta.url),'utf8'),/mask-image:radial-gradient/);
});

test('V6.6 no invented plan photo; model-specific interiors are explicitly catalog renders',()=>{
  assert.equal(resolveMedia('product-front'),null);
  assert.doesNotMatch(html,/рекламные изображения, а не фото готового заказа/);
  assert.match(html,/Продуманная комплектация для отдыха на даче/);
  assert.doesNotMatch(html,/Стоимость приведена для примера\. Состав комплекта/);
});

test('V5 static assets are present, sized and match owner media manifest before release',()=>{
  const manifestFile=join(mediaPath,'MEDIA-MANIFEST.json');
  assert.ok(existsSync(manifestFile),'Missing v5 media pack. Import before QA/deploy');
  const manifest=JSON.parse(readFileSync(manifestFile,'utf8'));
  assert.equal(manifest.status,'PREVIEW_ONLY_OWNER_REVIEW_PENDING');
  assert.equal(manifest.photos.length,required.length);
  const actual=new Set();
  for(const p of manifest.photos){
    assert.ok(required.includes(p.file),p.file);
    assert.ok(!actual.has(p.file),'duplicate '+p.file);
    actual.add(p.file);
    const file=join(mediaPath,p.file);
    assert.ok(existsSync(file),'Missing asset '+p.file);
    assert.equal(statSync(file).size,p.bytes,p.file);
    assert.ok(p.bytes>1000&&p.bytes<900000,p.file);
    assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),p.sha256,p.file);
  }
  const catalogDir=join(root,'assets/catalog-v66');
  const catalogManifest=JSON.parse(readFileSync(join(catalogDir,'MEDIA-MANIFEST.json'),'utf8'));
  assert.equal(catalogManifest.images.length,34);
  const catalogFiles=new Set();
  for(const item of catalogManifest.images){
    assert.ok(!catalogFiles.has(item.file),'duplicate catalog asset '+item.file);
    catalogFiles.add(item.file);
    const file=join(catalogDir,item.file);
    assert.ok(existsSync(file),'Missing v6.6 catalog media '+item.file);
    assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),item.sha256,item.file);
  }
  const aiManifest=JSON.parse(readFileSync(join(root,'assets/catalog-v68-ai/MEDIA-MANIFEST.json'),'utf8'));
  assert.equal(aiManifest.images.length,7);
  const aiFiles=new Set(aiManifest.images.map(im=>im.file));
  const vikingReal=JSON.parse(readFileSync(join(root,'assets/real-objects/viking/viking-001/MEDIA-MANIFEST.json'),'utf8'));
  const houseReal=JSON.parse(readFileSync(join(root,'assets/real-objects/kvadro-house/kvadro-house-001/MEDIA-MANIFEST.json'),'utf8'));
  const parusEdited=JSON.parse(readFileSync(join(root,'assets/real-objects/parus/parus-001/MEDIA-MANIFEST.json'),'utf8'));
  assert.equal(vikingReal.photos.length,3);
  assert.equal(houseReal.photos.length,2);
  assert.equal(parusEdited.photos.length,2);
  assert.equal(parusEdited.source,'OWNER_APPROVED_LANDSCAPE_EDIT_FROM_REAL_PHOTO');
  const realFiles=new Set([...vikingReal.photos,...houseReal.photos,...parusEdited.photos].map(im=>im.path));
  for(const slot of Object.values(MEDIA_SLOTS).filter(Boolean)){
    if(slot.path?.startsWith('assets/real-objects/'))assert.ok(realFiles.has(slot.path),'Unpackaged user real photo '+slot.path);
    else if(slot.path?.startsWith('assets/catalog-v68-ai/'))assert.ok(aiFiles.has(slot.file),'Unpackaged v6.8 concept '+slot.file);
    else if(slot.path)assert.ok(catalogFiles.has(slot.file),'Unpackaged v6.6 media '+slot.file);
    else assert.ok(actual.has(slot.file),'Unpackaged v5 hero '+slot.file);
  }
});

test('V5 lead, privacy, manager and demo pricing contracts remain intact',()=>{
  assert.match(js,/receipt\?\.delivered!==true/);
  assert.match(html,/href="privacy\.html"/);
  assert.match(html,/href="consent\.html"/);
  assert.match(html,/Указаны ориентировочные цены/);
  assert.doesNotMatch(html,/ДЕМО-КАТАЛОГ|ФОТОСЛОТ|Демонстрационный прототип/);
  assert.match(html,/name="robots" content="noindex,nofollow"/);
  assert.doesNotMatch(js,/localStorage|sessionStorage/);
});

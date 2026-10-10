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

test('V6.1.1 photo policy: three untouched models; Kvadro House has one approved day/dusk pair',()=>{
  for(const series of ['kvadro','parus','viking']){
    const key='catalog-'+series;
    assert.ok(resolveMedia(key),'Missing '+key);
    assert.equal(resolveMedia(key),MEDIA_SLOTS[key]);
    assert.equal(Object.keys(MEDIA_SLOTS).filter(v=>v===key+'-rain').length,0);
    assert.equal(Object.keys(MEDIA_SLOTS).filter(v=>v===key+'-sun').length,0);
  }
  for(const key of ['hero-sun-desktop','catalog-kvadro-house','bundle-comfort','side-kvadro-house']){
    assert.equal(resolveMedia(key).file,'hero-sun.webp',key);
  }
  for(const key of ['hero-rain-desktop','catalog-kvadro-house-rain','bundle-comfort-rain','side-kvadro-house-rain']){
    assert.equal(resolveMedia(key).file,'hero-rain.webp',key);
    assert.match(resolveMedia(key).alt,/вечерн|подсветк/);
  }
  assert.notEqual(resolveMedia('hero-sun-desktop').file,resolveMedia('hero-rain-desktop').file);
});

test('V5 no invented plan photo or fabricated builder model interior',()=>{
  assert.equal(resolveMedia('product-front'),null);
  assert.match(js,/Пример интерьера одной из бань/);
  assert.match(html,/На фото показана модель. Комплектация подбирается отдельно/);
  assert.match(html,/Газон и деревянные дорожки на изображении — визуализация благоустройства/);
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
  for(const slot of Object.values(MEDIA_SLOTS).filter(Boolean)){
    assert.ok(actual.has(slot.file),'Unpackaged media '+slot.file);
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

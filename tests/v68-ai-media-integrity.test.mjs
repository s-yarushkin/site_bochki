import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {MODEL_ALBUMS,V68_MEDIA_PATHS} from '../assets/js/catalog-gallery-v67.js';
import {MEDIA_SLOTS} from '../assets/js/media-v5.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=path=>readFileSync(join(root,path),'utf8');
const manifest=JSON.parse(source('assets/catalog-v68-ai/MEDIA-MANIFEST.json'));
const html=source('index.html');
const audit=source('docs/V68-MEDIA-QA.md');

test('V6.8: exact seven-image manifest is truthful and content-addressed',()=>{
  assert.equal(manifest.publicationStatus,'OWNER_APPROVED_EXACT_SEVEN_MEDIA_ONLY');
  assert.equal(manifest.releaseAuthorization,'NOT_GRANTED_SEPARATE_GO_REQUIRED');
  assert.equal(manifest.images.length,7);
  const files=new Set();
  for(const im of manifest.images){
    assert.ok(!files.has(im.file),'Duplicate file '+im.file);
    files.add(im.file);
    assert.match(im.file,/^[a-z0-9-]+-v68\.webp$/);
    assert.equal(im.source,'AI_GENERATED_FROM_OWNER_BROCHURE');
    assert.equal(im.visualProvenance,'CONCEPT_ILLUSTRATION_NOT_VERIFIED_PRODUCT_PHOTO');
    assert.equal(im.ownerApproval,'APPROVED');
    assert.ok(im.width>=800&&im.height>=800,'Insufficient source resolution '+im.file);
    if(im.file==='parus-lounge-v68.webp'){
      assert.equal(im.sha256,'472a4fe68ff32232e640b06e1e8dc03386d1667a4dd60bb9417aeff79bf30b65');
      assert.deepEqual([im.width,im.height],[1448,1086]);
      assert.ok(!Object.hasOwn(im,'visualCorrection'));
    }
    const path=join(root,'assets/catalog-v68-ai',im.file);
    assert.ok(existsSync(path),'V6.8 media file missing '+im.file);
    assert.equal(statSync(path).size,im.sizeBytes,im.file);
    const data=readFileSync(path);
    assert.equal(data.toString('ascii',0,4),'RIFF',im.file);
    assert.equal(data.toString('ascii',8,12),'WEBP',im.file);
    assert.equal(createHash('sha256').update(data).digest('hex'),im.sha256,im.file);
  }
});
test('V74: six V6.8 images remain; only Kvadro House cover uses the existing SUN master',()=>{
  const images=manifest.images;
  assert.deepEqual(images.filter(im=>im.model!=='kvadro-house').map(im=>im.file).sort(),Object.values(V68_MEDIA_PATHS).filter(path=>path.startsWith('assets/catalog-v68-ai/')).map(path=>path.split('/').at(-1)).sort());
  assert.equal(V68_MEDIA_PATHS['kvadro-house-outside.webp'],'assets/media-v5/hero-sun.webp');
  const counts={kvadro:3,parus:4,viking:4,'kvadro-house':3};
  for(const [model,album] of Object.entries(MODEL_ALBUMS)){
    assert.equal(album.photos.length,counts[model],model);
    if(model==='parus'){
      assert.equal(album.photos[0][0],'parus-outside.webp');
      assert.equal(album.photos[3][0],'parus-lounge.webp');
      assert.equal(MEDIA_SLOTS['catalog-parus'].path,V68_MEDIA_PATHS[album.photos[0][0]]);
      assert.equal(MEDIA_SLOTS['interior-parus'].path,V68_MEDIA_PATHS[album.photos[3][0]]);
      assert.deepEqual(album.photos.slice(1,3).map(([path])=>path),[
        MEDIA_SLOTS['real-parus-outside-01'].path,MEDIA_SLOTS['real-parus-outside-02'].path
      ]);
      continue;
    }
    if(model==='kvadro-house'){
      assert.equal(album.photos[0][0],'kvadro-house-outside.webp');
      assert.equal(MEDIA_SLOTS['catalog-kvadro-house'].path,V68_MEDIA_PATHS[album.photos[0][0]]);
      assert.deepEqual(album.photos.slice(1).map(([path])=>path),[
        MEDIA_SLOTS['real-kvadro-house-outside-01'].path,
        MEDIA_SLOTS['real-kvadro-house-outside-02'].path
      ]);
      continue;
    }
    if(model==='viking'){
      assert.equal(album.photos[0][0],'viking-outside.webp');
      assert.equal(MEDIA_SLOTS['catalog-viking'].path,V68_MEDIA_PATHS[album.photos[0][0]]);
      assert.deepEqual(album.photos.slice(1).map(([path])=>path),[
        MEDIA_SLOTS['real-viking-outside-01'].path,
        MEDIA_SLOTS['real-viking-outside-02'].path,
        MEDIA_SLOTS['real-viking-inside-01'].path
      ]);
      continue;
    }
    assert.equal(album.photos[0][0],model+'-outside.webp');
    for(const [file] of album.photos){
      const path=V68_MEDIA_PATHS[file];
      assert.ok(path?.startsWith('assets/catalog-v68-ai/'),file);
      assert.equal(images.find(im=>im.file===path.split('/').at(-1))?.model,model,file);
    }
    assert.equal(MEDIA_SLOTS['catalog-'+model].path,V68_MEDIA_PATHS[model+'-outside.webp']);
  }
  assert.equal(MEDIA_SLOTS['cta-evening-cozy'].path,'assets/catalog-v66/viking-outside.webp');
  assert.equal(MEDIA_SLOTS['hero-sun-desktop'].file,'hero-sun.webp');
  assert.equal(MEDIA_SLOTS['hero-rain-desktop'].file,'hero-sun.webp');
});
test('V6.8: hidden low-res fragments cannot leak into approved user-visible gallery',()=>{
  const hidden=['kvadro-entry.webp','parus-steam.webp','parus-stove.webp','parus-shower.webp',
    'viking-steam.webp','viking-lounge.webp','viking-stove.webp','kvadro-house-steam.webp',
    'kvadro-house-lounge.webp','kvadro-house-stove.webp','kvadro-house-veranda.webp'];
  for(const f of hidden){
    assert.ok(audit.includes(f)&&audit.includes('HIDE_FROM_PREVIEW'),f);
    assert.ok(!Object.values(MODEL_ALBUMS).some(album=>album.photos.some(([name])=>name===f)),f);
  }
  assert.doesNotMatch(html,/data-gallery-open="kvadro" data-gallery-first="3"/);
  assert.doesNotMatch(html,/ai-visual-note/);
  assert.doesNotMatch(html,/Иллюстрации моделей созданы с использованием ИИ/);
  const galleryJs=source('assets/js/catalog-gallery-v67.js');
  assert.doesNotMatch(galleryJs,/созданы с использованием ИИ|Не являются подтверждёнными фотографиями/);
  assert.match(galleryJs,/Листайте изображения стрелками/);
  const app=source('assets/js/app.js');
  assert.match(app,/document\.querySelectorAll\('\[data-view\]'\)\.forEach\(btn=>\{/);
  assert.doesNotMatch(app,/Качественные изображения интерьера этой модели готовятся/);
  assert.doesNotMatch(html,/class="difference-experience-number"/);
  assert.match(source('assets/js/app.js'),/hasApprovedInside/);
});
test('V6.8: new review package lists precisely seven hash-checked images',()=>{
  const build=source('ops/v68-build-preview-bundle.ps1');
  assert.match(build,/assets\/catalog-v68-ai\/MEDIA-MANIFEST.json/);
  assert.match(build,/foreach\(\$p in @\(\$AI.images\)\)/);
  assert.match(build,/imagesAI=7/);
  assert.match(build,/GB-V68-review-release-/);
  assert.match(source('package.json'),/node --test tests\/\*\.test\.mjs/);
});

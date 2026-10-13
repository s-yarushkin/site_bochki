import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {REAL_OBJECTS,realModelPhotos} from '../assets/js/real-object-gallery-v69.js';
import {MODEL_ALBUMS,getModelScenePhotos} from '../assets/js/catalog-gallery-v67.js';
import {MEDIA_SLOTS} from '../assets/js/media-v5.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=path=>readFileSync(join(root,path),'utf8');
const manifest=JSON.parse(read('assets/real-objects/viking/viking-001/MEDIA-MANIFEST.json'));

test('V6.9 exact 3 immutable owner-uploaded Viking JPGs: 2 outside + 1 inside',()=>{
  assert.equal(manifest.objectId,'viking-001');
  assert.equal(manifest.modelId,'viking');
  assert.equal(manifest.source,'OWNER_UPLOADED_REAL_PHOTOS');
  assert.equal(manifest.photos.length,3);
  assert.deepEqual(manifest.photos.map(x=>x.scene),['outside','outside','inside']);
  const files=REAL_OBJECTS.viking[0].photos;
  assert.deepEqual(files.map(x=>x.path),manifest.photos.map(x=>x.path));
  for(const photo of manifest.photos){
    const path=join(root,photo.path);
    assert.ok(existsSync(path),'Missing real owner photo: '+photo.path);
    const data=readFileSync(path);
    assert.equal(statSync(path).size,photo.bytes);
    assert.equal(createHash('sha256').update(data).digest('hex'),photo.sha256);
    assert.equal(photo.width,1280);assert.equal(photo.height,1708);
    assert.ok(data.subarray(0,3).equals(Buffer.from([255,216,255])),'File is not original JPG');
  }
});
test('V6.9 approved original plus three real Viking photos remain isolated by model',()=>{
  assert.deepEqual(realModelPhotos('viking','outside').map(x=>x.path),manifest.photos.slice(0,2).map(x=>x.path));
  assert.deepEqual(realModelPhotos('viking','inside').map(x=>x.path),[manifest.photos[2].path]);
  assert.equal(realModelPhotos('kvadro').length,0);
  assert.equal(getModelScenePhotos('viking').length,4);
  assert.equal(getModelScenePhotos('viking','outside').length,3);
  assert.equal(getModelScenePhotos('viking','inside').length,1);
  assert.deepEqual(getModelScenePhotos('viking').map(x=>x.file),[
    'viking-outside.webp',...manifest.photos.map(x=>x.path)
  ]);
  assert.equal(MEDIA_SLOTS['catalog-viking'].path,'assets/catalog-v68-ai/viking-outside-v68.webp');
  assert.equal(MEDIA_SLOTS['real-viking-outside-01'].path,manifest.photos[0].path);
  assert.equal(MEDIA_SLOTS['real-viking-outside-02'].path,manifest.photos[1].path);
  assert.equal(MEDIA_SLOTS['real-viking-inside-01'].path,manifest.photos[2].path);
  assert.equal(MEDIA_SLOTS['cta-evening-cozy'].path,'assets/catalog-v66/viking-outside.webp');
  assert.equal(MEDIA_SLOTS['interior-viking'].path,'assets/catalog-v66/viking-lounge.webp');
  assert.equal(MEDIA_SLOTS['detail-viking-steam'].path,'assets/catalog-v66/viking-steam.webp');
  for(const name of ['kvadro','parus','kvadro-house']){
    assert.ok(MODEL_ALBUMS[name].photos.every(([file])=>!file.includes('real-objects/viking')));
  }
});
test('V6.9 existing modal and builder use one model-scoped gallery without new site section',()=>{
  const html=read('index.html'),app=read('assets/js/app.js'),gallery=read('assets/js/catalog-gallery-v67.js');
  assert.doesNotMatch(html,/id="real-bani"|id="real-models"|id="real-objects"/);
  assert.match(html,/id="builderPhotoControls"/);
  assert.match(html,/data-builder-photo-step="-1"/);
  assert.match(html,/data-builder-photo-step="1"/);
  assert.match(gallery,/data-gallery-scene-select/);
  assert.match(gallery,/getModelScenePhotos/);
  assert.match(app,/getModelScenePhotos\(state.modelId,state.view\)/);
  assert.match(app,/state.photoIndex/);
  assert.match(app,/state.view==='inside'\)return 'real-viking-inside-01'/);
  assert.doesNotMatch(html,/ИИ|искусственного интеллекта/);
});

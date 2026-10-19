import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {REAL_OBJECTS,realModelPhotos} from '../assets/js/real-object-gallery-v69.js';
import {MODEL_ALBUMS,getModelScenePhotos} from '../assets/js/catalog-gallery-v67.js';
import {MEDIA_SLOTS} from '../assets/js/media-v5.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=path=>readFileSync(join(root,path),'utf8');
const dir='assets/real-objects/kvadro-house/kvadro-house-001/';
const manifest=JSON.parse(read(dir+'MEDIA-MANIFEST.json'));

test('V7.0 two exact owner JPG photographs of one Kvadro House: outside only',()=>{
  assert.equal(manifest.schemaVersion,1);
  assert.equal(manifest.modelId,'kvadro-house');
  assert.equal(manifest.objectId,'kvadro-house-001');
  assert.equal(manifest.source,'OWNER_UPLOADED_REAL_PHOTOS');
  assert.equal(manifest.photos.length,2);
  assert.deepEqual(manifest.photos.map(p=>p.scene),['outside','outside']);
  assert.deepEqual(REAL_OBJECTS['kvadro-house'][0].photos.map(p=>p.path),manifest.photos.map(p=>p.path));
  for(const photo of manifest.photos){
    assert.ok(photo.path.startsWith(dir) && photo.path.endsWith('.jpg'));
    const path=join(root,photo.path);
    assert.ok(existsSync(path),'Owner photo not uploaded: '+photo.path);
    const data=readFileSync(path);
    assert.equal(data.length,photo.bytes);
    assert.equal(statSync(path).size,photo.bytes);
    assert.equal(createHash('sha256').update(data).digest('hex'),photo.sha256);
    assert.deepEqual([photo.width,photo.height],[1280,1708]);
    assert.ok(data.subarray(0,3).equals(Buffer.from([255,216,255])),'JPG signature');
  }
});
test('V74 Kvadro House SUN cover is first; two originals remain, no interior invented',()=>{
  const photos=getModelScenePhotos('kvadro-house');
  assert.deepEqual(photos.map(p=>p.file),[
    'kvadro-house-outside.webp',...manifest.photos.map(p=>p.path)
  ]);
  assert.equal(getModelScenePhotos('kvadro-house','outside').length,3);
  assert.equal(getModelScenePhotos('kvadro-house','inside').length,0);
  assert.deepEqual(realModelPhotos('kvadro-house').map(p=>p.path),manifest.photos.map(p=>p.path));
  assert.equal(MEDIA_SLOTS['catalog-kvadro-house'].path,'assets/media-v5/hero-sun.webp');
  assert.equal(MEDIA_SLOTS['catalog-kvadro-house-rain'].path,'assets/media-v5/hero-sun.webp');
  assert.equal(MEDIA_SLOTS['real-kvadro-house-outside-01'].path,manifest.photos[0].path);
  assert.equal(MEDIA_SLOTS['real-kvadro-house-outside-02'].path,manifest.photos[1].path);
  assert.equal(MEDIA_SLOTS['hero-sun-desktop'].file,'hero-sun.webp');
  assert.equal(MEDIA_SLOTS['hero-rain-desktop'].file,'hero-sun.webp');
});
test('V7.0 Viking gallery and the other models stay unchanged, only existing UI used',()=>{
  assert.deepEqual(getModelScenePhotos('viking').map(p=>p.file),[
    'viking-outside.webp',
    'assets/real-objects/viking/viking-001/outside-01.jpg',
    'assets/real-objects/viking/viking-001/outside-02.jpg',
    'assets/real-objects/viking/viking-001/inside-01.jpg'
  ]);
  assert.equal(realModelPhotos('viking').length,3);
  assert.equal(MODEL_ALBUMS.kvadro.photos.length,3);
  // V7.0 regression concerns existing Parus media, not the number of future owner-approved additions.
  assert.equal(MODEL_ALBUMS.parus.photos[0][0],'parus-outside.webp');
  assert.equal(MODEL_ALBUMS.parus.photos.at(-1)[0],'parus-lounge.webp');
  const html=read('index.html'),app=read('assets/js/app.js'),gallery=read('assets/js/catalog-gallery-v67.js');
  assert.doesNotMatch(html,/id="real-bani"|id="real-objects"/);
  assert.match(app,/real-kvadro-house-outside-01/);
  assert.match(app,/real-kvadro-house-outside-02/);
  assert.match(gallery,/getModelScenePhotos/);
  assert.match(html,/id="builderPhotoControls"/);
});

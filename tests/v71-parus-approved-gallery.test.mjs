import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {REAL_OBJECTS,realModelPhotos} from '../assets/js/real-object-gallery-v69.js';
import {MODEL_ALBUMS,getModelScenePhotos} from '../assets/js/catalog-gallery-v67.js';
import {MEDIA_SLOTS} from '../assets/js/media-v5.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const dir='assets/real-objects/parus/parus-001/';
const read=p=>readFileSync(join(root,p),'utf8');
const manifest=JSON.parse(read(dir+'MEDIA-MANIFEST.json'));

test('V7.1 two exact owner-approved landscape edits; dimensions, sha256 and provenance pinned',()=>{
  assert.equal(manifest.schemaVersion,1);
  assert.equal(manifest.objectId,'parus-001');
  assert.equal(manifest.modelId,'parus');
  assert.equal(manifest.source,'OWNER_APPROVED_LANDSCAPE_EDIT_FROM_REAL_PHOTO');
  assert.equal(manifest.photos.length,2);
  assert.deepEqual(manifest.photos.map(p=>p.scene),['outside','outside']);
  assert.deepEqual(REAL_OBJECTS.parus[0].photos.map(p=>p.path),manifest.photos.map(p=>p.path));
  assert.equal(REAL_OBJECTS.parus[0].mediaProvenance,manifest.source);
  for(const p of manifest.photos){
    assert.ok(p.path.startsWith(dir) && p.path.endsWith('.png'));
    assert.deepEqual([p.width,p.height],[1448,1086]);
    const full=join(root,p.path);
    assert.ok(existsSync(full),'Approved PNG absent: '+p.path);
    const bytes=readFileSync(full);
    assert.equal(statSync(full).size,p.bytes);
    assert.equal(bytes.length,p.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),p.sha256);
    assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  }
});
test('V7.1 Parus appends two exteriors, preserves approved old outside and existing inside',()=>{
  assert.deepEqual(MODEL_ALBUMS.parus.photos.map(([p])=>p),[
    'parus-outside.webp',
    'assets/real-objects/parus/parus-001/outside-01.png',
    'assets/real-objects/parus/parus-001/outside-02.png',
    'parus-lounge.webp'
  ]);
  assert.equal(getModelScenePhotos('parus').length,4);
  assert.equal(getModelScenePhotos('parus','outside').length,3);
  assert.equal(getModelScenePhotos('parus','inside').length,1);
  assert.equal(realModelPhotos('parus','outside').length,2);
  assert.equal(realModelPhotos('parus','inside').length,0);
  assert.equal(MEDIA_SLOTS['catalog-parus'].path,'assets/catalog-v68-ai/parus-outside-v68.webp');
  assert.equal(MEDIA_SLOTS['interior-parus'].path,'assets/catalog-v68-ai/parus-lounge-v68.webp');
  assert.deepEqual([MEDIA_SLOTS['real-parus-outside-01'].path,MEDIA_SLOTS['real-parus-outside-02'].path],manifest.photos.map(p=>p.path));
  const app=read('assets/js/app.js'),html=read('index.html');
  assert.match(app,/\['catalog-parus','real-parus-outside-01','real-parus-outside-02'\]/);
  assert.match(html,/id="builderPhotoControls"/);
  assert.doesNotMatch(html,/id="real-bani"|id="real-objects"/);
});
test('V7.1 previous Viking and Kvadro House galleries, hero, pricebook remain unchanged',()=>{
  assert.equal(MODEL_ALBUMS.viking.photos.length,4);
  assert.equal(MODEL_ALBUMS['kvadro-house'].photos.length,3);
  assert.equal(MODEL_ALBUMS.kvadro.photos.length,3);
  assert.equal(MEDIA_SLOTS['catalog-viking'].path,'assets/catalog-v68-ai/viking-outside-v68.webp');
  assert.equal(MEDIA_SLOTS['catalog-kvadro-house'].path,'assets/media-v5/hero-sun.webp');
  assert.equal(MEDIA_SLOTS['hero-sun-desktop'].file,'hero-sun.webp');
  assert.equal(MEDIA_SLOTS['hero-rain-desktop'].file,'hero-sun.webp');
  const manifest=json=>JSON.parse(read(json));
  assert.equal(manifest('assets/real-objects/viking/viking-001/MEDIA-MANIFEST.json').photos.length,3);
  assert.equal(manifest('assets/real-objects/kvadro-house/kvadro-house-001/MEDIA-MANIFEST.json').photos.length,2);
});

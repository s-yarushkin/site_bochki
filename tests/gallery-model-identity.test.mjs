import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../data/gallery-media-registry.v1.json',import.meta.url),'utf8'));
const ids=['kvadro','viking','parus','kvadro-house'];
test('exact model identities, never public by default',()=>{
  assert.deepEqual(Object.keys(manifest.models).sort(),ids.slice().sort());
  assert.equal(manifest.publicationStatus,'NOT_APPROVED_FOR_LIVE');
  assert.equal(manifest.schemaVersion,2);
  assert.match(manifest.principle,/MODEL_PLANS_SEPARATE/);
});
test('all 29 new Parus photos belong to exactly one real object',()=>{
 const all=new Set();
 const objects=manifest.models.parus.objects;
 assert.equal(objects.length,4);
 assert.deepEqual(manifest.models.parus.plans,[],'plans remain at model level only');
 for(const obj of objects){
   assert.equal(obj.modelId,'parus');
   assert.match(obj.id,/^parus-20261022-0[1-4]$/);
   assert.ok(obj.photos.length);
   assert.ok(!Object.hasOwn(obj,'plans'),'completed-work photo set must not reference plan');
   assert.ok(!Object.hasOwn(obj,'sizeId'),'completed-work example must not show a size');
   assert.ok(!Object.hasOwn(obj,'priceRub'),'completed-work example must not show a price');
   for(const p of obj.photos){
     assert.match(p.sourceFilename,/^IMG_20261022_\d{6}\.jpg$/);
     assert.ok(['outside','lounge','steam','inside','detail'].includes(p.scene));
     assert.equal(p.src,null);
     assert.equal(p.status,'AWAITING_APPROVED_WEB_EXPORT');
     assert.ok(p.caption.trim().length);
     assert.ok(!all.has(p.sourceFilename),'cross-object or duplicate source: '+p.sourceFilename);
     all.add(p.sourceFilename);
   }
 }
 assert.equal(all.size,29);
});
test('other models have reserved space, not invented photos or plans',()=>{
 for(const id of ids.filter(id=>id!=='parus')){
  assert.deepEqual(manifest.models[id].objects,[]);
  assert.deepEqual(manifest.models[id].plans,[]);
 }
});

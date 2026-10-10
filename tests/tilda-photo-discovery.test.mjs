import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  TILDA_PAGES,extractTildaPhotoCandidates,discoverTildaPages
} from '../ops/tilda-photo-discovery.mjs';

test('Tilda audit uses the five verified public source pages',()=>{
  assert.deepEqual(TILDA_PAGES.map(p=>p.id),
    ['home','kvadro','parus','viking','kvadro-house']);
  assert.equal(TILDA_PAGES.at(-1).url,
    'https://www.garant-bany.ru/catalog_kvadro_hauos');
});

test('candidate parser discovers originals in src and data-original, deduplicates and rejects 20px thumbnails',()=>{
  const html='<img src="https://thb.tildacdn.com/tild1234/-/resize/20x/IMG.webp" '+
    'data-original="https://static.tildacdn.com/tild1234/IMG.webp">'+
    '<img src="https://static.tildacdn.com/tild1234/IMG.webp">'+
    '<div data-bgimg="https://static.tildacdn.com/tildabcd/photo.jpeg"></div>';
  const found=extractTildaPhotoCandidates(html,'kvadro');
  assert.equal(found.length,2,found.map(a=>a.sourceUrl).join(';'));
  assert.ok(found.every(a=>a.sourcePageId==='kvadro'&&a.publishable===false));
  assert.ok(found.every(a=>a.status==='DISCOVERED'&&a.rights==='UNVERIFIED'));
  assert.ok(found.every(a=>!a.sourceUrl.includes('/resize/20x/')));
});

test('candidate parser accepts escaped Tilda JSON URLs and excludes other image origins',()=>{
  const html=String.raw`{"img":"https:\/\/static.tildacdn.com\/tildaaaa\/PHOTO.webp"}`+
    '<img src="https://evil.example/other.webp">';
  const found=extractTildaPhotoCandidates(html,'home');
  assert.equal(found.length,1);
  assert.match(found[0].sourceUrl,/tildaaaa\/PHOTO\.webp$/);
});

test('auditor handles failed pages without fabricating photos or exposing them as approved',async()=>{
  const mocked=async url=>{
    if(url.pathname.includes('catalog_kvadro'))return {ok:false,status:404};
    return {ok:true,text:async()=>'<img data-original="https://static.tildacdn.com/tildabcd/a.jpg">'};
  };
  const out=await discoverTildaPages({fetchImpl:mocked,pages:TILDA_PAGES.slice(0,2)});
  assert.equal(out.records.length,1);
  assert.equal(out.errors.length,1);
  assert.equal(out.count,1);
  assert.equal(out.records[0].candidates[0].publishable,false);
  assert.match(out.kind,/NOT_PUBLISH_APPROVAL/);
});

test('real-world Tilda resizeb/20x, 504px previews, and platform logo never count as originals',()=>{
  const html=[
    '<img src="https://thb.tildacdn.com/tildxyz/-/resizeb/20x/object.webp">',
    '<img src="https://thb.tildacdn.com/tildxyz/-/resize/504x/object.webp">',
    '<img src="https://static.tildacdn.com/img/tildacopy_black.png">',
    '<img data-original="https://static.tildacdn.com/tildxyz/object.webp">'
  ].join('');
  const items=extractTildaPhotoCandidates(html,'kvadro');
  assert.equal(items.length,1,items.map(v=>v.sourceUrl).join(';'));
  assert.equal(items[0].sourceUrl,'https://static.tildacdn.com/tildxyz/object.webp');
  assert.equal(items[0].publishable,false);
});

test('only exact original Tilda host is accepted, never lookalike domains',()=>{
  const html='<img src="https://static.tildacdn.com.evil.test/photo.webp">'+
             '<img src="https://example.net/x.webp">'+
             '<img src="https://static.tildacdn.com/tildabcd/real.webp">';
  const items=extractTildaPhotoCandidates(html,'home');
  assert.equal(items.length,1);
  assert.ok(items[0].sourceUrl.startsWith('https://static.tildacdn.com/'));
});

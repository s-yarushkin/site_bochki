import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildReviewQueue,exportReview} from '../ops/export-tilda-photo-review.mjs';

const original='https://static.tildacdn.com/tilda-aa/quad.webp';
const shared='https://static.tildacdn.com/tilda-common/brand.png';
const report={checkedAt:'2026-10-10T09:19:31.100Z',records:[
  {id:'kvadro',candidates:[{sourceUrl:original},{sourceUrl:shared},
    {sourceUrl:'https://thb.tildacdn.com/tilda-aa/-/resizeb/20x/quad.webp'},
    {sourceUrl:'https://static.tildacdn.com/img/tildacopy_black.png'},
    {sourceUrl:'https://static.tildacdn.com.evil.test/pic.webp'}]},
  {id:'viking',candidates:[{sourceUrl:shared}]}
]};

test('photo review queue is local to one model page, deduplicated, and source allowlisted',()=>{
  const items=buildReviewQueue(report);
  assert.equal(items.length,1,JSON.stringify(items));
  assert.equal(items[0].sourcePage,'kvadro');
  assert.equal(items[0].url,original);
  assert.match(items[0].id,/^GBV5-[A-F0-9]{9}$/);
});

test('offline review exporter preserves provenance and never sets publishable',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'gb-v5-photo-'));
  try {
    const webp=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBP'),Buffer.alloc(32)]);
    const fakeFetch=async()=>new Response(webp,{status:200,headers:{'content-type':'image/webp'}});
    const result=await exportReview(report,dir,fakeFetch);
    assert.equal(result.total,1);
    assert.equal(result.saved,1);
    assert.equal(result.items[0].publishable,false);
    assert.match(result.items[0].sha256,/^[a-f0-9]{64}$/);
    assert.match(await readFile(join(dir,'index.html'),'utf8'),/INTERNAL|НЕ подтверждены/);
    assert.equal((await readFile(join(dir,result.items[0].local))).length,webp.length);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('non-image response fails closed and is recorded without download',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'gb-v5-photo-'));
  try{
    const fakeFetch=async()=>new Response('<html>not photo</html>',{status:200,headers:{'content-type':'text/html'}});
    const result=await exportReview(report,dir,fakeFetch);
    assert.equal(result.saved,0);
    assert.equal(result.failed,1);
    assert.equal(result.items[0].publishable,false);
    assert.match(result.items[0].error,/INVALID_OR_OVERSIZE_IMAGE/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../ops/recover-tilda-photo-review.ps1',import.meta.url));
const ps=source.toString('ascii');

test('Windows PowerShell 5.1 photo recovery is strict ASCII without BOM or mojibake',()=>{
  assert.ok(source.every(byte=>byte<=0x7f),'non-ASCII in no-BOM PowerShell 5.1 script');
  assert.doesNotMatch(ps,/\b(?:\u0420|\u0421)[\u0400-\u04ff]/);
});
test('Windows recovery remains bounded, offline-only, and source-allowlisted',()=>{
  assert.match(ps,/static\.tildacdn\.com/);
  assert.match(ps,/Consecutive -ge 3/);
  assert.match(ps,/Compress-Archive/);
  assert.match(ps,/PUBLICATION_APPROVED=NO/);
  assert.doesNotMatch(ps,/ssh |sudo |git push |Invoke-RestMethod -Method Post/);
});

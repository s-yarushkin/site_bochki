import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,dirname,resolve,basename} from 'node:path';import {DatabaseSync} from 'node:sqlite';
import {openLeadStore} from '../api/server/lead-store.mjs';import {bootstrapCrm} from '../api/server/crm-bootstrap.mjs';import {hashManagerPassword} from '../api/server/manager-auth.mjs';
test('explicit bootstrap requires fresh authenticated evidence, preserves legacy hashes and reuses existing staff',()=>{
 const folder=mkdtempSync(join(tmpdir(),'dachapar-bootstrap-')),databasePath=join(folder,'fixture.sqlite'),store=openLeadStore(databasePath);store.close();
 const password='Fixture-long-password-2026!',accounts=[{phone:'+79990000001',hash:hashManagerPassword(password)},{phone:'+79990000002',hash:hashManagerPassword(password)}];
 const ownerEvidence={login_and_session_verified:true,origin:'https://xn--80aaan1dh9b.xn--p1ai',phone:accounts[0].phone,authenticated_at:new Date().toISOString()};
 const config={databasePath,accounts,sessionSecret:'f'.repeat(64),ownerEvidence,staff:[{phone:accounts[1].phone,name:'Existing fixture'},{phone:'+79990000003',name:'New fixture'}]};
 try{
  assert.throws(()=>bootstrapCrm({...config,ownerEvidence:{...ownerEvidence,login_and_session_verified:false}}),/VERIFIED_OWNER_REQUIRED/);
  assert.throws(()=>bootstrapCrm({...config,ownerEvidence:{...ownerEvidence,authenticated_at:'2020-01-01T00:00:00Z'}}),/OWNER_VERIFICATION_EXPIRED/);
  const result=bootstrapCrm(config);assert.equal(result.credentials.length,1);assert.equal(result.staff[0].existing,true);const second=bootstrapCrm(config);assert.equal(second.ownerId,result.ownerId);assert.equal(second.credentials.length,0);
  const db=new DatabaseSync(databasePath,{readOnly:true});try{for(const a of accounts)assert.equal(db.prepare('SELECT password_hash FROM staff_users WHERE phone_e164=?').get(a.phone).password_hash,a.hash);assert.equal(db.prepare('SELECT count(*) n FROM staff_users').get().n,3);}finally{db.close();}
 }finally{assert.equal(dirname(resolve(folder)),resolve(tmpdir()));assert.ok(basename(folder).startsWith('dachapar-bootstrap-'));rmSync(folder,{recursive:true,force:true});}
});

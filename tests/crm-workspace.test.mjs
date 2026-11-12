import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:http';
import {openLeadStore} from '../api/server/lead-store.mjs';
import {openCrmAccess} from '../api/server/crm-access.mjs';
import {hashManagerPassword} from '../api/server/manager-auth.mjs';
import {createCrmAuth} from '../api/server/crm-session.mjs';
import {createCrmManagerApi} from '../api/server/crm-manager-api.mjs';
const password='Local-fixture-password-2026',accounts=[1,2].map(i=>({phone:'+7999000000'+i,hash:hashManagerPassword(password)}));
async function fixture(action){
 const folder=mkdtempSync(join(tmpdir(),'dachapar-workspace-')),file=join(folder,'fixture.sqlite'),store=openLeadStore(file,{clock:()=> '2026-11-11T12:00:00.000Z'}),crm=openCrmAccess(file);crm.migrate();
 const [o,m]=crm.seedLegacy({accounts,ownerPhone:accounts[0].phone});
 const owner=crm.editUser(o.id,o.id,{name:'Сергей Ярушкин',active:true,roles:['owner_admin']}),manager=crm.editUser(o.id,m.id,{name:'Юрий Ярушкин',active:true,roles:['manager']});
 const db=new DatabaseSync(file),create=(patch={})=>store.create({flow:'callback',phone:'+79990000004',name:'Алёна',region:'Вологодская область',settlement:'Вологда',configuration:{selection:{model:'kvadro',size:'400',package:'comfort'}},intentContext:{entry:'layout_quote',pagePath:'/',sources:{model:'explicit'}},attribution:{last:{utm_source:'yandex',utm_campaign:'autumn'}},...patch},randomUUID()).lead;
 try{return await action({file,db,store,crm,owner,manager,create});}
 finally{db.close();crm.close();store.close();assert.equal(dirname(resolve(folder)),resolve(tmpdir()));assert.ok(basename(folder).startsWith('dachapar-workspace-'));rmSync(folder,{recursive:true,force:true});}
}
test('customer overlay and real-account assignment preserve submitted snapshot, delivery and credentials',()=>fixture(({db,store,crm,owner,manager,create})=>{
 const lead=create();store.delivery(lead.id,'delivered');const snapshot=db.prepare('SELECT snapshot_json,request_id FROM leads WHERE id=?').get(lead.id),auth=db.prepare('SELECT id,password_hash,active FROM staff_users ORDER BY id').all();
 const changed=store.workspace.update(lead.id,{expectedVersion:0,contactName:'Анна',settlement:'Сокол',region:'Вологодская область',assigneeUserId:manager.id,status:'in_progress',managerNote:'Нужна доставка\nУточнить подъезд',followUpAt:'2026-11-10T15:00:00+03:00'},owner.id);
 assert.equal(changed.customer.name,'Анна');assert.equal(changed.customer.settlement,'Сокол');assert.equal(changed.assigneeName,'Юрий Ярушкин');assert.equal(changed.version,1);assert.equal(changed.notificationStatus,'delivered');
 assert.deepEqual(db.prepare('SELECT snapshot_json,request_id FROM leads WHERE id=?').get(lead.id),snapshot);assert.deepEqual(db.prepare('SELECT id,password_hash,active FROM staff_users ORDER BY id').all(),auth);
 assert.equal(store.workspace.options().assignees.length,2);assert.equal(store.byRequest(snapshot.request_id).id,lead.id);
 assert.throws(()=>store.workspace.update(lead.id,{expectedVersion:0,contactName:'Stale'},owner.id),/LEAD_CONFLICT/);
 assert.throws(()=>store.workspace.update(lead.id,{assigneeUserId:randomUUID()},owner.id),/INVALID_ASSIGNEE/);
 crm.editUser(owner.id,manager.id,{name:manager.name,active:false,roles:['manager']});assert.throws(()=>store.workspace.update(lead.id,{assigneeUserId:manager.id},owner.id),/INVALID_ASSIGNEE/);
 assert.equal(store.workspace.decorate(store.get(lead.id)).assigneeActive,false);
 const same=store.workspace.update(lead.id,{contactName:'Анна',settlement:'Сокол',region:'Вологодская область',managerNote:changed.managerNote},owner.id);assert.equal(same.version,1);
}));
test('journal retries are idempotent, retain paragraphs and author, and test leads remain read-only',()=>fixture(({store,crm,owner,manager,create})=>{
 const lead=create(),entry={clientId:randomUUID(),kind:'message_in',channel:'max',body:'Хочу баню.\nНужен душ.',actor_id:owner.id};
 const first=store.workspace.append(lead.id,entry,manager.id);assert.equal(first.duplicate,false);assert.equal(first.activity.entries[0].actor_id,manager.id);assert.equal(first.activity.entries[0].actorName,'Юрий Ярушкин');assert.equal(first.activity.entries[0].body,entry.body);
 assert.equal(store.workspace.append(lead.id,entry,manager.id).duplicate,true);assert.equal(store.workspace.activity(lead.id).total,1);
 assert.throws(()=>store.workspace.append(lead.id,{...entry,body:'changed'},manager.id),/ACTIVITY_CONFLICT/);
 assert.throws(()=>store.workspace.append(lead.id,entry,owner.id),/ACTIVITY_CONFLICT/);
 assert.throws(()=>store.workspace.append(lead.id,{...entry,clientId:randomUUID(),occurredAt:'bad'},manager.id),/INVALID_DATE/);
 crm.classify(owner.id,lead.id,{classification:'test',reason:'Local fixture'});
 assert.throws(()=>store.workspace.append(lead.id,{...entry,clientId:randomUUID()},manager.id),/TEST_LEAD_READ_ONLY/);
 assert.throws(()=>store.workspace.update(lead.id,{contactName:'Denied'},manager.id),/TEST_LEAD_READ_ONLY/);
 assert.equal(store.workspace.activity(lead.id).total,1);
}));
test('combined filters cover Unicode, journal text, literal wildcards, attribution, geography and Moscow day edges',()=>fixture(({store,db,owner,manager,create})=>{
 const a=create(),b=create({name:'Другой',configuration:{selection:{model:'parus',size:'500'}}});
 store.workspace.update(a.id,{assigneeUserId:manager.id,settlement:'Череповец',followUpAt:'2026-11-10T12:00:00Z',status:'quote_sent'},owner.id);
 store.workspace.append(a.id,{clientId:randomUUID(),kind:'note',body:'Берём СЕМЁНОВО, скидка 10%_!' },owner.id);
 db.prepare('UPDATE leads SET created_at=? WHERE id=?').run('2026-11-10T21:00:00.000Z',a.id);db.prepare('UPDATE leads SET created_at=? WHERE id=?').run('2026-11-10T20:59:59.999Z',b.id);
 const filters={q:'алена семеново',status:'quote_sent',model:'kvadro',assignee:manager.id,region:'вологодская область',settlement:'череп',source:'YANDEX',campaign:'AUT',entry:'layout_quote',landing:'/',from:'2026-11-11',to:'2026-11-11',overdue:'1'};
 assert.equal(store.workspace.list(filters).total,1);assert.equal(store.workspace.list({q:'10%_!'}).total,1);assert.equal(store.workspace.list({q:'10X_!'}).total,0);
 assert.equal(store.workspace.list({assignee:'none'}).total,1);assert.equal(store.workspace.list({model:'parus',from:'2026-11-11'}).total,0);
 assert.throws(()=>store.workspace.list({from:'2026-02-30'}),/INVALID_FILTER/);assert.throws(()=>store.workspace.list({from:'2026-11-12',to:'2026-11-11'}),/INVALID_FILTER/);
 assert.equal(store.workspace.options().settlements.includes('Череповец'),true);
}));
test('new HTTP routes enforce session, Origin, CSRF and edit permission; conflicts retain useful codes',()=>fixture(async({store,crm,owner,manager,create})=>{
 const lead=create();let route;const server=createServer((req,res)=>route(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,auth=createCrmAuth({crm,sessionSecret:'1'.repeat(64)});route=createCrmManagerApi({crm,store,auth,origin});
 const call=(p,options={})=>fetch(origin+'/api/manager/'+p,options);
 try{
  assert.equal((await call('lead-options')).status,401);
  const login=await call('login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({phone:accounts[1].phone,password})}),body=await login.json(),cookie=login.headers.getSetCookie()[0].split(';')[0];
  const headers={Origin:origin,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':body.csrf},path='leads/'+lead.id;
  assert.equal((await call('lead-options',{headers})).status,200);
  const patch={contactName:'Changed',expectedVersion:0};
  assert.equal((await call(path,{method:'PATCH',headers:{...headers,Origin:'https://foreign.invalid'},body:JSON.stringify(patch)})).status,403);
  assert.equal((await call(path,{method:'PATCH',headers:{...headers,'X-CSRF-Token':'bad'},body:JSON.stringify(patch)})).status,403);
  assert.equal((await call(path,{method:'PATCH',headers,body:JSON.stringify(patch)})).status,200);
  const conflict=await call(path,{method:'PATCH',headers,body:JSON.stringify(patch)});assert.equal(conflict.status,409);assert.equal((await conflict.json()).code,'LEAD_CONFLICT');
  const note={clientId:randomUUID(),kind:'call',channel:'phone',body:'Договорились уточнить доставку'};assert.equal((await call(path+'/activity',{method:'POST',headers,body:JSON.stringify(note)})).status,200);
  assert.equal((await (await call(path+'/activity',{headers})).json()).activity.total,1);
  const role=crm.createRole(owner.id,{key:'custom_reader',name:'Reader',permissions:['view_all_leads']});crm.editUser(owner.id,manager.id,{name:manager.name,roles:[role.key],active:true});
  assert.equal((await call(path+'/activity',{method:'POST',headers,body:JSON.stringify({...note,clientId:randomUUID()})})).status,401);
 }finally{await new Promise(r=>server.close(r));}
}));
test('release migration renames existing staff without revoking sessions or changing encrypted MFA and submitted leads',()=>fixture(({file,db,store,crm,owner,manager,create})=>{
 const {user:third}=crm.createUser(owner.id,{phone:'+79990000003',name:'Третий сотрудник',roles:['manager']});
 db.exec('CREATE TABLE staff_mfa(user_id TEXT PRIMARY KEY,enabled INTEGER,secret_cipher TEXT,generation INTEGER,last_counter INTEGER,enabled_at TEXT)');
 db.prepare('INSERT INTO staff_mfa VALUES(?,1,?,3,123,?)').run(manager.id,'ENCRYPTED_SYNTHETIC_TEST_VALUE','2026-11-01T00:00:00Z');
 const session=crm.createSession(manager.id),lead=create(),original=store.get(lead.id).detail,config=join(dirname(file),'migration-fixture.json');
 writeFileSync(config,JSON.stringify({staff_names:[{phone:accounts[0].phone,name:'Сергей Ярушкин'},{phone:accounts[1].phone,name:'Юрий Ярушкин'},{phone:third.phone_e164,name:'Михаил Хапов'}]}));
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/migrate-workspace.mjs',import.meta.url)),new URL('../api/server/lead-store.mjs',import.meta.url).href,file,config],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const proof=JSON.parse(result.stdout);assert.equal(proof.renamed,1);assert.equal(proof.credentials_preserved,true);assert.equal(proof.mfa_preserved,true);
 assert.equal(crm.session(session.token).id,manager.id);assert.equal(crm.user(third.id).name,'Михаил Хапов');assert.equal(db.prepare('SELECT secret_cipher FROM staff_mfa').get().secret_cipher,'ENCRYPTED_SYNTHETIC_TEST_VALUE');assert.deepEqual(store.get(lead.id).detail,original);
}));

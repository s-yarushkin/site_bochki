import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {openCrmAccess} from '../api/server/crm-access.mjs';
import {openLeadStore} from '../api/server/lead-store.mjs';
import {hashManagerPassword} from '../api/server/manager-auth.mjs';
import {createCrmAuth} from '../api/server/crm-session.mjs';
import {createCrmManagerApi} from '../api/server/crm-manager-api.mjs';
import {createServer} from 'node:http';
import {openCrmInsights} from '../api/server/crm-insights.mjs';
import {createCrmPublicApi} from '../api/server/crm-public-api.mjs';

const password='Local-fixture-password-2026';
const accounts=[{phone:'+79990000001',hash:hashManagerPassword(password)},{phone:'+79990000002',hash:hashManagerPassword(password)}];
async function fixture(action){
 const folder=mkdtempSync(join(tmpdir(),'dachapar-crm-')),file=join(folder,'leads.sqlite');const leads=openLeadStore(file),crm=openCrmAccess(file);crm.migrate();const [owner,manager]=crm.seedLegacy({accounts,ownerPhone:accounts[0].phone});
 try{return await action({crm,leads,owner,manager,file});}finally{crm.close();leads.close();assert.equal(dirname(resolve(folder)),resolve(tmpdir()));assert.ok(basename(folder).startsWith('dachapar-crm-'));rmSync(folder,{recursive:true,force:true});}
}
test('migration preserves existing password hashes and assigns stable non-phone IDs',()=>fixture(({crm,owner,manager})=>{
 assert.match(owner.id,/^[a-f\d-]{36}$/);assert.equal(crm.authenticate(accounts[0].phone,password).id,owner.id);
 assert.equal(crm.authenticate(accounts[0].phone,'incorrect password'),null);assert.equal(crm.user(manager.id).roles[0],'manager');
 assert.throws(()=>crm.seedLegacy({accounts,ownerPhone:accounts[0].phone}),/ALREADY_INITIALIZED/);
 assert.equal('password_hash' in crm.user(owner.id),false);
}));
test('manager cannot manage staff, roles, aggregate analytics or audit',()=>fixture(({crm,manager})=>{
 for(const permission of ['manage_users','manage_roles','view_analytics','view_source_reports','manage_tracking_links','view_audit'])assert.throws(()=>crm.requirePermission(manager.id,permission),/FORBIDDEN/);
 assert.throws(()=>crm.createRole(manager.id,{key:'custom_bad',name:'Bad',permissions:[]}),/FORBIDDEN/);
 assert.throws(()=>crm.users(manager.id),/FORBIDDEN/);
}));
test('role allowlist rejects invented or system permissions and immutable owner role',()=>fixture(({crm,owner})=>{
 for(const key of ['owner_admin','manager','other'])assert.throws(()=>crm.createRole(owner.id,{key,name:'Bad',permissions:[]}),/INVALID_ROLE_KEY/);
 assert.throws(()=>crm.createRole(owner.id,{key:'custom_bad',name:'Bad',permissions:['hidden_owner']}),/INVALID_PERMISSIONS/);
 assert.throws(()=>crm.editRole(owner.id,'owner_admin',{name:'Changed',permissions:[]}),/SYSTEM_ROLE_IMMUTABLE/);
}));
test('blocking staff revokes sessions and preserves staff identity',()=>fixture(({crm,owner,manager})=>{
 const {token}=crm.createSession(manager.id);assert.equal(crm.session(token).id,manager.id);
 crm.editUser(owner.id,manager.id,{active:false,name:'Test manager',roles:['manager']});assert.equal(crm.session(token),null);
 assert.equal(crm.authenticate(accounts[1].phone,password),null);assert.equal(crm.user(manager.id).id,manager.id);
}));
test('last owner cannot be blocked or demoted',()=>fixture(({crm,owner})=>{
 for(const patch of [{active:false,roles:['owner_admin']},{active:true,roles:['manager']}])assert.throws(()=>crm.editUser(owner.id,owner.id,{name:'Owner',...patch}),/LAST_OWNER_PROTECTED/);
 assert.equal(crm.user(owner.id).active,true);
}));
test('custom-role changes revoke affected sessions and cannot grant outside actor permissions',()=>fixture(({crm,owner})=>{
 const role=crm.createRole(owner.id,{key:'custom_assistant',name:'Assistant',permissions:['view_all_leads']});
 const {user,initialPassword}=crm.createUser(owner.id,{phone:'+79990000003',name:'Assistant',roles:[role.key]});
 assert.equal(crm.authenticate(user.phone_e164,initialPassword).id,user.id);assert.equal(user.must_change_password,true);
 const {token}=crm.createSession(user.id);crm.editRole(owner.id,role.id,{name:'Assistant',permissions:[]});assert.equal(crm.session(token),null);
 assert.throws(()=>crm.requirePermission(user.id,'view_all_leads'),/FORBIDDEN/);
}));
test('test classification requires reason, is idempotent, preserves lead and MAX delivery, and restores prior status',()=>fixture(({crm,leads,owner,manager})=>{
 const record=leads.create({flow:'callback',phone:'+79990000004'},'11111111-1111-4111-8111-111111111111').lead;
 leads.delivery(record.id,'delivered');leads.update(record.id,{status:'in_progress',assignee:'',managerNote:''});
 assert.throws(()=>crm.classify(manager.id,record.id,{classification:'test',reason:''}),/INVALID_TEXT/);
 assert.equal(crm.classify(manager.id,record.id,{classification:'test',reason:'Local fixture'}).changed,true);
 assert.equal(crm.classify(manager.id,record.id,{classification:'test',reason:'Repeat'}).changed,false);
 assert.equal(leads.stats().total,0);assert.equal(leads.stats().byStatus.lost,0);
 assert.equal(leads.list().total,0);assert.equal(leads.list({classification:'test'}).total,1);assert.equal(leads.list({classification:'all'}).total,1);
 assert.equal(leads.detail(record.id).status,'lost');assert.equal(leads.detail(record.id).notificationStatus,'delivered');
 assert.throws(()=>crm.classify(manager.id,record.id,{classification:'real',reason:'Restore'}),/FORBIDDEN/);
 crm.classify(owner.id,record.id,{classification:'real',reason:'Restore fixture'});assert.equal(leads.detail(record.id).status,'in_progress');
 assert.equal(leads.stats().total,1);assert.equal(leads.stats().byStatus.in_progress,1);assert.equal(leads.list().total,1);
 assert.equal(leads.detail(record.id).events.filter(e=>e.action==='max_delivered').length,1);
}));
test('audit stores permissions and IDs without passwords or staff phone/name',()=>fixture(({crm,owner})=>{
 const name='SENSITIVE_FIXTURE_NAME',phone='+79990000005';
 const created=crm.createUser(owner.id,{name,phone,roles:['manager']});const raw=JSON.stringify(crm.audit(owner.id));
 for(const secret of [name,phone,created.initialPassword,'scrypt$'])assert.equal(raw.includes(secret),false);
}));
test('HTTP endpoints enforce login, Origin, CSRF, role permissions and immediate session revocation',()=>fixture(async({crm,leads,owner,manager})=>{
 const auth=createCrmAuth({crm,sessionSecret:'1'.repeat(64)});let route;
 const server=createServer((req,res)=>route(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;route=createCrmManagerApi({crm,store:leads,auth,origin});
 const call=(path,options={})=>fetch(origin+'/api/manager/'+path,options);
 const login=async phone=>{const response=await call('login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({phone,password})});assert.equal(response.status,200);return {body:await response.json(),cookie:response.headers.get('set-cookie').split(';')[0]};};
 try{
  assert.equal((await call('users')).status,401);
  const m=await login(accounts[1].phone),o=await login(accounts[0].phone);
  assert.equal((await call('users',{headers:{Cookie:m.cookie}})).status,403);
  assert.equal((await call('roles',{headers:{Cookie:m.cookie}})).status,403);
  const patch={method:'PATCH',headers:{Cookie:o.cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:'Manager',roles:['manager'],active:false})};
  assert.equal((await call('users/'+manager.id,patch)).status,403);
  patch.headers['X-CSRF-Token']=o.body.csrf;patch.headers.Origin='https://foreign.invalid';assert.equal((await call('users/'+manager.id,patch)).status,403);
  patch.headers.Origin=origin;assert.equal((await call('users/'+manager.id,patch)).status,200);
  assert.equal((await call('leads',{headers:{Cookie:m.cookie}})).status,401);
  assert.equal((await call('users',{headers:{Cookie:o.cookie}})).status,200);
  const session=await (await call('session',{headers:{Cookie:o.cookie}})).json();assert.equal(session.user.id,owner.id);assert.equal(session.role,'owner_admin');assert.equal(session.csrf,o.body.csrf);
 }finally{await new Promise(resolve=>server.close(resolve));}
}));
test('temporary password restricts API until changed; password changes revoke all prior sessions',()=>fixture(({crm,owner})=>{
 const {user,initialPassword}=crm.createUser(owner.id,{phone:'+79990000006',name:'New staff',roles:['manager']});
 const {token}=crm.createSession(user.id);assert.equal(crm.session(token).must_change_password,true);
 assert.throws(()=>crm.changePassword(user.id,'wrong-password',password),/INVALID_CREDENTIALS/);
 crm.changePassword(user.id,initialPassword,password);assert.equal(crm.session(token),null);assert.equal(crm.authenticate(user.phone_e164,password).must_change_password,false);
}));
test('public endpoints enforce Origin and batch limits; global reports and visitor IDs remain forbidden to managers',()=>fixture(async({crm,leads,file})=>{
 let route;const server=createServer((req,res)=>route(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port,insights=openCrmInsights(file,{secret:'1'.repeat(64),origin});insights.migrate();
 const publicApi=createCrmPublicApi({insights,origin}),managerApi=createCrmManagerApi({crm,store:leads,auth:createCrmAuth({crm,sessionSecret:'1'.repeat(64)}),origin,insights});route=async(req,res)=>{if(await publicApi(req,res))return;if(await managerApi(req,res))return;res.writeHead(404);res.end();};
 const post=(path,data,extra={})=>fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...extra},body:JSON.stringify(data)});
 try{
  assert.equal((await post('/api/analytics/consent',{choice:'all'},{Origin:'https://evil.invalid'})).status,403);
  const consent=await post('/api/analytics/consent',{choice:'all'});assert.equal(consent.status,200);const cookie=consent.headers.getSetCookie()[0].split(';')[0];
  assert.equal((await post('/api/analytics/events/batch',{events:Array(31).fill({})},{Cookie:cookie})).status,400);
  const staff=await (await post('/api/analytics/events/batch',{events:[]},{Cookie:cookie+'; dp_staff=1'})).json();assert.equal(staff.staffExcluded,true);
  const login=await post('/api/manager/login',{phone:accounts[1].phone,password});const managerCookie=login.headers.getSetCookie()[0].split(';')[0];
  for(const path of ['users','roles','tracking-links','source-reports?from=2026-11-05&to=2026-11-05','action-reports?from=2026-11-05&to=2026-11-05','visitors','visitors/11111111-1111-1111-1111-111111111111'])assert.equal((await fetch(origin+'/api/manager/'+path,{headers:{Cookie:managerCookie}})).status,403,path);
  const denied=await (await post('/api/analytics/events/batch',{events:[],visitor_id:'11111111-1111-1111-1111-111111111111'})).json();assert.equal(denied.consentRequired,true);
 }finally{await new Promise(resolve=>server.close(resolve));insights.close();}
}));

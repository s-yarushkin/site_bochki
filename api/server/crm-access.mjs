import {DatabaseSync} from 'node:sqlite';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {hashManagerPassword,verifyManagerPassword,normalizeManagerPhone} from './manager-auth.mjs';

export const PERMISSIONS=Object.freeze(['manage_users','manage_roles','view_all_leads','edit_leads','classify_leads','restore_test_leads','view_analytics','view_visitor_timeline','view_audit','manage_tracking_links','view_source_reports']);
const managerPermissions=['view_all_leads','edit_leads','classify_leads','view_visitor_timeline'];
const digest=value=>createHash('sha256').update(value).digest('hex');
const clean=(value,max=100)=>{if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))throw Error('INVALID_TEXT');return value.trim();};
const asJson=value=>JSON.stringify(value??null);

export function openCrmAccess(path,{now=()=>new Date().toISOString()}={}){
 const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 function transaction(action){db.exec('BEGIN IMMEDIATE');try{const value=action();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}
 function migrate(){db.exec(`
  CREATE TABLE IF NOT EXISTS staff_users(id TEXT PRIMARY KEY,phone_e164 TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),must_change_password INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,last_login_at TEXT);
  CREATE TABLE IF NOT EXISTS roles(id TEXT PRIMARY KEY,key TEXT UNIQUE NOT NULL,name TEXT NOT NULL,system INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS role_permissions(role_id TEXT NOT NULL REFERENCES roles(id),permission TEXT NOT NULL,PRIMARY KEY(role_id,permission));
  CREATE TABLE IF NOT EXISTS user_roles(user_id TEXT NOT NULL REFERENCES staff_users(id),role_id TEXT NOT NULL REFERENCES roles(id),PRIMARY KEY(user_id,role_id));
  CREATE TABLE IF NOT EXISTS staff_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES staff_users(id),created_at TEXT NOT NULL,expires_at TEXT NOT NULL,revoked_at TEXT);
  CREATE INDEX IF NOT EXISTS staff_sessions_user ON staff_sessions(user_id,expires_at);
  CREATE TABLE IF NOT EXISTS audit_log(seq INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT NOT NULL,action TEXT NOT NULL,object_type TEXT NOT NULL,object_id TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,at TEXT NOT NULL);
  CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT,'APPEND_ONLY_AUDIT'); END;
  CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT,'APPEND_ONLY_AUDIT'); END;
  CREATE TABLE IF NOT EXISTS lead_classification(lead_id TEXT PRIMARY KEY REFERENCES leads(id),classification TEXT NOT NULL CHECK(classification IN('real','test')),classified_at TEXT NOT NULL,classified_by TEXT NOT NULL REFERENCES staff_users(id),reason TEXT NOT NULL,previous_status TEXT NOT NULL);
 `);}
 function audit(actor,action,type,id,before,after){db.prepare('INSERT INTO audit_log(actor_id,action,object_type,object_id,before_json,after_json,at) VALUES(?,?,?,?,?,?,?)').run(actor,action,type,id,asJson(before),asJson(after),now());}
 function user(id){
  const row=db.prepare('SELECT id,name,phone_e164,active,must_change_password,created_at,last_login_at FROM staff_users WHERE id=?').get(id);if(!row)return null;
  const roles=db.prepare('SELECT r.key FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=? ORDER BY r.key').all(id).map(r=>r.key);
  const permissions=db.prepare('SELECT DISTINCT p.permission FROM role_permissions p JOIN user_roles ur ON ur.role_id=p.role_id WHERE ur.user_id=? ORDER BY p.permission').all(id).map(r=>r.permission).filter(p=>PERMISSIONS.includes(p));
  return {...row,active:Boolean(row.active),must_change_password:Boolean(row.must_change_password),roles,permissions};
 }
 function requirePermission(actor,permission){const current=user(actor);if(!current?.active||!current.permissions.includes(permission))throw Error('FORBIDDEN');return current;}
 function revoke(id){db.prepare('UPDATE staff_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(now(),id);}
 function roleIds(keys,actor){
  if(!Array.isArray(keys)||!keys.length||keys.length>10||new Set(keys).size!==keys.length)throw Error('INVALID_ROLES');
  return keys.map(key=>{const role=db.prepare('SELECT * FROM roles WHERE key=?').get(key);if(!role)throw Error('INVALID_ROLES');if(key==='owner_admin'&&!actor.roles.includes('owner_admin'))throw Error('FORBIDDEN');
   const permissions=db.prepare('SELECT permission FROM role_permissions WHERE role_id=?').all(role.id);
   if(permissions.some(p=>!actor.permissions.includes(p.permission)))throw Error('FORBIDDEN');return role.id;});
 }
 function seedLegacy({accounts,ownerPhone}){
  if(!Array.isArray(accounts)||accounts.length!==2||!accounts.some(a=>a.phone===ownerPhone))throw Error('VERIFIED_LEGACY_OWNER_REQUIRED');
  return transaction(()=>{
   if(db.prepare('SELECT count(*) n FROM staff_users').get().n)throw Error('ALREADY_INITIALIZED');
   for(const [key,permissions] of [['owner_admin',PERMISSIONS],['manager',managerPermissions]]){
    db.prepare('INSERT INTO roles(id,key,name,system) VALUES(?,?,?,1)').run(key,key,key==='owner_admin'?'Владелец':'Менеджер');
    for(const permission of permissions)db.prepare('INSERT INTO role_permissions VALUES(?,?)').run(key,permission);
   }
   const result=[];
   for(const account of accounts){
    if(normalizeManagerPhone(account.phone)!==account.phone||!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(account.hash))throw Error('INVALID_LEGACY_ACCOUNT');
    const id=randomUUID(),owner=account.phone===ownerPhone;
    db.prepare('INSERT INTO staff_users(id,phone_e164,name,password_hash,created_at) VALUES(?,?,?,?,?)').run(id,account.phone,owner?'Владелец':'Менеджер',account.hash,now());
    db.prepare('INSERT INTO user_roles VALUES(?,?)').run(id,owner?'owner_admin':'manager');
    audit('migration','legacy_account_import','user',id,null,{role:owner?'owner_admin':'manager'});result.push(user(id));
   }return result;
  });
 }
 function createRole(actorId,{key,name,permissions}){return transaction(()=>{
  const actor=requirePermission(actorId,'manage_roles');if(typeof key!=='string'||!/^custom_[a-z0-9_]{1,40}$/.test(key))throw Error('INVALID_ROLE_KEY');
  if(!Array.isArray(permissions)||permissions.some(p=>!PERMISSIONS.includes(p)||!actor.permissions.includes(p))||new Set(permissions).size!==permissions.length)throw Error('INVALID_PERMISSIONS');
  const id=randomUUID();db.prepare('INSERT INTO roles(id,key,name) VALUES(?,?,?)').run(id,key,clean(name));
  for(const p of permissions)db.prepare('INSERT INTO role_permissions VALUES(?,?)').run(id,p);
  audit(actorId,'role_create','role',id,null,{key,permissions});return {id,key,name,permissions};
 });}
 function editRole(actorId,id,{name,permissions}){return transaction(()=>{
  const actor=requirePermission(actorId,'manage_roles'),role=db.prepare('SELECT * FROM roles WHERE id=?').get(id);if(!role)throw Error('NOT_FOUND');if(role.system)throw Error('SYSTEM_ROLE_IMMUTABLE');
  const before=db.prepare('SELECT permission FROM role_permissions WHERE role_id=?').all(id).map(r=>r.permission);
  if(before.some(p=>!actor.permissions.includes(p))||!Array.isArray(permissions)||permissions.some(p=>!PERMISSIONS.includes(p)||!actor.permissions.includes(p))||new Set(permissions).size!==permissions.length)throw Error('INVALID_PERMISSIONS');
  db.prepare('UPDATE roles SET name=? WHERE id=?').run(clean(name),id);db.prepare('DELETE FROM role_permissions WHERE role_id=?').run(id);
  for(const p of permissions)db.prepare('INSERT INTO role_permissions VALUES(?,?)').run(id,p);
  for(const row of db.prepare('SELECT user_id FROM user_roles WHERE role_id=?').all(id))revoke(row.user_id);
  audit(actorId,'role_update','role',id,{permissions:before},{permissions});return {id,name,permissions};
 });}
 function createUser(actorId,{name,phone,roles,password}){return transaction(()=>{
  const actor=requirePermission(actorId,'manage_users'),normalized=normalizeManagerPhone(phone);if(!normalized)throw Error('INVALID_PHONE');
  const ids=roleIds(roles,actor),id=randomUUID(),initialPassword=password??randomBytes(20).toString('base64url');
  const hash=hashManagerPassword(initialPassword);
  db.prepare('INSERT INTO staff_users(id,phone_e164,name,password_hash,must_change_password,created_at) VALUES(?,?,?,?,1,?)').run(id,normalized,clean(name),hash,now());
  for(const role of ids)db.prepare('INSERT INTO user_roles VALUES(?,?)').run(id,role);
  audit(actorId,'user_create','user',id,null,{roles,active:true});return {user:user(id),initialPassword};
 });}
 function editUser(actorId,id,{active,roles,name}){return transaction(()=>{
  const actor=requirePermission(actorId,'manage_users'),before=user(id);if(!before)throw Error('NOT_FOUND');if(typeof active!=='boolean')throw Error('INVALID_ACTIVE');
  const ids=roleIds(roles,actor);
  if(before.roles.includes('owner_admin')&&!actor.roles.includes('owner_admin'))throw Error('FORBIDDEN');
  if(before.active&&before.roles.includes('owner_admin')&&(!active||!roles.includes('owner_admin'))){
   const count=db.prepare("SELECT count(DISTINCT u.id) n FROM staff_users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.active=1 AND r.key='owner_admin'").get().n;
   if(count<=1)throw Error('LAST_OWNER_PROTECTED');
  }
  db.prepare('UPDATE staff_users SET active=?,name=? WHERE id=?').run(active?1:0,clean(name),id);db.prepare('DELETE FROM user_roles WHERE user_id=?').run(id);
  for(const role of ids)db.prepare('INSERT INTO user_roles VALUES(?,?)').run(id,role);revoke(id);
  audit(actorId,'user_update','user',id,{roles:before.roles,active:before.active},{roles,active});return user(id);
 });}
 function authenticate(phone,password){
  const normalized=normalizeManagerPhone(phone),row=db.prepare('SELECT * FROM staff_users WHERE phone_e164=?').get(normalized??'');
  const fallback='scrypt$00000000000000000000000000000000$'+'0'.repeat(128);
  const valid=verifyManagerPassword(password,row?.password_hash??fallback);if(!row?.active||!valid)return null;
  db.prepare('UPDATE staff_users SET last_login_at=? WHERE id=?').run(now(),row.id);return user(row.id);
 }
 function createSession(id){
  if(!user(id)?.active)throw Error('FORBIDDEN');const token=randomBytes(32).toString('base64url'),time=now(),expires=new Date(Date.parse(time)+8*3600000).toISOString();
  db.prepare('INSERT INTO staff_sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(digest(token),id,time,expires);return {token,expires};
 }
 function session(token){if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
  const row=db.prepare('SELECT user_id FROM staff_sessions WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?').get(digest(token),now());const found=row?user(row.user_id):null;return found?.active?found:null;
 }
 function changePassword(id,currentPassword,password){return transaction(()=>{
  const row=db.prepare('SELECT password_hash FROM staff_users WHERE id=? AND active=1').get(id);
  if(!row||!verifyManagerPassword(currentPassword,row.password_hash))throw Error('INVALID_CREDENTIALS');
  db.prepare('UPDATE staff_users SET password_hash=?,must_change_password=0 WHERE id=?').run(hashManagerPassword(password),id);revoke(id);
  audit(id,'password_change','user',id,null,{sessions_revoked:true});
 });}
 function resetPassword(actor,id){return transaction(()=>{
  const current=requirePermission(actor,'manage_users'),target=user(id);if(!target)throw Error('NOT_FOUND');
  if(target.roles.includes('owner_admin')&&!current.roles.includes('owner_admin'))throw Error('FORBIDDEN');
  const password=randomBytes(20).toString('base64url');db.prepare('UPDATE staff_users SET password_hash=?,must_change_password=1 WHERE id=?').run(hashManagerPassword(password),id);revoke(id);
  audit(actor,'password_reset','user',id,null,{must_change_password:true});return {initialPassword:password};
 });}
 function classify(actorId,leadId,{classification,reason}){return transaction(()=>{
  requirePermission(actorId,classification==='real'?'restore_test_leads':'classify_leads');if(!['real','test'].includes(classification))throw Error('INVALID_CLASSIFICATION');reason=clean(reason,500);
  const lead=db.prepare('SELECT status FROM leads WHERE id=?').get(leadId);if(!lead)throw Error('NOT_FOUND');
  const before=db.prepare('SELECT * FROM lead_classification WHERE lead_id=?').get(leadId);
  if((before?.classification??'real')===classification)return {changed:false,classification};
  const previous=classification==='test'?lead.status:before.previous_status;
  db.prepare('INSERT INTO lead_classification VALUES(?,?,?,?,?,?) ON CONFLICT(lead_id) DO UPDATE SET classification=excluded.classification,classified_at=excluded.classified_at,classified_by=excluded.classified_by,reason=excluded.reason,previous_status=excluded.previous_status').run(leadId,classification,now(),actorId,reason,previous);
  db.prepare('UPDATE leads SET status=?,updated_at=? WHERE id=?').run(classification==='test'?'lost':previous,now(),leadId);
  audit(actorId,'lead_classify','lead',leadId,{classification:before?.classification??'real',status:lead.status},{classification,status:classification==='test'?'lost':previous,reason});
  return {changed:true,classification};
 });}
 return {migrate,seedLegacy,user,requirePermission,createRole,editRole,createUser,editUser,authenticate,createSession,session,classify,changePassword,resetPassword,
  authAudit(id,success){audit(id??'anonymous',success?'login_success':'login_failure','auth','session',null,{success:Boolean(success)});},
  logout(token){if(typeof token==='string')db.prepare('UPDATE staff_sessions SET revoked_at=? WHERE token_hash=?').run(now(),digest(token));},
  revokeSessions(actor,id){return transaction(()=>{const current=requirePermission(actor,'manage_users'),target=user(id);if(!target)throw Error('NOT_FOUND');if(target.roles.includes('owner_admin')&&!current.roles.includes('owner_admin'))throw Error('FORBIDDEN');revoke(id);audit(actor,'sessions_revoke','user',id,null,null);});},
  classification(id){return db.prepare('SELECT classification,reason,classified_at,classified_by FROM lead_classification WHERE lead_id=?').get(id)??{classification:'real'};},
  users(actor){requirePermission(actor,'manage_users');return db.prepare('SELECT id FROM staff_users ORDER BY created_at,id').all().map(r=>user(r.id));},
  roles(actor){requirePermission(actor,'manage_roles');return db.prepare('SELECT * FROM roles ORDER BY system DESC,key').all().map(r=>({...r,permissions:db.prepare('SELECT permission FROM role_permissions WHERE role_id=?').all(r.id).map(p=>p.permission)}));},
  audit(actor){requirePermission(actor,'view_audit');return db.prepare('SELECT * FROM audit_log ORDER BY seq DESC LIMIT 200').all();},
  close(){db.close();}
 };
}

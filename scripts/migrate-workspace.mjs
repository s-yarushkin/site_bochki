// Executed on an isolated restored backup first, then on the live DB. Never exports data.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [moduleUrl,database,configPath]=process.argv.slice(2),config=JSON.parse(readFileSync(configPath));
const {openLeadStore}=await import(moduleUrl),db=new DatabaseSync(database);db.exec('PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON;');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const protectedQueries=[['accounts','SELECT id,phone_e164,password_hash,active,must_change_password FROM staff_users ORDER BY id'],['permissions','SELECT * FROM role_permissions ORDER BY role_id,permission'],['roles','SELECT * FROM user_roles ORDER BY user_id,role_id'],['mfa','SELECT user_id,enabled,secret_cipher,generation,enabled_at FROM staff_mfa ORDER BY user_id']];
const protectedState=()=>Object.fromEntries(protectedQueries.map(([k,q])=>[k,hash(db.prepare(q).all())]));
const before=protectedState(),leads=new Map(db.prepare('SELECT id,snapshot_json,request_id,notification_status,notified_at FROM leads').all().map(r=>[r.id,hash(r)]));
const store=openLeadStore(database);store.close();
db.exec('BEGIN IMMEDIATE');
try{
 const accounts=config.staff_names.map(x=>{const row=db.prepare('SELECT id,name,phone_e164,active FROM staff_users WHERE phone_e164=?').get(x.phone);if(!row||!row.active)throw Error('Required existing staff account unavailable');return {...row,newName:x.name};});
 if(new Set(accounts.map(x=>x.id)).size!==3)throw Error('Expected three distinct existing staff accounts');
 let renamed=0,linked=0;
 for(const row of accounts){
  if(row.name!==row.newName){db.prepare('UPDATE staff_users SET name=? WHERE id=?').run(row.newName,row.id);db.prepare('INSERT INTO audit_log(actor_id,action,object_type,object_id,before_json,after_json,at) VALUES(?,?,?,?,?,?,?)').run('workspace_release','staff_display_name','user',row.id,'{}','{"display_name_updated":true}',new Date().toISOString());renamed++;}
  const names=[row.name,row.newName,row.phone_e164,row.newName.split(' ')[0]];
  for(const name of new Set(names)){if(!name||['Менеджер','Владелец'].includes(name))continue;linked+=db.prepare("INSERT OR IGNORE INTO crm_lead_profiles(lead_id,assignee_user_id,version,updated_at,updated_by) SELECT id,?,0,?,'workspace_release' FROM leads WHERE assignee=?").run(row.id,new Date().toISOString(),name).changes;}
 }
 if(JSON.stringify(before)!==JSON.stringify(protectedState()))throw Error('Protected authentication data changed');
 for(const [id,digest]of leads)if(hash(db.prepare('SELECT id,snapshot_json,request_id,notification_status,notified_at FROM leads WHERE id=?').get(id))!==digest)throw Error('Original lead or delivery changed');
 if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Database consistency failed');
 db.exec('COMMIT');console.log(JSON.stringify({ok:true,existing_accounts:3,renamed,linked_legacy_assignees:linked,credentials_preserved:true,mfa_preserved:true,original_leads_preserved:leads.size,schema:'additive profiles and contact journal'}));
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}

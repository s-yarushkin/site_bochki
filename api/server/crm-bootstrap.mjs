// Explicit deployment step. Never called by a public HTTP endpoint or normal server startup.
import {DatabaseSync} from 'node:sqlite';
import {openCrmAccess} from './crm-access.mjs';
import {openCrmInsights} from './crm-insights.mjs';
import {normalizeManagerPhone} from './manager-auth.mjs';
export function bootstrapCrm({databasePath,accounts,sessionSecret,ownerEvidence,staff}){
 if(ownerEvidence?.login_and_session_verified!==true||ownerEvidence.origin!=='https://xn--80aaan1dh9b.xn--p1ai'||normalizeManagerPhone(ownerEvidence.phone)!==ownerEvidence.phone||!accounts.some(a=>a.phone===ownerEvidence.phone))throw Error('VERIFIED_OWNER_REQUIRED');
 const age=Date.now()-Date.parse(ownerEvidence.authenticated_at);if(!Number.isFinite(age)||age<0||age>24*3600000)throw Error('OWNER_VERIFICATION_EXPIRED');
 if(!Array.isArray(staff)||staff.length>20||new Set(staff.map(p=>p.phone)).size!==staff.length||staff.some(p=>normalizeManagerPhone(p.phone)!==p.phone||p.phone===ownerEvidence.phone||typeof p.name!=='string'||!p.name.trim()||p.name.length>100))throw Error('INVALID_INITIAL_STAFF');
 const crm=openCrmAccess(databasePath);let lookup,insights;
 try{
  crm.migrate();if(!crm.initialized())crm.seedLegacy({accounts,ownerPhone:ownerEvidence.phone});
  lookup=new DatabaseSync(databasePath,{readOnly:true});
  const ownerId=lookup.prepare('SELECT id FROM staff_users WHERE phone_e164=?').get(ownerEvidence.phone)?.id;
  const owner=ownerId?crm.user(ownerId):null;if(!owner?.active||!owner.roles.includes('owner_admin'))throw Error('VERIFIED_OWNER_NOT_ADMIN');
  const credentials=[],created=[];
  for(const entry of staff){
   const existing=lookup.prepare('SELECT id FROM staff_users WHERE phone_e164=?').get(entry.phone);
   if(existing){const current=crm.user(existing.id);if(current.roles.includes('owner_admin'))throw Error('OWNER_STAFF_COLLISION');crm.editUser(owner.id,current.id,{name:entry.name,active:current.active,roles:current.roles});created.push({id:current.id,existing:true});}
   else{const result=crm.createUser(owner.id,{name:entry.name,phone:entry.phone,roles:['manager']});created.push({id:result.user.id,existing:false});credentials.push({id:result.user.id,name:entry.name,phone:entry.phone,initialPassword:result.initialPassword});}
  }
  insights=openCrmInsights(databasePath,{secret:sessionSecret,origin:'https://xn--80aaan1dh9b.xn--p1ai'});insights.migrate();
  return {ownerId:owner.id,staff:created,credentials};
 }finally{insights?.close();lookup?.close();crm.close();}
}

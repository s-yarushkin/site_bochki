// Explicit, root-only deployment entry point. Its JSON contains one-time activation
// codes and MUST be captured only in the private interactive terminal, never a log.
import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
if(process.getuid?.()!==0)throw Error('ROOT_REQUIRED');
const api=process.argv[3];if(!/^\/srv\/services\/garant-bani-relay\/releases\/MFA-[a-f0-9]{12}$/.test(api??''))throw Error('RELEASE_REQUIRED');
const {openCrmAccess}=await import(pathToFileURL(api+'/server/crm-access.mjs'));const {openCrmMfa}=await import(pathToFileURL(api+'/server/crm-mfa.mjs'));
const database=process.argv[2];if(!database?.startsWith('/var/lib/garant-bani-relay/'))throw Error('UNSAFE_DATABASE');
const secret=fs.readFileSync('/etc/garant-bani-preview/manager-session-secret','utf8').trim();
const crm=openCrmAccess(database);if(!crm.initialized())throw Error('EXISTING_CRM_REQUIRED');crm.migrate();const mfa=openCrmMfa(database,{secret});mfa.migrate();
const db=new DatabaseSync(database);const owners=db.prepare("SELECT DISTINCT u.id FROM staff_users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.active=1 AND r.key='owner_admin'").all();if(!owners.length)throw Error('OWNER_REQUIRED');
const codes=[];for(const user of db.prepare('SELECT id,name,phone_e164 FROM staff_users WHERE active=1 ORDER BY created_at,id').all())if(!mfa.status(user.id).enabled)codes.push({...user,...mfa.issueInvite(owners[0].id,user.id)});
db.close();mfa.close();crm.close();console.log(JSON.stringify({ok:true,activationCodes:codes}));

// Root-only maintenance: replace an unused owner enrollment invitation.
// stdout is private; never log or save it. An enabled authenticator is NOT reset.
import fs from 'node:fs';import {execFileSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';import {pathToFileURL} from 'node:url';
const OWNER='7e66af03-4d57-49f7-b688-51d52ac15836';
function stop(code){console.log(JSON.stringify({ok:false,code}));process.exitCode=1;}
async function main(){
 if(process.getuid?.()!==0)throw Error('ROOT_REQUIRED');
 const api=fs.realpathSync('/srv/services/garant-bani-relay/current');if(api!=='/srv/services/garant-bani-relay/releases/MFA-81c68cd72bf6')throw Error('RELEASE_CHANGED');
 const pid=execFileSync('systemctl',['show','garant-bani-relay.service','--property=MainPID','--value'],{encoding:'utf8'}).trim();if(!/^\d+$/.test(pid)||Number(pid)<2)throw Error('SERVICE_UNAVAILABLE');
 const database=fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0').find(v=>v.startsWith('LEADS_DB_PATH='))?.slice('LEADS_DB_PATH='.length);if(!database?.startsWith('/var/lib/garant-bani-relay/'))throw Error('UNSAFE_DATABASE');
 const db=new DatabaseSync(database);let mfa;
 try{
  const owner=db.prepare("SELECT u.id FROM staff_users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=? AND u.active=1 AND r.key='owner_admin'").get(OWNER);if(!owner)throw Error('EXISTING_OWNER_REQUIRED');
  const {openCrmMfa}=await import(pathToFileURL(api+'/server/crm-mfa.mjs'));mfa=openCrmMfa(database,{secret:fs.readFileSync('/etc/garant-bani-preview/manager-session-secret','utf8').trim()});if(!mfa.ready())throw Error('MFA_NOT_READY');
  if(mfa.status(OWNER).enabled){console.log(JSON.stringify({ok:true,alreadyEnabled:true}));return;}
  const invitation=mfa.issueInvite('root-owner-invite-reissue',OWNER);
  console.log(JSON.stringify({ok:true,alreadyEnabled:false,...invitation}));
 }finally{mfa?.close();db.close();}
}
try{await main();}catch(error){stop(['ROOT_REQUIRED','RELEASE_CHANGED','SERVICE_UNAVAILABLE','UNSAFE_DATABASE','EXISTING_OWNER_REQUIRED','MFA_NOT_READY','MFA_ALREADY_ENABLED'].includes(error.message)?error.message:'REISSUE_FAILED');}

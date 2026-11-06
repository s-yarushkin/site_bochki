import {createHmac,timingSafeEqual} from 'node:crypto';
import {normalizeManagerPhone} from './manager-auth.mjs';
const COOKIE='gb_manager_session',CHALLENGE='dp_manager_challenge';
function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);}
function token(req,name=COOKIE){return String(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)??'';}
function browserLabel(ua=''){const browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Браузер';const os=/Android/.test(ua)?'Android':/iPhone|iPad/.test(ua)?'iOS':/Windows/.test(ua)?'Windows':/Macintosh/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'';return browser+(os?' · '+os:'');}
export function createCrmAuth({crm,sessionSecret,cookiePath='/api/manager/',clock=()=>Date.now(),mfa=null}){
 if(!crm||typeof sessionSecret!=='string'||sessionSecret.length<64||!/^\/(?:[a-z0-9-]+\/)*api\/manager\/$/.test(cookiePath))throw Error('INVALID_CRM_AUTH_CONFIG');
 const attempts=new Map();
 const csrf=(raw,scope='session')=>createHmac('sha256',sessionSecret).update(scope+':'+raw).digest('base64url');
 const cookie=(name,raw,maxAge=null)=>`${name}=${raw}; Path=${cookiePath};${maxAge===null?'':' Max-Age='+Math.max(0,Math.floor(maxAge))+';'} HttpOnly; Secure; SameSite=Strict`;
 const sessionCookie=(raw,remember,expires)=>cookie(COOKIE,raw,remember?(Date.parse(expires)-clock())/1000:null);
 const security=row=>({remember:Boolean(row.remember),expires_at:row.expires_at,absolute_expires_at:row.absolute_expires_at,mfa_verified_at:row.mfa_verified_at});
 return {
  login(phone,password,ip,{remember=false,req={headers:{}}}={}){
   const principal=normalizeManagerPhone(phone)??String(phone??'').slice(0,45),key=String(ip??'unknown').slice(0,100),time=clock();
   for(const [k,v]of attempts)if(time-v.at>=900000)attempts.delete(k);
   if(attempts.size>5000||(attempts.get(key)?.count??0)>=5||(mfa&&!mfa.passwordAllowed(principal,key)))return {ok:false,limited:true};
   const user=crm.authenticate(phone,password,{markLogin:!mfa});
   if(!user){attempts.set(key,{at:time,count:(attempts.get(key)?.count??0)+1});mfa?.passwordFailed(principal,key);crm.authAudit(null,false);return {ok:false};}
   if(mfa){const pending=mfa.begin(user.id,remember===true);if(!pending.ok)return pending;crm.logout(token(req));mfa.cancel(token(req,CHALLENGE));return {ok:true,pending:true,stage:pending.stage,csrf:csrf(pending.raw,'challenge'),expires_at:pending.expires_at,cookie:[cookie(COOKIE,'',0),cookie(CHALLENGE,pending.raw,300)]};}
   crm.authAudit(user.id,true);attempts.delete(key);const found=crm.createSession(user.id);return {ok:true,user,csrf:csrf(found.token),cookie:cookie(COOKIE,found.token,28800)};
  },
  session(req){const raw=token(req),found=crm.sessionInfo(raw);if(!found)return null;if(mfa){const state=mfa.status(found.user.id);if(!state.enabled||state.generation!==found.mfa_generation||!found.mfa_verified_at)return null;}const row=crm.refreshSession(raw);return {user:row.user,csrf:csrf(raw),security:security(row),...(row.renewed?{cookie:sessionCookie(raw,true,row.expires_at)}:{})};},
  validCsrf(req){const raw=token(req);return Boolean(raw)&&equal(req.headers['x-csrf-token']??'',csrf(raw));},
  validChallengeCsrf(req){const raw=token(req,CHALLENGE);return Boolean(mfa?.challenge(raw))&&equal(req.headers['x-csrf-token']??'',csrf(raw,'challenge'));},
  setup(req,activationCode){return mfa.setup(token(req,CHALLENGE),String(activationCode??'').slice(0,100));},
  finish(req,code,ip){const proof=mfa.finish(token(req,CHALLENGE),String(code??'').slice(0,100));if(!proof.ok)return proof;const user=crm.user(proof.user_id);if(!user?.active||mfa.status(user.id).generation!==proof.generation)return {ok:false,expired:true};const found=crm.createSession(user.id,{remember:proof.remember,mfaGeneration:proof.generation,verifiedAt:proof.verified_at,browserLabel:browserLabel(String(req.headers['user-agent']??'').slice(0,500))});crm.markLogin(user.id);crm.authAudit(user.id,true);const key=String(ip??'unknown').slice(0,100);mfa.passwordSucceeded(user.phone_e164,key);attempts.delete(key);return {ok:true,user,csrf:csrf(found.token),security:security(crm.sessionInfo(found.token)),cookie:[sessionCookie(found.token,found.remember,found.expires),cookie(CHALLENGE,'',0)],...(proof.recoveryCodes?{recoveryCodes:proof.recoveryCodes}:{})};},
  cancel(req){mfa?.cancel(token(req,CHALLENGE));return cookie(CHALLENGE,'',0);},
  logout(req){crm.logout(token(req));mfa?.cancel(token(req,CHALLENGE));return mfa?[cookie(COOKIE,'',0),cookie(CHALLENGE,'',0)]:cookie(COOKIE,'',0);},
  devices(req,id){return crm.ownSessions(id,token(req));},
  revokeOthers(req,id){crm.revokeOtherSessions(id,token(req));},
  sensitiveProof(id,password,code){return mfa.sensitiveProof(id,code,crm.verifyPassword(id,password));},
 };
}

import {PERMISSIONS} from './crm-access.mjs';
import qrcode from './vendor/qrcode.cjs';

export function crmAnswer(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',...extra});res.end(JSON.stringify(data));}
export async function crmJson(req,limit=12000){
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))throw Error('JSON_REQUIRED');
 const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>limit)throw Error('BODY_TOO_LARGE');chunks.push(chunk);}
 let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('INVALID_JSON');}
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('INVALID_JSON');return data;
}
export function createCrmManagerApi({crm,store,auth,origin,insights=null,mfa=null,aggregate=null}){
 const full=found=>({ok:true,phone:found.user.phone_e164,role:found.user.roles.includes('owner_admin')?'owner_admin':'manager',user:found.user,csrf:found.csrf,...(mfa?{security:found.security,mfa:true}:{}),...(found.recoveryCodes?{recoveryCodes:found.recoveryCodes}:{})});
 const ip=req=>String(req.headers['x-forwarded-for']??'').split(',').at(-1)?.trim()||req.socket.remoteAddress;
 const factorResult=(res,found)=>{if(found.ok)return true;crmAnswer(res,found.limited?429:found.expired?401:400,{ok:false,code:found.limited?'RATE_LIMITED':found.expired?'CHALLENGE_EXPIRED':'INVALID_SECOND_FACTOR'});return false;};
 return async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),path=url.pathname;
  if(!path.startsWith('/api/manager/'))return false;
  const modifying=!['GET','HEAD'].includes(req.method);
  if(modifying&&req.headers.origin!==origin){crmAnswer(res,403,{ok:false,code:'ORIGIN_FORBIDDEN'});return true;}
  try{
   if(path==='/api/manager/login'&&req.method==='POST'){
    const data=await crmJson(req);
    const found=auth.login(data.phone,data.password,ip(req),{remember:data.remember===true,req});
    if(!found.ok){crmAnswer(res,found.limited?429:401,{ok:false,code:found.limited?'RATE_LIMITED':'INVALID_CREDENTIALS'});return true;}
    crmAnswer(res,200,found.pending?{ok:true,pending:true,stage:found.stage,csrf:found.csrf,expires_at:found.expires_at}:full(found),{'Set-Cookie':found.cookie});return true;
   }
   if(mfa&&['/api/manager/mfa/setup','/api/manager/mfa/verify','/api/manager/login/cancel'].includes(path)&&req.method==='POST'){
    if(!auth.validChallengeCsrf(req)){crmAnswer(res,403,{ok:false,code:'CHALLENGE_EXPIRED'});return true;}
    if(path.endsWith('/cancel')){crmAnswer(res,200,{ok:true},{'Set-Cookie':auth.cancel(req)});return true;}
    const data=await crmJson(req);
    if(path.endsWith('/setup')){const found=auth.setup(req,data.activationCode);if(!factorResult(res,found))return true;const label='DachaPar:'+crm.user(found.user_id).phone_e164;const uri='otpauth://totp/'+encodeURIComponent(label)+'?secret='+found.secret+'&issuer=DachaPar&algorithm=SHA1&digits=6&period=30';const qr=qrcode(0,'M');qr.addData(uri);qr.make();crmAnswer(res,200,{ok:true,secret:found.secret,qr:qr.createSvgTag({cellSize:4,margin:16,scalable:true})});return true;}
    const found=auth.finish(req,data.code,ip(req));if(!factorResult(res,found))return true;crmAnswer(res,200,full(found),{'Set-Cookie':found.cookie});return true;
   }
   const session=auth.session(req);if(!session){crmAnswer(res,401,{ok:false,code:'LOGIN_REQUIRED'});return true;}
   if(session.cookie)res.setHeader('Set-Cookie',session.cookie);
   const {user}=session;
   if(modifying&&!auth.validCsrf(req)){crmAnswer(res,403,{ok:false,code:'CSRF_INVALID'});return true;}
   if(path==='/api/manager/session'&&req.method==='GET'){
    crmAnswer(res,200,full(session));return true;
   }
   if(path==='/api/manager/logout'&&req.method==='POST'){crmAnswer(res,200,{ok:true},{'Set-Cookie':auth.logout(req)});return true;}
   if(path==='/api/manager/password'&&req.method==='POST'){
    const data=await crmJson(req);crm.changePassword(user.id,data.currentPassword,data.password);crmAnswer(res,200,{ok:true,loginRequired:true},{'Set-Cookie':auth.logout(req)});return true;
   }
   if(user.must_change_password){crmAnswer(res,403,{ok:false,code:'PASSWORD_CHANGE_REQUIRED'});return true;}
   if(mfa&&path==='/api/manager/security'&&req.method==='GET'){crmAnswer(res,200,{ok:true,mfa:mfa.status(user.id).enabled,recoveryRemaining:mfa.recoveryRemaining(user.id),devices:auth.devices(req,user.id)});return true;}
   if(mfa&&path==='/api/manager/security/revoke-others'&&req.method==='POST'){auth.revokeOthers(req,user.id);crmAnswer(res,200,{ok:true});return true;}
   const device=/^\/api\/manager\/security\/devices\/([a-f\d-]{36})$/.exec(path);
   if(mfa&&device&&req.method==='DELETE'){crm.revokeOwnSession(user.id,device[1]);crmAnswer(res,200,{ok:true});return true;}
   const invite=/^\/api\/manager\/users\/([a-f\d-]{36})\/mfa-invite$/.exec(path);
   if(mfa&&invite&&req.method==='POST'){crm.requirePermission(user.id,'manage_users');if(!user.roles.includes('owner_admin')||invite[1]===user.id)throw Error('FORBIDDEN');const data=await crmJson(req);if(!auth.sensitiveProof(user.id,data.password,String(data.code??'').slice(0,100)))throw Error('INVALID_SECOND_FACTOR');crmAnswer(res,200,{ok:true,...mfa.issueInvite(user.id,invite[1],{reset:data.reset===true})});return true;}
   if(path==='/api/manager/users'){
    if(req.method==='GET'){crmAnswer(res,200,{ok:true,users:crm.users(user.id).map(u=>({...u,...(mfa?{mfa:mfa.status(u.id).enabled}:{})}))});return true;}
    if(req.method==='POST'){crmAnswer(res,201,{ok:true,...crm.createUser(user.id,await crmJson(req))});return true;}
   }
   const staff=/^\/api\/manager\/users\/([a-f\d-]{36})(?:\/(revoke|reset-password))?$/.exec(path);
   if(staff){
    if(req.method==='PATCH'&&!staff[2]){crmAnswer(res,200,{ok:true,user:crm.editUser(user.id,staff[1],await crmJson(req))});return true;}
    if(req.method==='POST'&&staff[2]==='revoke'){crm.revokeSessions(user.id,staff[1]);crmAnswer(res,200,{ok:true});return true;}
    if(req.method==='POST'&&staff[2]==='reset-password'){crmAnswer(res,200,{ok:true,...crm.resetPassword(user.id,staff[1])});return true;}
   }
   if(path==='/api/manager/roles'){
    if(req.method==='GET'){crmAnswer(res,200,{ok:true,roles:crm.roles(user.id),permissions:PERMISSIONS});return true;}
    if(req.method==='POST'){crmAnswer(res,201,{ok:true,role:crm.createRole(user.id,await crmJson(req))});return true;}
   }
   const role=/^\/api\/manager\/roles\/([a-f\d-]{36})$/.exec(path);
   if(role&&req.method==='PATCH'){crmAnswer(res,200,{ok:true,role:crm.editRole(user.id,role[1],await crmJson(req))});return true;}
   if(path==='/api/manager/audit'&&req.method==='GET'){crmAnswer(res,200,{ok:true,events:crm.audit(user.id)});return true;}
   if(path==='/api/manager/leads'&&req.method==='GET'){
    crm.requirePermission(user.id,'view_all_leads');
    const data=store.list({status:url.searchParams.get('status')??'all',q:url.searchParams.get('q')??'',classification:url.searchParams.get('classification')??'real',limit:Number(url.searchParams.get('limit')??30),offset:Number(url.searchParams.get('offset')??0)});
    crmAnswer(res,200,{ok:true,...data,leads:data.leads.map(lead=>({...lead,...crm.classification(lead.id)})),stats:store.stats()});return true;
   }
   const lead=/^\/api\/manager\/leads\/(GB-\d{8}-[A-F0-9]{8})(?:\/(classification|timeline))?$/.exec(path);
   if(lead){
    crm.requirePermission(user.id,'view_all_leads');const id=lead[1];if(!store.get(id))throw Error('NOT_FOUND');
    if(req.method==='GET'&&!lead[2]){crmAnswer(res,200,{ok:true,lead:{...store.detail(id),...crm.classification(id),classification_history:crm.classificationHistory(id),...(insights?{attribution:insights.leadAttribution(id)}:{})}});return true;}
    if(req.method==='PATCH'&&!lead[2]){
     crm.requirePermission(user.id,'edit_leads');if(crm.classification(id).classification==='test')throw Error('TEST_LEAD_READ_ONLY');
     const data=await crmJson(req),updated=store.update(id,{status:data.status,assignee:data.assignee,managerNote:data.managerNote},user.id);crmAnswer(res,200,{ok:true,lead:{...updated,...crm.classification(id),...(insights?{attribution:insights.leadAttribution(id)}:{})}});return true;
    }
    if(req.method==='POST'&&lead[2]==='classification'){crmAnswer(res,200,{ok:true,...crm.classify(user.id,id,await crmJson(req))});return true;}
    if(req.method==='GET'&&lead[2]==='timeline'){crm.requirePermission(user.id,'view_visitor_timeline');crmAnswer(res,200,{ok:true,timeline:insights?insights.leadTimeline(id):[],limited:!insights});return true;}
   }
   if(path==='/api/manager/aggregate-actions'&&req.method==='GET'){crm.requirePermission(user.id,'view_analytics');crmAnswer(res,200,{ok:true,report:aggregate?.enabled?aggregate.report(Object.fromEntries(url.searchParams)):{enabled:false,rows:[],consent:{shown:0,accepted:0,declined:0,choices:0,acceptance_among_choices:null}}});return true;}
   if(insights&&await insights.managerApi(req,res,{user,crm,url}))return true;
   crmAnswer(res,404,{ok:false,code:'NOT_FOUND'});return true;
  }catch(error){
   const code=error.message,invalid=['INVALID_SECOND_FACTOR','MFA_ALREADY_ENABLED','INVALID_TEXT','INVALID_PHONE','INVALID_ROLES','INVALID_ACTIVE','INVALID_ROLE_KEY','INVALID_PERMISSIONS','INVALID_CLASSIFICATION','INVALID_STATUS','INVALID_PAGINATION','WEAK_MANAGER_PASSWORD','INVALID_JSON','BODY_TOO_LARGE','JSON_REQUIRED','TEXT_TOO_LONG','SYSTEM_ROLE_IMMUTABLE','LAST_OWNER_PROTECTED','TEST_LEAD_READ_ONLY','INVALID_CREDENTIALS'];
   const status=code==='FORBIDDEN'?403:code==='NOT_FOUND'?404:invalid.includes(code)||['INVALID_SOURCE','INVALID_REPORT','INVALID_EVENTS','INVALID_DESTINATION'].includes(code)?400:String(error.code).startsWith('ERR_SQLITE')&&String(error.message).includes('UNIQUE')?409:500;
   crmAnswer(res,status,{ok:false,code:status===500?'REQUEST_FAILED':status===409?'ALREADY_EXISTS':code});return true;
  }
 };
}

import {createHmac,timingSafeEqual} from 'node:crypto';
const COOKIE='gb_manager_session';
function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);}
export function createCrmAuth({crm,sessionSecret,cookiePath='/api/manager/',clock=()=>Date.now()}){
 if(!crm||typeof sessionSecret!=='string'||sessionSecret.length<64||!/^\/(?:[a-z0-9-]+\/)*api\/manager\/$/.test(cookiePath))throw Error('INVALID_CRM_AUTH_CONFIG');
 const attempts=new Map();
 const token=req=>String(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)??'';
 const csrf=raw=>createHmac('sha256',sessionSecret).update('csrf:'+raw).digest('base64url');
 const cookie=(raw,maxAge)=>`${COOKIE}=${raw}; Path=${cookiePath}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
 return {
  login(phone,password,ip){
   const key=String(ip??'unknown').slice(0,100),time=clock();
   for(const [k,v] of attempts)if(time-v.at>900000)attempts.delete(k);
   if(attempts.size>5000)return {ok:false,limited:true};
   const count=attempts.get(key)?.count??0;if(count>=5)return {ok:false,limited:true};
   const user=crm.authenticate(phone,password);
   if(!user){attempts.set(key,{at:time,count:count+1});crm.authAudit(null,false);return {ok:false,limited:false};}
   crm.authAudit(user.id,true);
   attempts.delete(key);const session=crm.createSession(user.id);
   return {ok:true,user,csrf:csrf(session.token),cookie:cookie(session.token,28800)};
  },
  session(req){const raw=token(req),user=crm.session(raw);return user?{user,csrf:csrf(raw)}:null;},
  validCsrf(req){const raw=token(req);return Boolean(raw)&&equal(req.headers['x-csrf-token']??'',csrf(raw));},
  logout(req){crm.logout(token(req));return cookie('',0);},
 };
}

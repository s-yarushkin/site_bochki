import {scryptSync,timingSafeEqual,createHmac,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';

const COOKIE='gb_manager_session';
const COOKIE_PATH='/bani-preview/api/manager/';
const EIGHT_HOURS=8*60*60;
function safeEqual(a,b){
  const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));
  return aa.length===bb.length&&timingSafeEqual(aa,bb);
}
export function hashManagerPassword(password,salt=randomBytes(16).toString('hex')){
  if(typeof password!=='string'||password.length<14||password.length>512)throw new Error('WEAK_MANAGER_PASSWORD');
  return 'scrypt$'+salt+'$'+scryptSync(password,salt,64).toString('hex');
}
export function verifyManagerPassword(password,hash){
  if(typeof password!=='string'||password.length>512)return false;
  if(!/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(hash))return false;
  const [,salt,digest]=hash.split('$');
  return safeEqual(scryptSync(password,salt,64).toString('hex'),digest);
}
export function loadManagerConfig(env=process.env,readSecret=readFileSync){
  const dir=env.CREDENTIALS_DIRECTORY;
  if(!dir)throw new Error('MANAGER_CREDENTIALS_MISSING');
  const passwordHash=String(readSecret(dir+'/manager-password-hash','utf8')).trim();
  const sessionSecret=String(readSecret(dir+'/manager-session-secret','utf8')).trim();
  if(!/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(passwordHash))throw new Error('MANAGER_PASSWORD_HASH_INVALID');
  if(!/^[a-f0-9]{64,256}$/.test(sessionSecret))throw new Error('MANAGER_SESSION_SECRET_INVALID');
  return {passwordHash,sessionSecret};
}
export function createManagerAuth({passwordHash,sessionSecret,now=()=>Date.now()}){
  if(!passwordHash||!sessionSecret)throw new Error('MANAGER_AUTH_CONFIG_MISSING');
  const attempts=new Map();
  const sign=payload=>createHmac('sha256',sessionSecret).update(payload).digest('base64url');
  function issue(){
    const body=Buffer.from(JSON.stringify({
      sub:'garant-manager',exp:Math.floor(now()/1000)+EIGHT_HOURS,
      nonce:randomBytes(12).toString('hex')
    })).toString('base64url');
    const token=body+'.'+sign(body);
    return COOKIE+'='+token+'; Path='+COOKIE_PATH+'; Max-Age='+EIGHT_HOURS+'; HttpOnly; Secure; SameSite=Strict';
  }
  function authenticated(req){
    const cookies=String(req.headers.cookie||'').split(';').map(s=>s.trim());
    const raw=cookies.find(s=>s.startsWith(COOKIE+'='));
    if(!raw)return false;
    const token=raw.slice(COOKIE.length+1);
    const parts=token.split('.');
    if(parts.length!==2||parts[0].length>300||parts[1].length>100||!safeEqual(sign(parts[0]),parts[1]))return false;
    try{
      const payload=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
      return payload.sub==='garant-manager'&&Number.isSafeInteger(payload.exp)&&payload.exp>Math.floor(now()/1000);
    }catch{return false;}
  }
  function login(password,ip){
    const key=String(ip||'unknown').slice(0,100),time=now();
    for(const [k,v] of attempts)if(time-v.last>15*60*1000)attempts.delete(k);
    const item=attempts.get(key)||{count:0,last:time};
    if(item.count>=5&&time-item.last<15*60*1000)return {ok:false,limited:true};
    const ok=verifyManagerPassword(password,passwordHash);
    if(ok){attempts.delete(key);return {ok:true,cookie:issue()};}
    attempts.set(key,{count:item.count+1,last:time});
    return {ok:false,limited:false};
  }
  return {
    authenticated,login,
    logoutCookie:()=>COOKIE+'=; Path='+COOKIE_PATH+'; Max-Age=0; HttpOnly; Secure; SameSite=Strict'
  };
}

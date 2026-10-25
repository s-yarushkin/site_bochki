import {scryptSync,timingSafeEqual,createHmac,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';

const COOKIE='gb_manager_session';
const COOKIE_PATH='/bani-preview/api/manager/';
const EIGHT_HOURS=8*60*60;
const MAX_ATTEMPTS=5;
const LOCK_MS=15*60*1000;

function safeEqual(a,b){
  const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));
  return aa.length===bb.length&&timingSafeEqual(aa,bb);
}

export function normalizeManagerPhone(value){
  if(typeof value!=='string'||value.length>45)return null;
  let digits=value.replace(/\D/g,'');
  if(digits.length===10&&digits.startsWith('9'))digits='7'+digits;
  if(digits.length===11&&digits.startsWith('8'))digits='7'+digits.slice(1);
  return /^79\d{9}$/.test(digits)?'+'+digits:null;
}

export function hashManagerPassword(password,salt=randomBytes(16).toString('hex')){
  if(typeof password!=='string'||password.length<14||password.length>512)throw new Error('WEAK_MANAGER_PASSWORD');
  return 'scrypt$'+salt+'$'+scryptSync(password,salt,64).toString('hex');
}

export function verifyManagerPassword(password,hash){
  if(typeof password!=='string'||password.length>512)return false;
  if(typeof hash!=='string'||!/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(hash))return false;
  const [,salt,digest]=hash.split('$');
  return safeEqual(scryptSync(password,salt,64).toString('hex'),digest);
}

function validateAccounts(accounts){
  if(!Array.isArray(accounts)||accounts.length!==2)throw new Error('EXACTLY_TWO_MANAGER_ACCOUNTS_REQUIRED');
  const phones=new Set();
  return accounts.map(account=>{
    if(!account||typeof account!=='object'||Array.isArray(account))throw new Error('INVALID_MANAGER_ACCOUNT');
    const phone=normalizeManagerPhone(account.phone);
    if(!phone||account.phone!==phone||phones.has(phone))throw new Error('INVALID_OR_DUPLICATE_MANAGER_PHONE');
    if(typeof account.hash!=='string'||!/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(account.hash))throw new Error('INVALID_MANAGER_PASSWORD_HASH');
    phones.add(phone);
    return {phone,hash:account.hash};
  });
}

export function loadManagerConfig(env=process.env,readSecret=readFileSync){
  const dir=env.CREDENTIALS_DIRECTORY;
  if(!dir)throw new Error('MANAGER_CREDENTIALS_MISSING');
  const accounts=validateAccounts(JSON.parse(String(readSecret(dir+'/manager-accounts','utf8'))));
  const sessionSecret=String(readSecret(dir+'/manager-session-secret','utf8')).trim();
  if(!/^[a-f0-9]{64,256}$/.test(sessionSecret))throw new Error('MANAGER_SESSION_SECRET_INVALID');
  return {accounts,sessionSecret};
}

export function createManagerAuth({accounts,sessionSecret,now=()=>Date.now()}){
  const verified=validateAccounts(accounts);
  if(typeof sessionSecret!=='string'||!sessionSecret)throw new Error('MANAGER_AUTH_CONFIG_MISSING');
  const byPhone=new Map(verified.map(a=>[a.phone,a]));
  const attempts=new Map();
  const sign=payload=>createHmac('sha256',sessionSecret).update(payload).digest('base64url');

  function issue(phone){
    const body=Buffer.from(JSON.stringify({
      sub:'garant-manager',phone,
      exp:Math.floor(now()/1000)+EIGHT_HOURS,
      nonce:randomBytes(12).toString('hex')
    })).toString('base64url');
    const token=body+'.'+sign(body);
    return COOKIE+'='+token+'; Path='+COOKIE_PATH+'; Max-Age='+EIGHT_HOURS+'; HttpOnly; Secure; SameSite=Strict';
  }

  function session(req){
    const cookies=String(req.headers.cookie||'').split(';').map(s=>s.trim());
    const raw=cookies.find(s=>s.startsWith(COOKIE+'='));
    if(!raw)return null;
    const token=raw.slice(COOKIE.length+1);
    const parts=token.split('.');
    if(parts.length!==2||parts[0].length>300||parts[1].length>100||!safeEqual(sign(parts[0]),parts[1]))return null;
    try{
      const payload=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
      if(payload.sub!=='garant-manager'||!Number.isSafeInteger(payload.exp)||payload.exp<=Math.floor(now()/1000))return null;
      if(!byPhone.has(payload.phone))return null;
      return {phone:payload.phone,role:'manager'};
    }catch{return null;}
  }

  function login(phoneInput,password,ip){
    const phone=normalizeManagerPhone(phoneInput);
    const key=String(ip||'unknown').slice(0,100);
    const time=now();
    for(const [k,v] of attempts)if(time-v.last>LOCK_MS)attempts.delete(k);
    const bucket=attempts.get(key)||{count:0,last:time};
    if(bucket.count>=MAX_ATTEMPTS&&time-bucket.last<LOCK_MS)return {ok:false,limited:true};
    const found=phone?byPhone.get(phone):null;
    const ok=found?verifyManagerPassword(password,found.hash):false;
    if(ok){
      attempts.delete(key);
      return {ok:true,phone,cookie:issue(phone)};
    }
    attempts.set(key,{count:bucket.count+1,last:time});
    return {ok:false,limited:false};
  }
  return {
    session,authenticated:req=>Boolean(session(req)),login,
    logoutCookie:()=>COOKIE+'=; Path='+COOKIE_PATH+'; Max-Age=0; HttpOnly; Secure; SameSite=Strict'
  };
}

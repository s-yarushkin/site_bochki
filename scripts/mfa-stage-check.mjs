// Disposable HTTPS fixture only: no production users, DB or real MAX.
import {totp} from '../api/server/crm-totp.mjs';
const prefix=process.argv[2];if(!/^\/crm-stage-[a-f0-9]{12}$/.test(prefix))throw Error('FIXTURE_PREFIX_REQUIRED');
const origin='https://xn--80aaan1dh9b.xn--p1ai',root=origin+prefix+'/api/manager/';let cookies=new Map(),csrf='';
async function call(path,data,extra={}){const r=await fetch(root+path,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:[...cookies].map(([a,b])=>a+'='+b).join('; '),'X-CSRF-Token':csrf,...extra},...(data?{body:JSON.stringify(data)}:{})});for(const c of r.headers.getSetCookie()){if(!c.includes('Secure')||!c.includes('Path='+prefix+'/api/manager/'))throw Error('FIXTURE_COOKIE_SCOPE');const [name,value]=c.split(';')[0].split('=');cookies.set(name,value);}return {status:r.status,body:await r.json()};}
const meta=JSON.parse(await new Promise((resolve,reject)=>{let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>resolve(s));process.stdin.on('error',reject);}));
const check=(condition,label)=>{if(!condition)throw Error(label);};
let r=await call('login',{phone:meta.owner,password:meta.password,remember:true});check(r.status===200&&r.body.pending,'PENDING_REQUIRED');csrf=r.body.csrf;check((await call('leads')).status===401,'NO_PREAUTH_ACCESS');
check((await call('mfa/setup',{activationCode:meta.activations[meta.owner]},{Origin:'https://foreign.invalid'})).status===403,'ORIGIN_REQUIRED');
r=await call('mfa/setup',{activationCode:meta.activations[meta.owner]});check(r.status===200&&r.body.qr.startsWith('<svg'),'LOCAL_QR_REQUIRED');const seed=r.body.secret;
r=await call('mfa/verify',{code:totp(seed,Date.now())});check(r.status===200&&r.body.recoveryCodes.length===8,'FACTOR_REQUIRED');csrf=r.body.csrf;
check((await call('session')).body.security.remember,'PERSISTENT_SESSION');check((await call('security')).body.devices.length===1,'DEVICES');check((await call('users')).status===200,'OWNER_ACCESS');check((await call('logout',{})).status===200,'LOGOUT');check((await call('session')).status===401,'REVOCATION');
console.log(JSON.stringify({ok:true,https_pass:true,fixture_only:true,real_max_messages:0,checks:['pending','origin','local_qr','totp','backup_codes','remembered_cookie','devices','owner','logout']}));

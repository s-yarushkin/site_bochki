import {createHmac,randomBytes,timingSafeEqual,createCipheriv,createDecipheriv,hkdfSync} from 'node:crypto';
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes){let value=0,bits=0,out='';for(const b of bytes){value=(value<<8)|b;bits+=8;while(bits>=5){out+=ALPHABET[(value>>>(bits-5))&31];bits-=5;}}if(bits)out+=ALPHABET[(value<<(5-bits))&31];return out;}
export function decode32(text){let value=0,bits=0,out=[];if(typeof text!=='string'||!/^[A-Z2-7]{16,128}$/.test(text))throw Error('INVALID_TOTP_SECRET');for(const c of text){value=(value<<5)|ALPHABET.indexOf(c);bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
export function totp(secret,timeMs,{digits=6,algorithm='sha1'}={}){
 if(![6,8].includes(digits)||!['sha1','sha256','sha512'].includes(algorithm)||!Number.isFinite(timeMs)||timeMs<0)throw Error('INVALID_TOTP_PARAMETERS');
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(timeMs/30000)));const digest=createHmac(algorithm,decode32(secret)).update(counter).digest(),offset=digest.at(-1)&15;return String((digest.readUInt32BE(offset)&0x7fffffff)%10**digits).padStart(digits,'0');
}
export function equalSecret(a,b){const left=Buffer.from(String(a)),right=Buffer.from(String(b));return left.length===right.length&&timingSafeEqual(left,right);}
export function matchingCounter(secret,code,timeMs,lastCounter=-1){if(typeof code!=='string'||!/^\d{6}$/.test(code))return null;const current=Math.floor(timeMs/30000);for(const offset of [0,-1,1]){const counter=current+offset;if(counter>=0&&counter>lastCounter&&equalSecret(totp(secret,counter*30000),code))return counter;}return null;}
export function mfaCrypto(master){
 if(typeof master!=='string'||!/^[a-f\d]{64,256}$/i.test(master))throw Error('MFA_KEY_REQUIRED');
 const key=Buffer.from(hkdfSync('sha256',Buffer.from(master,'hex'),Buffer.from('dachapar-mfa-v1'),Buffer.from('secret-encryption'),32));
 const pepper=Buffer.from(hkdfSync('sha256',Buffer.from(master,'hex'),Buffer.from('dachapar-mfa-v1'),Buffer.from('token-digests'),32));
 return {
  digest(namespace,value){return createHmac('sha256',pepper).update(namespace+'\0'+String(value)).digest('hex');},
  seal(userId,purpose,secret){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(userId+'|'+purpose));const data=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),data].map(b=>b.toString('base64url')).join('.');},
  open(userId,purpose,envelope){const parts=String(envelope).split('.');if(parts.length!==3)throw Error('INVALID_MFA_ENVELOPE');const [iv,tag,data]=parts.map(p=>Buffer.from(p,'base64url'));if(iv.length!==12||tag.length!==16)throw Error('INVALID_MFA_ENVELOPE');const cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(userId+'|'+purpose));cipher.setAuthTag(tag);return Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8');},
 };
}
export const newTotpSecret=()=>base32(randomBytes(20));
export const newRecoveryCode=()=>base32(randomBytes(10)).match(/.{4}/g).join('-');
export const normalizeRecoveryCode=value=>typeof value==='string'?value.toUpperCase().replace(/[ -]/g,''):'';

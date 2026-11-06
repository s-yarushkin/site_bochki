import {DatabaseSync} from 'node:sqlite';import {randomBytes} from 'node:crypto';
import {mfaCrypto,newTotpSecret,newRecoveryCode,normalizeRecoveryCode,matchingCounter} from './crm-totp.mjs';
export function openCrmMfa(path,{secret,now=()=>new Date().toISOString()}={}){
 const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');const crypto=mfaCrypto(secret),timeMs=()=>Date.parse(now());
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
 const audit=(id,action,details={})=>db.prepare("INSERT INTO audit_log(actor_id,action,object_type,object_id,before_json,after_json,at) VALUES(?,?,'security',?,'null',?,?)").run(id,action,id,JSON.stringify(details),now());
 function migrate(){return tx(()=>db.exec(`
 CREATE TABLE IF NOT EXISTS staff_mfa(user_id TEXT PRIMARY KEY REFERENCES staff_users(id),enabled INTEGER NOT NULL DEFAULT 0,secret_cipher TEXT,generation INTEGER NOT NULL DEFAULT 1,last_counter INTEGER NOT NULL DEFAULT -1,enabled_at TEXT);
 CREATE TABLE IF NOT EXISTS staff_mfa_invites(user_id TEXT PRIMARY KEY REFERENCES staff_users(id),token_hash TEXT UNIQUE NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS staff_mfa_challenges(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES staff_users(id),expires_at TEXT NOT NULL,created_at TEXT NOT NULL,generation INTEGER NOT NULL,remember INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,pending_cipher TEXT,invitation_hash TEXT);
 CREATE INDEX IF NOT EXISTS mfa_challenge_user ON staff_mfa_challenges(user_id,created_at);
 CREATE TABLE IF NOT EXISTS staff_mfa_recovery(user_id TEXT NOT NULL REFERENCES staff_users(id),code_hash TEXT NOT NULL,used_at TEXT,PRIMARY KEY(user_id,code_hash));
 CREATE TABLE IF NOT EXISTS staff_auth_throttle(bucket TEXT PRIMARY KEY,failures INTEGER NOT NULL,window_started TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS staff_auth_throttle_age ON staff_auth_throttle(window_started);
 `));}
 function status(id){const row=db.prepare('SELECT enabled,generation,enabled_at FROM staff_mfa WHERE user_id=?').get(id);return {enabled:Boolean(row?.enabled),generation:row?.generation??1,enabled_at:row?.enabled_at??null};}
 function active(id){return Boolean(db.prepare('SELECT 1 FROM staff_users WHERE id=? AND active=1').get(id));}
 const bucket=(kind,value)=>crypto.digest('throttle:'+kind,value);
 function blocked(keys,limit){return keys.some(key=>{const r=db.prepare('SELECT * FROM staff_auth_throttle WHERE bucket=?').get(key);return r&&timeMs()-Date.parse(r.window_started)<900000&&r.failures>=limit;});}
 function failed(keys){db.prepare('DELETE FROM staff_auth_throttle WHERE window_started<?').run(new Date(timeMs()-86400000).toISOString());for(const key of keys)db.prepare(`INSERT INTO staff_auth_throttle VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET failures=CASE WHEN window_started>? THEN failures+1 ELSE 1 END,window_started=CASE WHEN window_started>? THEN window_started ELSE excluded.window_started END`).run(key,now(),new Date(timeMs()-900000).toISOString(),new Date(timeMs()-900000).toISOString());}
 function issueInvite(actor,id,{reset=false}={}){return tx(()=>{
  if(!active(id))throw Error('NOT_FOUND');const current=status(id);if(current.enabled&&!reset)throw Error('MFA_ALREADY_ENABLED');
  db.prepare('INSERT OR IGNORE INTO staff_mfa(user_id) VALUES(?)').run(id);
  if(reset){db.prepare('UPDATE staff_mfa SET enabled=0,secret_cipher=NULL,generation=generation+1,last_counter=-1,enabled_at=NULL WHERE user_id=?').run(id);db.prepare('DELETE FROM staff_mfa_recovery WHERE user_id=?').run(id);}
  const code=normalizeRecoveryCode(newRecoveryCode()+newRecoveryCode()).slice(0,24).match(/.{4}/g).join('-');const expires=new Date(timeMs()+7*86400000).toISOString();
  db.prepare('INSERT INTO staff_mfa_invites VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,created_at=excluded.created_at,created_by=excluded.created_by').run(id,crypto.digest('invite:'+id,normalizeRecoveryCode(code)),expires,now(),actor);
  db.prepare('UPDATE staff_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(now(),id);db.prepare('DELETE FROM staff_mfa_challenges WHERE user_id=?').run(id);audit(actor,reset?'mfa_admin_reset':'mfa_invite_created',{target_id:id,expires_at:expires});return {activationCode:code,expires_at:expires};
 });}
 function challenge(raw){if(typeof raw!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(raw))return null;const row=db.prepare('SELECT * FROM staff_mfa_challenges WHERE token_hash=? AND expires_at>? AND attempts<5').get(crypto.digest('challenge',raw),now());return row&&active(row.user_id)&&row.generation===status(row.user_id).generation?row:null;}
 function begin(id,remember){return tx(()=>{if(!active(id))throw Error('FORBIDDEN');db.prepare('DELETE FROM staff_mfa_challenges WHERE expires_at<=?').run(now());if(db.prepare('SELECT count(*) n FROM staff_mfa_challenges WHERE user_id=?').get(id).n>=10)return {ok:false,limited:true};db.prepare('INSERT OR IGNORE INTO staff_mfa(user_id) VALUES(?)').run(id);const raw=randomBytes(32).toString('base64url'),current=status(id),expires=new Date(timeMs()+300000).toISOString();db.prepare('INSERT INTO staff_mfa_challenges(token_hash,user_id,expires_at,created_at,generation,remember) VALUES(?,?,?,?,?,?)').run(crypto.digest('challenge',raw),id,expires,now(),current.generation,remember?1:0);return {ok:true,raw,stage:current.enabled?'verify':'enroll',expires_at:expires};});}
 function reject(row,action){db.prepare('UPDATE staff_mfa_challenges SET attempts=attempts+1 WHERE token_hash=?').run(row.token_hash);failed([bucket('mfa',row.user_id)]);audit(row.user_id,action);return {ok:false,limited:blocked([bucket('mfa',row.user_id)],5),code:'INVALID_SECOND_FACTOR'};}
 function setup(raw,activationCode){return tx(()=>{
  const row=challenge(raw);if(!row)return {ok:false,expired:true};if(blocked([bucket('mfa',row.user_id)],5))return {ok:false,limited:true};if(status(row.user_id).enabled)return {ok:false,code:'MFA_ALREADY_ENABLED'};
  const invite=db.prepare('SELECT token_hash FROM staff_mfa_invites WHERE user_id=? AND expires_at>? AND token_hash=?').get(row.user_id,now(),crypto.digest('invite:'+row.user_id,normalizeRecoveryCode(activationCode)));
  if(!invite)return reject(row,'mfa_setup_failed');const secret=newTotpSecret();db.prepare('UPDATE staff_mfa_challenges SET pending_cipher=?,invitation_hash=? WHERE token_hash=?').run(crypto.seal(row.user_id,row.token_hash,secret),invite.token_hash,row.token_hash);return {ok:true,secret,user_id:row.user_id};
 });}
 function verifyCode(id,code){const current=db.prepare('SELECT * FROM staff_mfa WHERE user_id=? AND enabled=1').get(id);if(!current)return false;
  const secret=crypto.open(id,'active',current.secret_cipher),counter=matchingCounter(secret,code,timeMs(),current.last_counter);
  if(counter!==null){db.prepare('UPDATE staff_mfa SET last_counter=? WHERE user_id=?').run(counter,id);return {generation:current.generation,recovery:false};}
  const normalized=normalizeRecoveryCode(code);if(!/^[A-Z2-7]{16}$/.test(normalized))return false;const changed=db.prepare('UPDATE staff_mfa_recovery SET used_at=? WHERE user_id=? AND code_hash=? AND used_at IS NULL').run(now(),id,crypto.digest('recovery:'+id,normalized));return changed.changes?{generation:current.generation,recovery:true}:false;
 }
 function finish(raw,code){return tx(()=>{
  const row=challenge(raw);if(!row)return {ok:false,expired:true};if(blocked([bucket('mfa',row.user_id)],5))return {ok:false,limited:true};let proof,recoveryCodes;
  if(status(row.user_id).enabled)proof=verifyCode(row.user_id,code);
  else if(row.pending_cipher&&row.invitation_hash){const invite=db.prepare('SELECT 1 FROM staff_mfa_invites WHERE user_id=? AND token_hash=? AND expires_at>?').get(row.user_id,row.invitation_hash,now());if(!invite)return reject(row,'mfa_setup_failed');const secret=crypto.open(row.user_id,row.token_hash,row.pending_cipher),counter=matchingCounter(secret,code,timeMs());if(counter!==null){db.prepare('UPDATE staff_mfa SET enabled=1,secret_cipher=?,generation=generation+1,last_counter=?,enabled_at=? WHERE user_id=?').run(crypto.seal(row.user_id,'active',secret),counter,now(),row.user_id);db.prepare('DELETE FROM staff_mfa_invites WHERE user_id=?').run(row.user_id);db.prepare('DELETE FROM staff_mfa_recovery WHERE user_id=?').run(row.user_id);recoveryCodes=Array.from({length:8},newRecoveryCode);for(const value of recoveryCodes)db.prepare('INSERT INTO staff_mfa_recovery(user_id,code_hash) VALUES(?,?)').run(row.user_id,crypto.digest('recovery:'+row.user_id,normalizeRecoveryCode(value)));proof={generation:status(row.user_id).generation,recovery:false};audit(row.user_id,'mfa_enabled');}}
  if(!proof)return reject(row,'mfa_verify_failed');db.prepare('DELETE FROM staff_mfa_challenges WHERE user_id=?').run(row.user_id);db.prepare('DELETE FROM staff_auth_throttle WHERE bucket=?').run(bucket('mfa',row.user_id));audit(row.user_id,proof.recovery?'mfa_recovery_used':'mfa_verified');return {ok:true,user_id:row.user_id,generation:proof.generation,remember:Boolean(row.remember),verified_at:now(),...(recoveryCodes?{recoveryCodes}:{})};
 });}
 return {migrate,status,issueInvite,begin,setup,finish,challenge,
  ready(){return ['staff_mfa','staff_mfa_invites','staff_mfa_challenges','staff_mfa_recovery','staff_auth_throttle'].every(name=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)))&&['id','remember','mfa_generation','mfa_verified_at','last_seen_at','absolute_expires_at','browser_label'].every(name=>db.prepare('PRAGMA table_info(staff_sessions)').all().some(r=>r.name===name));},
  passwordAllowed(principal,ip){return !blocked([bucket('account',principal)],5)&&!blocked([bucket('ip',ip)],10);},
  passwordFailed(principal,ip){return tx(()=>failed([bucket('account',principal),bucket('ip',ip)]));},
  passwordSucceeded(principal,ip){db.prepare('DELETE FROM staff_auth_throttle WHERE bucket IN (?,?)').run(bucket('account',principal),bucket('ip',ip));},
  sensitiveProof(id,code,passwordValid=true){return tx(()=>{if(blocked([bucket('mfa',id)],5))return false;const proof=passwordValid&&verifyCode(id,code);if(!proof){failed([bucket('mfa',id)]);audit(id,'mfa_step_up_failed');return false;}audit(id,'mfa_step_up_verified');return true;});},
  recoveryRemaining(id){return db.prepare('SELECT count(*) n FROM staff_mfa_recovery WHERE user_id=? AND used_at IS NULL').get(id).n;},
  cancel(raw){if(typeof raw==='string')db.prepare('DELETE FROM staff_mfa_challenges WHERE token_hash=?').run(crypto.digest('challenge',raw));},
  close(){db.close();},
 };
}

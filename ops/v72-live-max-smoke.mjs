// Sends ONE clearly labeled diagnostic MAX message using the active relay config.
// Lead intake runs on ephemeral localhost HTTP with SQLite :memory: only.
import {createServer,request} from 'node:http';
import {readFileSync,realpathSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {join} from 'node:path';
const ORIGIN='https://xn--80aaan1dh9b.xn--p1ai';
const RUNTIME='/srv/services/garant-bani-relay/releases/20261015-56bf8a1a82d2-v72';
// Both values are derived from the same accepted Git blob. Git archive applies
// core.autocrlf=true on Windows; no arbitrary source normalization is allowed.
const RELAY_HASHES=new Map([
 ['f353c358691e341a6a921cb0bccd681d8a97c63b24a2fb10acce06ff9246a8f0','LF'],
 ['74270a0c4fa6ed599421561d11b927741da9acc3d3fe325fb87635d075ac33bf','CRLF']
]);
export function verifyRelayBytes(bytes){
 const hash=createHash('sha256').update(bytes).digest('hex');
 const lineEndings=RELAY_HASHES.get(hash);
 if(!lineEndings)throw Error('ACTIVE_RELAY_HASH_CHANGED actual='+hash);
 return {hash,lineEndings};
}
const ensure=(value,code)=>{if(!value)throw Error(code);};
function post(port,payload){return new Promise((resolve,reject)=>{
 const req=request({hostname:'127.0.0.1',port,path:'/api/lead',method:'POST',headers:{host:new URL(ORIGIN).host,origin:ORIGIN,'content-type':'application/json'}},res=>{
  let text='';res.on('data',part=>text+=part);res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(text)});}catch{reject(Error('SMOKE_RESPONSE_INVALID'));}});
 });req.on('error',reject);req.end(JSON.stringify(payload));
});}
export async function runSmoke({runtimeDirectory,env,fetchImpl=fetch}){
 const {loadRelayConfig,createRelayHandler,deliverBaniLead}=await import(pathToFileURL(join(runtimeDirectory,'server/garant-bani-relay.mjs')).href);
 const {openLeadStore}=await import(pathToFileURL(join(runtimeDirectory,'server/lead-store.mjs')).href);
 const config=loadRelayConfig(env);
 ensure(config.sites.some(site=>site.origin===ORIGIN&&site.basePath==='/'),'NEW_ORIGIN_NOT_ACTIVE');
 const store=openLeadStore(':memory:');
 const testId=randomUUID();let messages=0;
 const diagnosticFetch=async(url,options)=>{
  ensure(messages===0,'SECOND_MAX_MESSAGE_FORBIDDEN');
  ensure(url.origin==='https://platform-api2.max.ru'&&url.pathname==='/messages','UNEXPECTED_MAX_DESTINATION');
  const body=JSON.parse(options.body);
  ensure(body.text.includes('НОВАЯ ЗАЯВКА — ДАЧА ПАР')&&body.text.includes('Номер: GB-'),'REAL_FORMATTER_NOT_USED');
  body.text='[ТЕХНИЧЕСКИЙ ТЕСТ «ДАЧА ПАР»]\nЭто проверка доставки, не обращение клиента.\nID проверки: '+testId+'\nРабочая база заявок не использовалась.\nПроверка: callback → изолированная SQLite → MAX.\nНичего обрабатывать не нужно.';
  body.notify=false;messages++;
  return fetchImpl(url,{...options,body:JSON.stringify(body)});
 };
 const handler=createRelayHandler({config,store,log:()=>{},deliver:(lead,c,unused,meta)=>deliverBaniLead(lead,c,diagnosticFetch,meta)});
 const server=createServer(handler);
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const payload={requestId:testId,flow:'callback',name:'Изолированная техническая проверка',phone:'+79991112233',consent:true,consentVersion:'2026-10-14',comment:'Не клиентская заявка; SQLite :memory:'};
  const first=await post(server.address().port,payload);
  ensure(first.status===200&&first.body.delivered===true,'MAX_DELIVERY_NOT_CONFIRMED_HTTP_'+first.status);
  ensure(store.stats().total===1,'ISOLATED_STORAGE_FAILED');
  ensure(store.detail(first.body.leadId).notificationStatus==='delivered','ISOLATED_DELIVERY_STATUS_FAILED');
  const repeat=await post(server.address().port,payload);
  ensure(repeat.status===200&&repeat.body.duplicate===true&&messages===1,'IDEMPOTENCY_FAILED');
  return {testId,maxApiAccepted:true,isolatedStorage:true,messages,productionLeadCreated:false,managerReceiptConfirmed:false};
 }finally{
  if(server.listening)await new Promise(resolve=>server.close(resolve));
  store.close();
 }
}
async function main(){
 ensure(process.getuid?.()===0,'ROOT_REQUIRED_FOR_EXISTING_CREDENTIALS');
 const active=realpathSync('/srv/services/garant-bani-relay/current');
 ensure(active===RUNTIME,'ACTIVE_RUNTIME_CHANGED_REVIEW_REQUIRED');
 const pid=execFileSync('systemctl',['show','garant-bani-relay.service','-p','MainPID','--value'],{encoding:'utf8'}).trim();
 ensure(/^[1-9]\d*$/.test(pid),'RELAY_NOT_RUNNING');
 ensure(realpathSync('/proc/'+pid+'/cwd')===active,'RUNNING_RUNTIME_MISMATCH');
 const env=Object.fromEntries(readFileSync('/proc/'+pid+'/environ','utf8').split('\0').filter(Boolean).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
 ensure(!env.NODE_EXTRA_CA_CERTS||env.NODE_EXTRA_CA_CERTS===process.env.NODE_EXTRA_CA_CERTS,'CA_CONFIGURATION_MISMATCH');
 const source=verifyRelayBytes(readFileSync(join(active,'server/garant-bani-relay.mjs')));
 console.log('ACTIVE_RELAY_SOURCE=PASS; lineEndings='+source.lineEndings+'; sha256='+source.hash);
 const result=await runSmoke({runtimeDirectory:active,env});
 console.log('LIVE_MAX_SMOKE='+JSON.stringify(result));
 console.log('MAX_API_ACCEPTED=PASS; PRODUCTION_SQLITE_WRITES=0; MANAGER_RECEIPT=NOT_VERIFIED');
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{console.error('LIVE_MAX_SMOKE=FAIL; reason='+error.message+'; do not rerun blindly because one diagnostic message may have been accepted');process.exitCode=1;});
}

import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const bundle=new URL('../../output/bath-choice-review-v6/',import.meta.url);
const server=spawn(process.execPath,[fileURLToPath(new URL('preview.mjs',bundle))],{env:{...process.env,BATH_CHOICE_PREVIEW_PORT:'4193'},windowsHide:true,stdio:['ignore','pipe','pipe']});
try{
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('SERVER_START_TIMEOUT')),10000);
  server.once('error',reject);server.once('exit',code=>reject(Error('SERVER_EXIT_'+code)));
  server.stdout.once('data',()=>{clearTimeout(timer);resolve();});
 });
 const origin='http://127.0.0.1:4193';
 const manifest=JSON.parse(await fs.readFile(new URL('site-manifest.json',bundle)));
 for(const file of manifest.files){
  const response=await fetch(origin+'/'+file.path);
  if(!response.ok)throw Error('MISSING_ASSET '+file.path);
  const hash=createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  if(hash!==file.sha256)throw Error('HASH_MISMATCH '+file.path);
 }
 const settings=await (await fetch(origin+'/data/site-settings.json')).json();
 if(settings.analytics.enabled!==false||settings.origin!==origin||settings.lead.allowedOrigins.join()!==origin)throw Error('PREVIEW_SETTINGS');
 for(const [url,method] of [['/api/lead','POST'],['/api/health','GET'],['/','POST']]){
  const response=await fetch(origin+url,{method});
  if(response.status!==405)throw Error('API_NOT_BLOCKED '+url);
 }
 console.log(JSON.stringify({assetHashes:'PASS',assets:manifest.files.length,analyticsDisabled:'PASS',postAndApiBlocked:'PASS',published:false}));
}finally{server.kill();}

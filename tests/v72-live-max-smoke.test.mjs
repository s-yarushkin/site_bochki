import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runSmoke} from '../ops/v72-live-max-smoke.mjs';
const runtimeDirectory=fileURLToPath(new URL('../',import.meta.url));
async function isolated(run){
 const temp=mkdtempSync(join(tmpdir(),'max-smoke-secret-'));
 const token=join(temp,'token');writeFileSync(token,'test-token-not-real');
 try{return await run({ALLOWED_ORIGIN:'https://xn----7sbbigeqcfm8bq.xn--p1ai',ADDITIONAL_SITES_JSON:'[{"origin":"https://xn--80aaan1dh9b.xn--p1ai","basePath":"/"}]',MAX_CHAT_ID:'-123',MAX_TOKEN_FILE:token,LEADS_DB_PATH:'/forbidden/production.sqlite'});}
 finally{rmSync(temp,{recursive:true,force:true});}
}
test('live smoke uses isolated store, masks synthetic contact, sends one diagnostic and verifies duplicate',()=>isolated(async env=>{
 const sent=[];
 const result=await runSmoke({runtimeDirectory,env,fetchImpl:async(url,options)=>{
  sent.push(JSON.parse(options.body));return {ok:true,json:async()=>({message:{}})};
 }});
 assert.equal(result.messages,1);assert.equal(result.productionLeadCreated,false);
 assert.equal(result.managerReceiptConfirmed,false);assert.equal(sent.length,1);
 assert.match(sent[0].text,/ТЕХНИЧЕСКИЙ ТЕСТ/);assert.match(sent[0].text,/не обращение клиента/);
 assert.ok(!sent[0].text.includes('+7999'));assert.equal(sent[0].notify,false);
}));
test('live smoke never reports accepted delivery on a failed MAX response',()=>isolated(async env=>{
 await assert.rejects(runSmoke({runtimeDirectory,env,fetchImpl:async()=>({ok:false,json:async()=>({})})}),/MAX_DELIVERY_NOT_CONFIRMED_HTTP_502/);
}));

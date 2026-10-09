import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRelayHandler,loadRelayConfig,validateBaniLead,formatBaniLead,deliverBaniLead} from '../server/garant-bani-relay.mjs';

const origin='https://xn----7sbbigeqcfm8bq.xn--p1ai';
const config={host:'127.0.0.1',port:3301,allowedOrigin:origin,chatId:'-79890208563249',token:'test-token-value'};
const callback={flow:'callback',name:'Анна',phone:'+7 999 111-22-33',comment:'Перезвоните завтра',consent:true};
const quote={flow:'quote',name:'Анна',phone:'+7 999 111-22-33',district:'Вологодский район',base:'unknown',access:'yes',comment:'',consent:true,configuration:{modelId:'kvadro-house',sizeId:'500',optionIds:[],bundleId:null}};
function post(url,data,headers={}) {
  return fetch(url+'/api/lead',{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(data)});
}
async function withRelay(handler,fn) {
  const server=createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await fn('http://127.0.0.1:'+server.address().port);}
  finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
}
test('validates callback contact and explicit personal-data consent',()=>{
  const value=validateBaniLead(callback);
  assert.equal(value.phone,'+79991112233');
  assert.equal(value.flow,'callback');
  assert.throws(()=>validateBaniLead({...callback,consent:false}),/CONSENT/);
  assert.throws(()=>validateBaniLead({...callback,website:'spam'}),/SPAM/);
  assert.throws(()=>validateBaniLead({...callback,phone:'112'}),/PHONE/);
  assert.throws(()=>validateBaniLead({...callback,comment:'x'.repeat(501)}),/LONG|FIELD/);
});
test('callback is strictly phone-only; quote channels need only a mobile number',()=>{
  const callbackLead=validateBaniLead({...callback,contactChannel:'phone'});
  assert.equal(callbackLead.contactChannel,'phone');
  assert.match(formatBaniLead(callbackLead),/Связаться: Телефонный звонок по номеру телефона/);
  for(const channel of ['telegram','max','whatsapp']){
    const request={...quote,contactChannel:channel};
    const lead=validateBaniLead(request);
    assert.equal(lead.phone,'+79991112233');
    assert.equal(lead.contactChannel,channel);
    assert.equal(lead.contactAccount,'');
    assert.match(formatBaniLead(lead),new RegExp('Связаться: '+({telegram:'Telegram',max:'MAX',whatsapp:'WhatsApp'}[channel])+' по номеру телефона'));
  }
  assert.throws(()=>validateBaniLead({...callback,contactChannel:'whatsapp'}),/CALLBACK_MUST_BE_PHONE/);
  assert.throws(()=>validateBaniLead({...callback,contactChannel:'max'}),/CALLBACK_MUST_BE_PHONE/);
  assert.throws(()=>validateBaniLead({...quote,contactChannel:'fax'}),/INVALID_CONTACT_CHANNEL/);
  assert.throws(()=>validateBaniLead({...quote,phone:'12345'}),/INVALID_PHONE/);
  assert.throws(()=>validateBaniLead({...quote,phone:'+7 000 123-45-67'}),/INVALID_PHONE/);
  assert.equal(validateBaniLead({...quote,phone:'8 (999) 111-22-33'}).phone,'+79991112233');
});
test('legacy clients with messenger profile continue to work during rolling deploy',()=>{
  const lead=validateBaniLead({...quote,contactChannel:'max',contactAccount:'https://max.ru/id1234567'});
  assert.match(formatBaniLead(lead),/Контакт в мессенджере/);
  assert.throws(()=>validateBaniLead({...quote,contactChannel:'phone',contactAccount:'@legacy'}),/UNEXPECTED_CONTACT_ACCOUNT/);
});
test('quotes recompute trusted demo pricing on server; unsupported catalog rejected',()=>{
  const value=validateBaniLead(quote);
  assert.ok(value.estimate.total>0);
  assert.match(formatBaniLead(value),/цена не подтверждена/i);
  assert.match(formatBaniLead(value),/Вологодский район/);
  assert.throws(()=>validateBaniLead({...quote,configuration:{...quote.configuration,modelId:'injected'}}),/UNKNOWN_MODEL/);
  assert.throws(()=>validateBaniLead({...quote,district:''}),/DISTRICT/);
});
test('multi-option real quote includes every add-on and server-calculated price',()=>{
  const selection={...quote,contactChannel:'whatsapp',
    configuration:{modelId:'kvadro-house',sizeId:'500',
      optionIds:['aspen','water-piping','steam-led','porch','window'],bundleId:null}};
  const lead=validateBaniLead(selection);
  assert.equal(lead.estimate.options.length,5);
  assert.equal(lead.estimate.modelId,'kvadro-house');
  assert.equal(lead.contactChannel,'whatsapp');
  assert.ok(lead.estimate.total>lead.estimate.basePrice);
  const message=formatBaniLead(lead);
  for(const name of lead.estimate.options.map(x=>x.name))assert.ok(message.includes(name),name);
  assert.match(message,/Связаться: WhatsApp по номеру телефона/);
  assert.doesNotMatch(message,/Контакт в мессенджере/);
  assert.match(message,/цена не подтверждена/);
});
test('reads MAX token only from protected credentials path',()=>{
  const cfg=loadRelayConfig({HOST:'127.0.0.1',PORT:'3301',ALLOWED_ORIGIN:origin,MAX_CHAT_ID:'-79890208563249',CREDENTIALS_DIRECTORY:'/run/credentials/unit'},(path)=>{
    assert.equal(path,'/run/credentials/unit/max-token');return 'test-token-value';
  });
  assert.equal(cfg.chatId,'-79890208563249');
  assert.throws(()=>loadRelayConfig({HOST:'0.0.0.0',ALLOWED_ORIGIN:origin,MAX_CHAT_ID:'-1',MAX_TOKEN_FILE:'/tmp/x'},()=> 'test-token-value'),/UNSAFE_BIND/);
  assert.throws(()=>loadRelayConfig({HOST:'127.0.0.1',ALLOWED_ORIGIN:'https://evil.example',MAX_CHAT_ID:'-1',MAX_TOKEN_FILE:'/tmp/x'},()=> 'test-token-value'),/UNSAFE_ORIGIN/);
});
test('MAX API uses correct bot Authorization header and group id',async()=>{
  let request;
  await deliverBaniLead(validateBaniLead(callback),config,async(url,opts)=>{
    request={url:String(url),opts};
    return new Response(JSON.stringify({message:{}}),{status:200});
  });
  assert.equal(request.url,'https://platform-api2.max.ru/messages?chat_id=-79890208563249&disable_link_preview=true');
  assert.equal(request.opts.headers.Authorization,'test-token-value');
  assert.equal(JSON.parse(request.opts.body).notify,true);
  await assert.rejects(()=>deliverBaniLead(validateBaniLead(callback),config,async()=>new Response('{}',{status:200})),/MAX_DELIVERY_FAILED/);
});
test('relay delivers one approved POST, de-duplicates rapid retries, has safe health',async()=>{
  let messages=0;const logs=[];
  await withRelay(createRelayHandler({config,deliver:async()=>{messages++;},log:x=>logs.push(x)}),async url=>{
    const health=await fetch(url+'/health');
    assert.deepEqual(await health.json(),{ok:true});
    const first=await post(url,callback);
    assert.equal(first.status,200);
    assert.deepEqual(await first.json(),{ok:true,delivered:true});
    const again=await post(url,callback);
    assert.equal(again.status,200);
    assert.deepEqual(await again.json(),{ok:true,delivered:true,duplicate:true});
    assert.equal(messages,1);
    assert.equal(logs.length,1);
    assert.doesNotMatch(logs.join(' '),/Анна|1112233|token-value/);
  });
});
test('relay blocks different origins, other methods, oversize and repeated bursts',async()=>{
  let deliveries=0;
  await withRelay(createRelayHandler({config,deliver:async()=>{deliveries++;},log:()=>{}}),async url=>{
    const evil=await post(url,callback,{origin:'https://evil.example'});
    assert.equal(evil.status,403);
    const get=await fetch(url+'/api/lead');
    assert.equal(get.status,405);
    const huge=await fetch(url+'/api/lead',{method:'POST',headers:{origin,'content-type':'application/json'},body:'x'.repeat(9000)});
    assert.equal(huge.status,413);
    for(let i=0;i<4;i++){const response=await post(url,{...callback,comment:String(i)});assert.equal(response.status,200);}
    const limited=await post(url,{...callback,comment:'limit'});
    assert.equal(limited.status,429);
    assert.equal(deliveries,4);
  });
});
test('MAX rejection is never reported as customer success',async()=>{
  await withRelay(createRelayHandler({config,deliver:async()=>{throw new Error('token: private; phone: +7999');},log:()=>{}}),async url=>{
    const response=await post(url,quote);
    assert.equal(response.status,502);
    const body=await response.text();
    assert.equal(body,'{"ok":false,"code":"DELIVERY_UNAVAILABLE"}');
    assert.doesNotMatch(body,/private|7999/);
  });
});

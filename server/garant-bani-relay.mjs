import {createServer} from 'node:http';
import {readFileSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {openLeadStore} from './lead-store.mjs';
import {createManagerAuth,loadManagerConfig} from './manager-auth.mjs';
import {createManagerApi} from './manager-api.mjs';
import {calculateQuote,formatMoney} from '../assets/js/quote-engine.js';

const MAX_ORIGIN = 'https://platform-api2.max.ru';
const allowedBases = new Set(['unknown','ready','advice']);
const allowedAccess = new Set(['unknown','yes','advice']);
const allowedChannels = new Set(['phone','telegram','max','whatsapp']);
const channelNames = {phone:'Телефонный звонок',telegram:'Telegram',max:'MAX',whatsapp:'WhatsApp'};
const bases = {unknown:'Нужно уточнить',ready:'Готово',advice:'Нужна консультация'};
const accessNames = {unknown:'Нужно уточнить',yes:'Есть подъезд',advice:'Нужна консультация'};
const MAX_BODY_BYTES = 8192;
const RATE_WINDOW_MS = 600000;
const RATE_MAX = 5;
const finishLabels = {natural:'Натуральное дерево',walnut:'Тёплый орех',graphite:'Графит'};

function field(value,max) {
  if(typeof value!=='string' || value.length>max*3) throw new Error('INVALID_FIELD');
  const clean=value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g,' ').replace(/\s+/g,' ').trim();
  if(clean.length>max) throw new Error('FIELD_TOO_LONG');
  return clean;
}

export function validateBaniLead(value) {
  if(!value || typeof value!=='object' || Array.isArray(value)) throw new Error('INVALID_PAYLOAD');
  if(value.website) throw new Error('SPAM_REJECTED');
  if(value.flow!=='callback' && value.flow!=='quote') throw new Error('INVALID_FLOW');
  if(value.consent!==true) throw new Error('CONSENT_REQUIRED');
  const name=field(value.name,80);
  if((name && name.length<2) || (value.flow==='quote' && name.length<2)) throw new Error('INVALID_NAME');
  const digits=field(value.phone,32).replace(/\D/g,'');
  const mobile=digits.length===10 && digits.startsWith('9')?'7'+digits:
    digits.length===11 && digits.startsWith('8')?'7'+digits.slice(1):digits;
  if(!/^79\d{9}$/.test(mobile) || /^7(\d)\1{9}$/.test(mobile)) throw new Error('INVALID_PHONE');
  const contactChannel=value.contactChannel??'phone';
  if(!allowedChannels.has(contactChannel))throw new Error('INVALID_CONTACT_CHANNEL');
  if(value.flow==='callback' && contactChannel!=='phone')throw new Error('CALLBACK_MUST_BE_PHONE');
  // Legacy clients can still submit an optional messenger profile during the rollout.
  // New clients only send a verified phone number for every contact channel.
  const contactAccount=field(value.contactAccount??'',140);
  if(contactAccount && !/^(@[a-zA-Z0-9_.-]{3,60}|https:\/\/(?:t\.me|max\.ru)\/[a-zA-Z0-9_\/-]{3,110})$/.test(contactAccount))throw new Error('INVALID_CONTACT_ACCOUNT');
  if(contactChannel==='phone' && contactAccount)throw new Error('UNEXPECTED_CONTACT_ACCOUNT');
  if(contactChannel==='telegram' && contactAccount.startsWith('https://max.ru/'))throw new Error('WRONG_CONTACT_NETWORK');
  if(contactChannel==='max' && contactAccount.startsWith('https://t.me/'))throw new Error('WRONG_CONTACT_NETWORK');
  const comment=field(value.comment??'',500);
  const lead={flow:value.flow,name,phone:'+'+mobile,contactChannel,contactAccount,comment};
  if(value.flow==='quote') {
    const district=field(value.district,140);
    if(district.length<2) throw new Error('INVALID_DISTRICT');
    if(!allowedBases.has(value.base) || !allowedAccess.has(value.access)) throw new Error('INVALID_SITE_FIELDS');
    if(!value.configuration || typeof value.configuration!=='object' || Array.isArray(value.configuration)) throw new Error('MISSING_CONFIGURATION');
    const {modelId,sizeId,optionIds,bundleId,finish}=value.configuration;
    if(typeof modelId!=='string' || typeof sizeId!=='string' || !Array.isArray(optionIds) || optionIds.length>20) throw new Error('INVALID_CONFIGURATION');
    if(bundleId!==null && typeof bundleId!=='string') throw new Error('INVALID_CONFIGURATION');
    if(finish!==undefined && !Object.hasOwn(finishLabels,finish)) throw new Error('INVALID_FINISH');
    const estimate=calculateQuote({modelId,sizeId,optionIds,bundleId});
    lead.district=district;
    lead.base=value.base;
    lead.access=value.access;
    lead.configuration={modelId,sizeId,optionIds:[...optionIds],bundleId,
      finishId:finish??null,finishName:finish===undefined?'Не указана':finishLabels[finish]};
    lead.estimate=estimate;
  }
  return lead;
}

export function formatBaniLead(lead,{id=null,createdAt=null}={}) {
  const text=[
    'НОВАЯ ЗАЯВКА — ГАРАНТ БАНИ',
    ...(id?['Номер: '+id]:[]),
    ...(createdAt?['Создана: '+createdAt]:[]),
    'Тип: '+(lead.flow==='quote'?'Расчёт бани':'Обратный звонок'),
    'Имя: '+(lead.name||'Не указано'),
    'Телефон: '+lead.phone,
    'Связаться: '+channelNames[lead.contactChannel||'phone']+' по номеру телефона'
  ];
  if(lead.estimate) {
    const q=lead.estimate;
    text.push(
      '',
      'КОМПЛЕКТАЦИЯ',
      'Модель: '+q.modelName,
      'Размер: '+q.sizeId+' (код; длина '+q.sizeId[0]+' м)',
      'Внешняя отделка: '+(lead.configuration?.finishName||'Не указана'),
      'Стоимость модели: '+formatMoney(q.basePrice)+' (демо)',
      'Дополнительные опции ('+q.options.length+'):'
    );
    if(q.options.length)for(const option of q.options)text.push('  • '+option.name+' — '+formatMoney(option.price));
    else text.push('  Нет');
    text.push(
      'Сумма опций: '+formatMoney(q.optionsSubtotal),
      'Скидка: −'+formatMoney(q.discount)+(q.bundleApplied?' (комплект)':q.discountRate?' ('+q.discountRate+'%)':''),
      'ИТОГО: '+formatMoney(q.total)+' (предварительно; доставка не включена)',
      'Версия прайса: '+q.pricebookVersion+' ('+q.pricebookStatus+')',
      '',
      'УЧАСТОК',
      'Район: '+lead.district,
      'Основание: '+bases[lead.base],
      'Подъезд: '+accessNames[lead.access]
    );
  }
  if(lead.contactAccount)text.push('Контакт в мессенджере: '+lead.contactAccount);
  if(lead.comment) text.push('Комментарий: '+lead.comment);
  text.push('Источник: защищённый сайт /bani-preview/');
  return text.join('\n');
}

export function loadRelayConfig(env=process.env,readSecret=readFileSync) {
  const host=env.HOST||'127.0.0.1';
  const port=Number(env.PORT||3301);
  const allowedOrigin=env.ALLOWED_ORIGIN;
  const chatId=env.MAX_CHAT_ID;
  if(host!=='127.0.0.1'||!Number.isSafeInteger(port)||port<1024||port>65535) throw new Error('UNSAFE_BIND');
  if(allowedOrigin!=='https://xn----7sbbigeqcfm8bq.xn--p1ai') throw new Error('UNSAFE_ORIGIN');
  if(!/^-?\d+$/.test(chatId||'')) throw new Error('INVALID_CHAT_ID');
  const file=env.MAX_TOKEN_FILE||(env.CREDENTIALS_DIRECTORY?env.CREDENTIALS_DIRECTORY+'/max-token':null);
  if(!file) throw new Error('TOKEN_FILE_NOT_SET');
  const token=String(readSecret(file,'utf8')).trim();
  if(token.length<10)throw new Error('INVALID_TOKEN');
  return {host,port,allowedOrigin,chatId,token};
}

export async function deliverBaniLead(lead,config,fetchImpl=fetch,meta={}) {
  const url=new URL('/messages',MAX_ORIGIN);
  url.searchParams.set('chat_id',config.chatId);
  url.searchParams.set('disable_link_preview','true');
  const response=await fetchImpl(url,{
    method:'POST',
    headers:{Authorization:config.token,'Content-Type':'application/json'},
    body:JSON.stringify({text:formatBaniLead(lead,meta),notify:true}),
    signal:AbortSignal.timeout(9000)
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok || !body.message || typeof body.message!=='object')throw new Error('MAX_DELIVERY_FAILED');
}

function json(res,status,data,extra={}) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});
  res.end(JSON.stringify(data));
}

export function createRelayHandler({config,deliver=deliverBaniLead,clock=()=>Date.now(),log=console.error,store=null,managerApi=null}={}) {
  const quotas=new Map();
  const recent=new Map();
  let active=0;
  const sending=new Set();
  return async (req,res)=>{
    if(req.method==='GET' && req.url==='/health')return json(res,200,{ok:true});
    if(req.url?.startsWith('/api/manager/')){
      if(!managerApi)return json(res,404,{ok:false,code:'NOT_FOUND'});
      await managerApi(req,res);
      return;
    }
    if(req.url!=='/api/lead')return json(res,404,{ok:false,code:'NOT_FOUND'});
    if(req.method!=='POST')return json(res,405,{ok:false,code:'METHOD_NOT_ALLOWED'},{Allow:'POST'});
    if(req.headers.origin!==config.allowedOrigin)return json(res,403,{ok:false,code:'ORIGIN_FORBIDDEN'});
    if(!/^application\/json(?:\s*;|\s*$)/i.test(req.headers['content-type']||''))return json(res,415,{ok:false,code:'CONTENT_TYPE_REQUIRED'});
    const clientIp=String(req.headers['x-forwarded-for']||'').split(',').at(-1)?.trim()||req.socket.remoteAddress||'unknown';
    const now=clock();
    for(const [key,hits] of quotas) {const valid=hits.filter(t=>now-t<RATE_WINDOW_MS);if(valid.length)quotas.set(key,valid);else quotas.delete(key);}
    for(const [key,expiry] of recent)if(expiry<now)recent.delete(key);
    if(quotas.size>5000)quotas.clear();
    const hits=quotas.get(clientIp)||[];
    if(hits.length>=RATE_MAX)return json(res,429,{ok:false,code:'RATE_LIMITED'});
    if(active>=4)return json(res,503,{ok:false,code:'BUSY'});
    quotas.set(clientIp,[...hits,now]);
    const chunks=[];
    let size=0;
    try {
      for await(const chunk of req) {
        size+=chunk.length;
        if(size>MAX_BODY_BYTES)throw new Error('BODY_TOO_LARGE');
        chunks.push(chunk);
      }
      const raw=Buffer.concat(chunks).toString('utf8');
      let payload;
      try{payload=JSON.parse(raw);}catch{throw new Error('INVALID_JSON');}
      const lead=validateBaniLead(payload);
      const fingerprint=createHash('sha256').update(JSON.stringify(lead)).digest('hex');
      if(recent.has(fingerprint))return json(res,200,{ok:true,delivered:true,duplicate:true});
      let record=null;
      if(store){
        const requestId=payload.requestId===undefined?randomUUID():payload.requestId;
        if(typeof requestId!=='string'||!/^[a-f0-9-]{16,80}$/i.test(requestId))throw new Error('INVALID_REQUEST_ID');
        try{record=store.create(lead,requestId).lead;}
        catch{
          log(JSON.stringify({event:'bani_storage_failed'}));
          return json(res,503,{ok:false,code:'STORAGE_UNAVAILABLE'});
        }
        if(record.notificationStatus==='delivered'){
          recent.set(fingerprint,now+120000);
          return json(res,200,{ok:true,delivered:true,duplicate:true,leadId:record.id});
        }
        if(sending.has(record.id))return json(res,409,{ok:false,code:'DELIVERY_IN_PROGRESS'});
      }
      if(record)sending.add(record.id);
      active++;
      try {
        await deliver(lead,config,fetch,{id:record?.id,createdAt:record?.createdAt});
        if(record)store.delivery(record.id,'delivered');
        recent.set(fingerprint,now+120000);
        log(JSON.stringify({event:'bani_lead_delivered',flow:lead.flow,leadId:record?.id||null}));
        return json(res,200,{ok:true,delivered:true,...(record?{leadId:record.id}:{})});
      } catch {
        if(record)try{store.delivery(record.id,'failed');}catch{}
        log(JSON.stringify({event:'bani_delivery_failed',leadId:record?.id||null}));
        return json(res,502,{ok:false,code:'DELIVERY_UNAVAILABLE',...(record?{leadId:record.id}:{})});
      } finally {
        if(record)sending.delete(record.id);
        active--;
      }
    } catch(error) {
      const code=error.message==='BODY_TOO_LARGE'?'BODY_TOO_LARGE':'VALIDATION_ERROR';
      log(JSON.stringify({event:'bani_lead_rejected',reason:code,category:
        ['INVALID_JSON','INVALID_PHONE','INVALID_CONTACT_CHANNEL','INVALID_CONTACT_ACCOUNT',
         'CONTACT_ACCOUNT_REQUIRED','INVALID_DISTRICT','CONSENT_REQUIRED','BODY_TOO_LARGE'].includes(error.message)
          ?error.message:'OTHER'}));
      return json(res,code==='BODY_TOO_LARGE'?413:400,{ok:false,code});
    }
  };
}

if(process.argv[1] && realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
  const config=loadRelayConfig();
  const databasePath=process.env.LEADS_DB_PATH;
  if(!databasePath||!databasePath.startsWith('/var/lib/garant-bani-relay/'))throw new Error('UNSAFE_DATABASE_PATH');
  const store=openLeadStore(databasePath);
  const managerConfig=loadManagerConfig();
  const auth=createManagerAuth(managerConfig);
  const managerApi=createManagerApi({store,auth,origin:config.allowedOrigin,log:console.error});
  const server=createServer(createRelayHandler({config,store,managerApi}));
  server.requestTimeout=15000;
  server.headersTimeout=12000;
  server.listen(config.port,config.host,()=>console.log(JSON.stringify({event:'bani_relay_listening',port:config.port})));
}

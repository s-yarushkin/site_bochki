import {normalizedPhone,submitLead} from './lead-client.mjs?v=r93-20261026';
import {attachPhoneMask} from './phone-mask.mjs';
const names={kvadro:'Квадро',viking:'Викинг',parus:'Парус','kvadro-house':'Квадро Хаус'};
const planLabel=p=>(names[p.model]||'')+' '+String(p.dimensions.lengthM).replace('.',',')+' × '+String(p.dimensions.widthM).replace('.',',')+' м · вариант '+p.variantNumber;
import {analytics} from './analytics-runtime.mjs';

const CHANNELS={telegram:'Telegram',max:'MAX'};
export function buildPlanInfoRequest(plan,mirror,fields,requestId){
 if(!plan||!/^[a-zA-Z0-9_-]{1,90}$/.test(plan.id)||typeof mirror!=='boolean')throw Error('PLAN_INVALID');
 if(!Object.hasOwn(CHANNELS,fields.channel))throw Error('CHANNEL_INVALID');
 if(!/^[a-f0-9-]{16,80}$/i.test(requestId||''))throw Error('REQUEST_ID_INVALID');
 return{requestId,flow:'callback',purpose:'plan_info',name:'',phone:normalizedPhone(fields.phone),contactChannel:fields.channel,
  planRequest:{id:plan.id,mirror},consent:true,consentVersion:'2026-10-21',consentMethod:'submit-button-v2',journeyComplete:false};
}

const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
let active=null,settingsPending=null;
const settings=()=>settingsPending??=fetch('/data/site-settings.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('LEAD_NOT_CONNECTED');return r.json()}).catch(e=>{settingsPending=null;throw e});

export function openPlanInfoRequest(plan,mirror=false){
 if(active){if(!active.dialog.open)active.dialog.showModal();return;}
 const opener=document.activeElement,dialog=el('dialog',undefined,'plan-request');dialog.setAttribute('aria-labelledby','plan-request-title');
 const header=el('div',undefined,'plan-request-header'),title=el('h2','Пришлите подробности');title.id='plan-request-title';
 const close=el('button','Закрыть ×','plans-close');close.type='button';close.setAttribute('aria-label','Закрыть запрос о планировке');header.append(title,close);
 const choice=el('p',planLabel(plan)+(mirror?' · зеркальная схема':' · основная схема'),'plan-request-choice');
 const intro=el('p','Оставьте номер — пришлём подробную схему и описание выбранного варианта.');
 const form=el('form');form.noValidate=true;
 const field=el('label',undefined,'plan-request-field');field.htmlFor='plan-request-phone';field.append(el('span','Ваш номер телефона'));
 const phone=el('input');phone.id='plan-request-phone';phone.name='phone';phone.type='tel';phone.inputMode='tel';phone.autocomplete='tel';phone.required=true;phone.maxLength=18;phone.placeholder='+7 (999) 123-45-67';phone.setAttribute('aria-describedby','plan-request-hint');field.append(phone);attachPhoneMask(phone);
 const channel=el('fieldset',undefined,'plan-request-channels');channel.append(el('legend','Куда прислать?'));
 for(const[id,name]of Object.entries(CHANNELS)){const label=el('label'),radio=el('input');radio.type='radio';radio.name='channel';radio.value=id;radio.checked=id==='telegram';label.append(radio,el('span',name));channel.append(label);}
 const hint=el('p','Укажите номер, привязанный к мессенджеру. Если не найдём вас по номеру, позвоним, чтобы уточнить контакт.','plan-request-hint');hint.id='plan-request-hint';
 const error=el('p',undefined,'plan-request-error');error.hidden=true;error.setAttribute('role','alert');
 const consent=el('p',undefined,'plan-request-consent');consent.id='plan-request-consent';consent.append('Отправляя запрос, вы подтверждаете ');
 for(const[text,href]of [['согласие на обработку персональных данных','/consent.html'],['Политика обработки данных','/privacy.html']]){const a=el('a',text);a.href=href;a.target='_blank';a.rel='noopener noreferrer';consent.append(a,text.startsWith('согласие')?' для ответа на ваше обращение. ':'.');}
 const submit=el('button','Пришлите мне подробности','plans-button plans-primary');submit.type='submit';submit.setAttribute('aria-describedby',consent.id);
 form.append(field,channel,hint,error,consent,submit);
 const result=el('div',undefined,'plan-request-result');result.hidden=true;result.setAttribute('role','status');
 const resultTitle=el('h3','Запрос получен'),resultText=el('p'),back=el('button','Вернуться к планировкам','plans-button');back.type='button';result.append(resultTitle,resultText,back);
 dialog.append(header,choice,intro,form,result);document.body.append(dialog);
 const ctx={dialog,sending:false,key:null,requestId:null};active=ctx;
 const finish=()=>{dialog.close();if(!ctx.sending)cleanup();};
 const cleanup=()=>{window.removeEventListener('popstate',finish);dialog.remove();if(active===ctx)active=null;if(opener?.isConnected)opener.focus({preventScroll:true});};
 close.addEventListener('click',finish);back.addEventListener('click',finish);dialog.addEventListener('cancel',e=>{e.preventDefault();finish()});
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(ctx.sending)return;error.hidden=true;phone.removeAttribute('aria-invalid');
  const selected=form.querySelector('input[name=channel]:checked').value;let payload;
  try{payload=buildPlanInfoRequest(plan,mirror,{phone:phone.value,channel:selected},ctx.requestId||crypto.randomUUID());}
  catch{error.textContent='Проверьте номер мобильного телефона.';error.hidden=false;phone.setAttribute('aria-invalid','true');phone.focus();return;}
  const attribution=analytics.attribution();if(attribution)payload.attribution=attribution;
  const{requestId,...content}=payload,key=JSON.stringify(content);if(key!==ctx.key){ctx.key=key;ctx.requestId=crypto.randomUUID();}payload.requestId=ctx.requestId;
  ctx.sending=true;for(const n of form.elements)n.disabled=true;submit.textContent='Отправляем…';
  try{
   const confirmation=await submitLead(payload,await settings(),location.origin);
   resultTitle.textContent=confirmation.duplicate?'Запрос уже получен':'Запрос получен';resultText.textContent='Менеджер пришлёт подробности об этой планировке в '+CHANNELS[selected]+'. Если не получится написать, позвоним, чтобы уточнить контакт.';
   form.hidden=true;intro.hidden=true;result.hidden=false;back.focus();
   analytics.confirmed(confirmation.receipt,{flow:'callback',requestId:payload.requestId});
  }catch(e){
   error.textContent=e.message==='RATE_LIMITED'?'Слишком много попыток. Попробуйте позже или позвоните: +7 (951) 734-99-99.':e.message==='IN_PROGRESS'?'Запрос ещё отправляется. Подождите немного и повторите попытку.':'Не удалось отправить запрос. Попробуйте ещё раз или позвоните: +7 (951) 734-99-99.';error.hidden=false;
  }finally{ctx.sending=false;for(const n of form.elements)n.disabled=false;submit.textContent='Пришлите мне подробности';if(!dialog.open)cleanup();}
 });
 window.addEventListener('popstate',finish);dialog.showModal();phone.focus();
}

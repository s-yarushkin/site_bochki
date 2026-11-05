import {homeSelectionText,homeInquiryPayload} from './continuation-state.mjs?v=phone-callback-20261105';
import {callbackAvailable,submitLead} from '/lead-client.mjs';
import {attachPhoneMask} from '/phone-mask.mjs';
import {analytics} from '/analytics-core.mjs?v=r117-quiz-goals';
import {mobileDialog} from '/r101/mobile-dialog.mjs';

export function connectHomeContinuation({getState,getBook,plans}){
 const $=s=>document.querySelector(s),dialog=$('#inquiry-dialog'),form=$('#inquiry-form'),fields=$('#form-fields'),status=$('#form-status');
 const mobile=mobileDialog(dialog);let settings,opener=null,selection=null,sending=false,sent=false,requestId=null;
 const entry=dialog.querySelector('[data-inquiry-entry]'),success=$('#inquiry-success'),successTitle=$('#inquiry-success-title');
 const field=name=>form.elements.namedItem(name);
 attachPhoneMask(field('phone'));
 fetch('/data/site-settings.json',{signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw Error('SETTINGS');return r.json();}).then(data=>{settings=data;analytics?.start(settings);if(dialog.open)fields.disabled=!callbackAvailable(settings,location.origin);}).catch(()=>{});
 const placement=element=>element?.closest('.closing')?'final':element?.closest('.resume')?'mobile':'personal';
 function open(button){
  opener=button;selection={...getState()};
  if(sent){form.reset();sent=false;requestId=null;}
  entry.hidden=false;success.hidden=true;dialog.setAttribute('aria-labelledby','inquiry-title');dialog.querySelector('.dialog-close').hidden=false;
  $('#inquiry-summary').textContent=homeSelectionText(getBook(),selection);
  status.textContent='';status.className='form-status';fields.hidden=false;fields.disabled=!callbackAvailable(settings,location.origin);
  if(fields.disabled)status.textContent='Сейчас заявку можно оставить по телефону: +7 (951) 734-99-99.';
  $('#preview-note').hidden=location.hostname!=='127.0.0.1';dialog.showModal();mobile.open();
  analytics?.track('dp_form_open',{flow:'callback',purpose:'selection_help',placement:placement(button),model:selection.model});
 }
 for(const button of document.querySelectorAll('[data-inquiry],[data-resume-inquiry]'))button.addEventListener('click',()=>open(button));
 const close=()=>{dialog.close();opener?.focus({preventScroll:true});};
 dialog.querySelector('.dialog-close').addEventListener('click',close);dialog.addEventListener('close',()=>opener?.focus({preventScroll:true}));
 dialog.querySelector('[data-inquiry-success-close]').addEventListener('click',close);
 dialog.addEventListener('cancel',event=>{if(sent)event.preventDefault();});
 dialog.addEventListener('click',event=>{if(!sent&&event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
 form.addEventListener('input',()=>{requestId=null;});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(sending||sent||fields.disabled||!form.reportValidity())return;
  const values=Object.fromEntries(['name','phone','channel','settlement','comment'].map(name=>[name,field(name).value]));
  let payload;
  try{payload=homeInquiryPayload(getBook(),plans,selection,values,requestId??=crypto.randomUUID());}
  catch{status.textContent='Проверьте номер мобильного телефона.';status.className='form-status error';field('phone').focus();return;}
  const attribution=analytics?.attribution?.();if(attribution)payload.attribution=attribution;
  sending=true;fields.disabled=true;status.textContent='Передаём ваш запрос…';status.className='form-status';
  analytics?.track('dp_form_submit_attempt',{flow:'callback',purpose:'selection_help',model:selection.model,placement:placement(opener)});
  try{
   const result=await submitLead(payload,settings,location.origin);sent=true;fields.hidden=true;status.textContent='';entry.hidden=true;success.hidden=false;
   dialog.setAttribute('aria-labelledby','inquiry-success-title');dialog.querySelector('.dialog-close').hidden=true;dialog.scrollTop=0;successTitle.focus({preventScroll:true});
   analytics?.confirmed(result.receipt,{flow:'callback',requestId,purpose:'selection_help',model:selection.model,placement:placement(opener)});
  }catch{status.className='form-status error';status.textContent='Пока не получили подтверждение заявки. Ваши данные остались в форме. Попробуйте ещё раз или позвоните нам.';}
  finally{sending=false;fields.disabled=false;}
 });
 const resume=$('#resume');let dismissed=false,ticking=false;
 function visibility(){
  ticking=false;const anchor=$('#bath-model');
  resume.hidden=dismissed||Boolean(document.querySelector('dialog[open]'))||(anchor?.getBoundingClientRect().bottom??Infinity)>110;
 }
 function schedule(){if(!ticking){ticking=true;requestAnimationFrame(visibility);}}
 $('[data-dismiss-resume]').addEventListener('click',()=>{dismissed=true;visibility();});
 addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule,{passive:true});
 new MutationObserver(schedule).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 for(const item of document.querySelectorAll('details:not(.form-details)'))item.addEventListener('toggle',()=>{if(item.open)analytics?.track('dp_faq_open',{placement:'faq'});});
 return ()=>{
  const text=homeSelectionText(getBook(),getState());
  for(const item of document.querySelectorAll('[data-closing-choice]')){item.hidden=false;item.textContent='Ваш выбор: '+text;}
  $('#resume-title').textContent=text;dismissed=false;visibility();
 };
}

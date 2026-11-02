import {leadAvailable,submitLead} from '/lead-client.mjs';
import {analytics} from '/analytics-core.mjs';
import {attachPhoneMask} from '/phone-mask.mjs';
import {mobileDialog} from '/r101/mobile-dialog.mjs';
import {campaignInquiry,createRequestIdentity} from './lead-contract.mjs';
import {catalogReady,currentOffer} from './models.mjs';
import {priceText} from './catalog.mjs';

const dialog=document.querySelector('#lead-dialog');
const form=document.querySelector('#lead-form');
const fields=document.querySelector('#form-fields');
const status=document.querySelector('#form-result');
const submit=document.querySelector('#submit-lead');
const phone=form.elements.namedItem('phone');
const mobileInquiry=mobileDialog(dialog);
const local=['127.0.0.1','localhost'].includes(location.hostname);
const track=(name,extra={})=>analytics?.track(name,{...extra,purpose:selectionContext?'quote':'selection_help',experiment_id:'new_year_2027',variant:'winter'});
let settings,opener,placement='hero',sending=false,sent=false,selectionContext=null;
let identity=createRequestIdentity();
attachPhoneMask(phone);
const available=()=>selectionContext&&leadAvailable(settings,location.origin,selectionContext.book.version);

const settingsReady=fetch('/data/site-settings.json',{signal:AbortSignal.timeout(10000)})
  .then(async response=>{if(!response.ok)throw Error('SETTINGS');settings=await response.json();analytics?.start(settings);})
  .catch(()=>{settings=null;});

function resetSent(){
  form.reset();fields.hidden=false;sent=false;identity=createRequestIdentity();
  form.querySelector('.form-details').open=false;
  status.textContent='';status.className='';submit.disabled=false;
}
document.querySelectorAll('[data-open-lead]').forEach(button=>button.addEventListener('click',async()=>{
  opener=button;
  placement=button.closest('header')?'header':button.closest('.mobile-bar')?'mobile':'hero';
  if(sent)resetSent();
  selectionContext=currentOffer();
  const scene=document.querySelector('.hero-world'),winterImage=document.querySelector('#dialog-winter-image');
  winterImage.sizes='500px';winterImage.srcset=scene.srcset;winterImage.src=scene.src;
  dialog.showModal();document.body.classList.add('dialog-open');
  if(!mobileInquiry.open())phone.focus();
  document.querySelector('#preview-note').hidden=!local;
  fields.disabled=sending||!available();
  if(!sending)status.textContent=settings?'':'Подключаем форму…';
  track('dp_cta_click',{placement});track('dp_form_open',{placement});
  await Promise.all([settingsReady,catalogReady]);
  selectionContext=currentOffer();
  document.querySelector('#inquiry-summary').textContent=selectionContext?`${selectionContext.name} · ${selectionContext.sizeLabel} · «Комфорт» · ${priceText(selectionContext.price)}`:'';
  fields.disabled=sending||!available();
  if(!sending)status.textContent=available()?'':'Сейчас заявку можно оставить по телефону: +7 (951) 734-99-99.';
}));
document.querySelector('.close-dialog').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{
  const bounds=dialog.getBoundingClientRect();
  if(event.target===dialog&&(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom))dialog.close();
});
dialog.addEventListener('close',()=>{
  document.body.classList.remove('dialog-open');opener?.focus({preventScroll:true});track('dp_form_close',{placement});
});
phone.addEventListener('input',()=>phone.removeAttribute('aria-invalid'));
document.querySelectorAll('a[href^="tel:"]').forEach(link=>link.addEventListener('click',()=>track('dp_phone_click',{placement:link.closest('header')?'header':'footer'})));

form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(sending||sent||fields.disabled||!available()||!form.reportValidity())return;
  sending=true;fields.disabled=true;status.className='';
  const values=Object.fromEntries(['name','phone','settlement','comment'].map(key=>[key,form.elements.namedItem(key).value]));
  let payload;
  try {
    payload=campaignInquiry(values,crypto.randomUUID(),selectionContext);
  } catch {
    sending=false;fields.disabled=false;status.className='error';
    status.textContent='Проверьте мобильный номер: +7 и ещё 10 цифр.';
    phone.setAttribute('aria-invalid','true');phone.focus();track('dp_form_error',{placement,error_type:'validation'});return;
  }
  status.textContent='Передаём ваш запрос…';
  try {
    const attribution=analytics?.attribution(),clientId=await analytics?.clientID();
    if(attribution||clientId)payload.attribution={...attribution,...(clientId?{clientId}:{})};
    payload=identity.assign(payload);
    track('dp_form_submit_attempt',{placement,flow:payload.flow,model:selectionContext?.selection.model,size:selectionContext?.selection.size});
    const result=await submitLead(payload,settings,location.origin);
    sent=true;fields.hidden=true;status.className='success';
    status.textContent=local?'Тестовый запрос планировок и комплектаций принят. Реальным менеджерам ничего не отправлено.':'Запрос принят! Передали выбранную баню и просьбу прислать планировки и комплектации менеджеру. Свяжемся по указанному телефону.';
    analytics?.confirmed(result.receipt,{flow:payload.flow,requestId:payload.requestId,purpose:payload.journeyContext.purpose,model:selectionContext?.selection.model,size:selectionContext?.selection.size,placement,experiment_id:'new_year_2027',variant:'winter'});
  } catch(error) {
    status.className='error';
    status.textContent=error.message==='RATE_LIMITED'?'Слишком много попыток. Попробуйте позже или позвоните нам.':'Пока не получили подтверждение заявки. Ваши данные остались в форме. Попробуйте ещё раз или позвоните нам.';
    track('dp_form_error',{placement,error_type:error.message==='RATE_LIMITED'?'rate_limit':'network'});
  } finally {
    sending=false;fields.disabled=!available();
  }
});

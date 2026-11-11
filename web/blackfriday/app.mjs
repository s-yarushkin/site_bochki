import * as core from './state.mjs';
import {campaignPhase,syncCampaignClock,campaignCondition} from '/campaigns/blackfriday.mjs';
import {PACKAGE_COPY,COMPARISON} from '/choice/packages.mjs?v=packages-contact-20261106';
import {buildCallback,submitLead} from '/lead-client.mjs';
import {attachPhoneMask} from '/phone-mask.mjs';
import {analytics} from '/analytics-core.mjs';
import {journeyFormOpened} from '/journey-tracker.mjs?v=crm-20261105';
import {requestIntent} from '/request-intent.mjs';
import {campaignLeadFields} from './lead-data.mjs';

const names={kvadro:'Квадро',parus:'Парус',viking:'Викинг','kvadro-house':'Квадро Хаус'};
const money=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽',$=s=>document.querySelector(s);
let state=core.normalize({model:'parus',size:'550'}),lastSizes={parus:'550'},imageTicket=0,lastOpener=null,entry='model',requestId,settingsPromise;
const query=new URL(location.href).searchParams;
if(query.has('model')||query.has('bath'))state=core.normalize({model:query.get('model')??query.get('bath'),size:query.get('size')??query.get('bathSize'),package:query.get('package')});
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;};
function settings(){return settingsPromise??=fetch('/data/site-settings.json',{cache:'no-store',signal:AbortSignal.timeout(10000)}).then(async response=>{if(!response.ok)throw Error('SETTINGS');syncCampaignClock(response);const value=await response.json();analytics?.start(value);render();return value;}).catch(error=>{settingsPromise=null;throw error;});}
$('#models').replaceChildren(...core.models.map(model=>{
 const b=node('button',names[model]);b.type='button';b.dataset.model=model;b.dataset.modelCard=model;
 b.addEventListener('click',()=>{lastSizes[state.model]=state.size;state=core.normalize({...state,model,size:lastSizes[model]??state.size});requestIntent?.select('model',model);render(true);});return b;
}));
function render(changeModel=false){
 const prices=core.prices(state),phase=campaignPhase();
 for(const b of $('#models').children)b.setAttribute('aria-pressed',String(b.dataset.model===state.model));
 $('#sizes').replaceChildren(...core.sizes(state.model).map(size=>{
  const b=node('button',size.label);b.type='button';b.dataset.sizePicker=size.id;b.setAttribute('aria-pressed',String(size.id===state.size));
  b.addEventListener('click',()=>{state={...state,size:size.id};lastSizes[state.model]=size.id;requestIntent?.select('size',size.id);render();$('#sizes button[data-size-picker="'+size.id+'"]').focus({preventScroll:true});});return b;
 }));
 $('#selection').textContent=names[state.model]+' · '+prices.comfort.sizeLabel;
 for(const key of ['comfort','deluxe']){
  const q=prices[key];$('[data-reference="'+key+'"]').textContent=money(q.reference);$('[data-reference="'+key+'"]').closest('.old-price').hidden=phase==='ended';
  $('[data-saving="'+key+'"]').textContent='Скидка '+money(q.discountRub);$('[data-saving="'+key+'"]').hidden=phase==='ended';
  $('[data-price="'+key+'"]').textContent='от '+money(q.priceRub);$('[data-description="'+key+'"]').textContent=PACKAGE_COPY[key];
  $('[data-card="'+key+'"]').classList.toggle('is-selected',state.package===key);$('input[name=package][value="'+key+'"]').checked=state.package===key;
 }
 $('[data-campaign-status]').textContent=phase==='upcoming'?'Акция начнётся 11 ноября':phase==='active'?'11–21 ноября · Чёрная пятница':'Акция завершена';
 $('.condition').textContent=phase==='ended'?'Акция завершилась 21 ноября 2026. Оставьте заявку — подготовим актуальное предложение.':campaignCondition;
 $('[data-request][data-entry=model]').firstChild.textContent=phase==='ended'?'Получить актуальное предложение ':'Хочу баню по акции ';
 if(changeModel){
  const image=$('#scene-image'),ticket=++imageTicket,pending=new Image();image.classList.add('is-loading');
  pending.onload=()=>{if(ticket===imageTicket){image.src=pending.src;image.classList.remove('is-loading');}};
  pending.onerror=()=>{if(ticket===imageTicket)image.classList.remove('is-loading');};
  pending.src='/blackfriday/assets/scene-'+state.model+'.webp';
 }
 const url=new URL(location.href);url.searchParams.set('model',state.model);url.searchParams.set('size',state.size);url.searchParams.set('package',state.package);history.replaceState(null,'',url);
}
document.querySelectorAll('input[name=package]').forEach(r=>r.addEventListener('change',()=>{state={...state,package:r.value};requestIntent?.select('package',r.value);render();}));
function open(dialog,opener){lastOpener=opener;dialog.showModal();dialog.querySelector('input,button')?.focus({preventScroll:true});}
for(const dialog of document.querySelectorAll('dialog')){
 dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{if(lastOpener?.isConnected)lastOpener.focus({preventScroll:true});});
}
$('#compare').addEventListener('click',event=>{
 const prices=core.prices(state),table=$('#comparison-table');table.replaceChildren();table.createCaption().textContent='Состав комплектаций';table.caption.className='sr-only';
 const head=table.createTHead().insertRow();for(const [label,key]of [['Оснащение',null],['Комфорт','comfort'],['Делюкс','deluxe']]){const cell=node('th',label);cell.scope='col';if(key)cell.append(node('small','от '+money(prices[key].priceRub)));head.append(cell);}
 for(const group of [...new Set(COMPARISON.map(r=>r.group))]){const body=table.createTBody(),row=body.insertRow(),heading=node('th',group);heading.colSpan=3;heading.scope='rowgroup';row.className='group';row.append(heading);for(const item of COMPARISON.filter(r=>r.group===group)){const tr=body.insertRow(),title=node('th',item.title);title.scope='row';tr.append(title,node('td',item.comfort),node('td',item.deluxe,item.upgrade?'upgrade':undefined));}}
 $('#compare-selection').textContent=names[state.model]+' · '+prices.comfort.sizeLabel;
 analytics?.track('dp_compare_view',{model:state.model,placement:'packages'});open($('#comparison'),event.currentTarget);
});
const form=$('#inquiry-form'),submit=form.querySelector('[type=submit]'),error=$('#inquiry-status');
form.dataset.leadEntry='model_offer';attachPhoneMask(form.elements.phone);
document.querySelectorAll('[data-request]').forEach(b=>b.addEventListener('click',event=>{
 entry=b.dataset.entry;const q=core.quote(state);journeyFormOpened(event.currentTarget,'quote');form.hidden=false;$('#inquiry-title').textContent='Куда прислать планировки и цены?';
 $('#inquiry-selection').textContent=names[state.model]+' · '+q.sizeLabel+' · '+q.packageName+' · от '+money(q.priceRub);
 error.hidden=true;open($('#inquiry'),event.currentTarget);
}));
form.addEventListener('input',()=>{requestId=undefined;});
form.addEventListener('submit',async event=>{
 event.preventDefault();if(submit.disabled)return;error.hidden=true;submit.disabled=true;submit.textContent='Отправляем…';
 try{
  const q=core.quote(state),payload={...buildCallback({phone:form.elements.phone.value},requestId??=crypto.randomUUID()),...campaignLeadFields(state,q,entry,form.elements.channel.value)};
  const attribution=analytics?.attribution?.();if(attribution)payload.attribution=attribution;
  const sent=await submitLead(payload,await settings(),location.origin);
  analytics?.confirmed(sent.receipt,{flow:'callback',requestId,purpose:'selection_help',model:state.model,size:state.size,package:state.package,placement:entry==='header'?'header':'catalog'});
  $('#inquiry-title').textContent='Заявка получена';$('#inquiry-selection').textContent='Пришлём планировки и комплектации с ценами в выбранный мессенджер. Если написать не получится, позвоним.';
  form.reset();requestId=undefined;form.hidden=true;
 }catch(cause){error.hidden=false;error.textContent=cause.message==='PHONE_INVALID'?'Проверьте номер мобильного телефона.':cause.message==='RATE_LIMITED'?'Слишком много попыток. Попробуйте немного позже или позвоните нам.':'Заявка пока не подтверждена. Попробуйте ещё раз или позвоните +7 (951) 734-99-99.';}
 finally{submit.disabled=false;submit.textContent='Получить планировки и цены';}
});
render(true);settings().catch(()=>{});setInterval(()=>render(),30000);

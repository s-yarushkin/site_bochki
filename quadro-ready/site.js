(()=>{'use strict';
// Progressive photos: release media as separate verified package. Missing assets keep honest placeholders.
const MEDIA_NAMES=new Set(['hero-side','full-side','stove-wide','lounge','steam-shelves','exterior-proof','stove-tank']);
function loadApprovedMedia(){
  for(const node of document.querySelectorAll('[data-photo]')){
    const key=node.dataset.photo;
    if(!MEDIA_NAMES.has(key))continue;
    const image=new Image();
    image.alt='Фотография реальной бани — референс для комплектации КВАДРО READY';
    image.decoding='async';
    image.loading='eager'; // Detached Image loads immediately; future lazy gallery uses IntersectionObserver.
    if(key==='hero-side')image.fetchPriority='high';
    image.onload=()=>{
      node.setAttribute('aria-label',image.alt);
      node.classList.add('has-photo');
      node.append(image);
      const note=document.createElement('span');
      note.className='photo-note';
      note.textContent='Фото реального объекта · детали READY уточняются';
      node.append(note);
    };
    image.onerror=()=>{}; // Deliberate placeholder until a media release adds this exact asset.
    image.src=new URL('media/'+key+'.webp',document.baseURI).toString();
  }
}
loadApprovedMedia();
const PRICES=Object.freeze({5:749000,6:799000});
const NAMES=Object.freeze({natural:'Натуральный',walnut:'Орех',graphite:'Графит'});
const state={size:5,color:'natural',requestId:null,pending:false};
const $=selector=>document.querySelector(selector);
const $$=selector=>Array.from(document.querySelectorAll(selector));
const money=value=>new Intl.NumberFormat('ru-RU').format(value)+' ₽';
function updateChoice(){
  for(const button of $$('[data-size]')){
    const selected=Number(button.dataset.size)===state.size;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
  }
  for(const button of $$('[data-color]')){
    const selected=button.dataset.color===state.color;
    button.classList.toggle('selected',selected);
    button.setAttribute('aria-pressed',String(selected));
  }
  for(const button of $$('[data-plan]')){
    const selected=Number(button.dataset.plan)===state.size;
    button.classList.toggle('selected',selected);
    button.setAttribute('aria-pressed',String(selected));
  }
  $('#visualSize').textContent=String(state.size);
  $('#visualColor').textContent='Цвет: '+NAMES[state.color].toLowerCase();
  $('#choiceVisual').setAttribute('aria-label','Здесь будет реальное фото КВАДРО '+state.size+' метров, цвет: '+NAMES[state.color]);
  $('#sizeDescription').textContent=state.size===5?
    'Полноценная парная и уютная комната отдыха. Компактнее для участка.':
    'Та же парная и оснащение — больше места для отдыха после парной.';
  $('#productPrice').textContent=money(PRICES[state.size]);
  $('#summarySelection').textContent='КВАДРО READY '+state.size+' м · '+NAMES[state.color];
  $('#summaryPrice').textContent='Проектная цена: '+money(PRICES[state.size])+' · доставка отдельно';
  $('#mobileSummary').textContent='КВАДРО '+state.size+' м · '+money(PRICES[state.size])+'*';
  $('#planDimension').textContent=state.size+',0 × 2,1 м';
  $('#planLengthLabel').textContent=String(state.size);
}
for(const b of $$('[data-size]'))b.addEventListener('click',()=>{
  state.size=Number(b.dataset.size);
  state.requestId=null;
  updateChoice();
});
for(const b of $$('[data-plan]'))b.addEventListener('click',()=>{
  state.size=Number(b.dataset.plan);
  state.requestId=null;
  updateChoice();
});
for(const b of $$('[data-color]'))b.addEventListener('click',()=>{
  state.color=b.dataset.color;
  state.requestId=null;
  updateChoice();
});
updateChoice();
const form=$('#leadForm'),status=$('#formStatus'),submit=$('#submitLead');
form.addEventListener('input',()=>{if(!state.pending)state.requestId=null;status.textContent='';});
form.addEventListener('change',()=>{if(!state.pending)state.requestId=null;});
function error(message){
  status.dataset.error='true';
  status.textContent=message;
}
function validPhone(phone){
  let digits=phone.replace(/\D/g,'');
  if(digits.length===10&&digits.startsWith('9'))digits='7'+digits;
  if(digits.length===11&&digits.startsWith('8'))digits='7'+digits.slice(1);
  return /^79\d{9}$/.test(digits)&&!/^7(\d)\1{9}$/.test(digits);
}
function tracking(){
  const p=new URLSearchParams(location.search);
  const keys={utm_source:'utmSource',utm_medium:'utmMedium',utm_campaign:'utmCampaign',utm_content:'utmContent',utm_term:'utmTerm'};
  const out={landingPath:location.pathname.slice(0,160)};
  for(const [key,target] of Object.entries(keys)){
    const value=p.get(key);
    if(value)out[target]=value.slice(0,100);
  }
  return out;
}
form.addEventListener('submit',async(event)=>{
  event.preventDefault();
  if(state.pending)return;
  if(!form.reportValidity())return;
  const data=new FormData(form),name=String(data.get('name')||'').trim();
  const phone=String(data.get('phone')||'').trim(),district=String(data.get('district')||'').trim();
  if(name.length<2){error('Укажите имя — не менее двух символов.');form.elements.name.focus();return;}
  if(!validPhone(phone)){error('Укажите российский мобильный телефон в формате +7 9XX XXX-XX-XX.');form.elements.phone.focus();return;}
  if(district.length<2){error('Укажите район или населённый пункт для расчёта доставки.');form.elements.district.focus();return;}
  if(!data.get('consent')){error('Пожалуйста, подтвердите согласие на обработку данных.');return;}
  state.requestId||=crypto.randomUUID();
  const payload={
    requestId:state.requestId,flow:'quote',website:String(data.get('website')||''),
    product:{sku:'QR-'+state.size+'-READY',finishId:state.color},
    district,site:{base:data.get('base')||'unknown',access:data.get('access')||'unknown'},
    customer:{name,phone,contactChannel:data.get('channel')||'phone',comment:String(data.get('comment')||'').trim()},
    consent:{accepted:true,version:'quadro-ready-v1'},tracking:tracking()
  };
  state.pending=true;submit.disabled=true;submit.textContent='Сохраняем заявку…';
  status.dataset.error='false';status.textContent='';
  try{
    const api=new URL('api/leads/quadro-ready',document.baseURI);
    const response=await fetch(api.toString(),{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)
    });
    const result=await response.json().catch(()=>null);
    if(!response.ok||!result?.ok||!result?.persisted||!result.leadId){
      throw new Error(result?.code||'SAVE_FAILED');
    }
    status.dataset.error='false';
    status.textContent='Заявка №'+result.leadId+' сохранена. Менеджер свяжется с вами. Спасибо!';
    submit.textContent='Заявка сохранена';
    // A new edit creates a new intent with a new requestId, but a repeated POST of this unchanged requestId is idempotent.
    form.querySelectorAll('input,select,textarea').forEach(input=>{input.disabled=true;});
  }catch(e){
    const known={RATE_LIMITED:'Слишком много попыток. Попробуйте позднее.',
      ORIGIN_FORBIDDEN:'Сайт ещё не подключён к серверу заявок.',
      CONSENT_REQUIRED:'Пожалуйста, подтвердите согласие.',
      DELIVERY_IN_PROGRESS:'Заявка обрабатывается. Подождите и повторите отправку.',
      REQUEST_ID_CONFLICT:'Изменены данные заявки. Проверьте форму и отправьте повторно.',
      STORAGE_UNAVAILABLE:'Временно не удалось сохранить заявку. Попробуйте повторить.'};
    if(e.message==='REQUEST_ID_CONFLICT')state.requestId=null;
    error(known[e.message]||'Пока не получилось сохранить заявку. Ваши данные остались в форме; попробуйте повторить.');
    submit.disabled=false;submit.textContent='Повторить отправку →';
  }finally{state.pending=false;}
});
})();

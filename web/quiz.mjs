import {ANSWERS,validAnswers,guestExplanation,recommendModelRanges} from './quiz-engine.mjs?v=r108-ranges';
import {buildCallback,submitLead} from './lead-client.mjs?v=r100-20261027';
import {attachPhoneMask} from './phone-mask.mjs';
import {analytics} from './analytics-core.mjs?v=r117-quiz-goals';

const $=(selector,root=document)=>root.querySelector(selector);
// The three editorial photos are approved for this quiz. They illustrate the experience,
// not documented interiors of any particular production bathhouse.
const questionPhotos=Object.freeze([
  '/assets/quiz/step1-steamroom.webp',
  '/assets/quiz/step2-washroom.webp',
  '/assets/quiz/step3-bedroom.webp'
]);
const models={
  kvadro:{name:'Квадро',photo:'/r101/assets/kvadro-editorial-960.webp',description:'Отдельная парная и комната отдыха. Ширина корпуса — 2,1 м.'},
  viking:{name:'Викинг',photo:'/r101/assets/viking-editorial-960.webp',description:'Отдельная парная и комната отдыха. Ширина корпуса — 2,4 м.'},
  parus:{name:'Парус',photo:'/r101/assets/parus-editorial-960.webp',description:'Прямые стены и отдельная парная. Ширина корпуса — 2,4 м.'},
  'kvadro-house':{name:'Квадро Хаус',photo:'/r101/assets/house-editorial-960.webp',description:'Когда после парной хочется остаться подольше и никуда не торопиться.'}
};
const question=[
  {key:'party',title:'Сколько человек обычно будет в бане?',description:'',options:[
    ['p2','1–2 человека','Для спокойного отдыха'],
    ['p4','До 4 человек','Для семьи и небольшой компании'],
    ['p6','5–6 человек','Для большой семьи и друзей'],
    ['p8','До 8 человек','Когда в планах — встречать праздники в бане с компанией']
  ]},
  {key:'wash',title:'Нужна отдельная помывочная?',description:'Исторически мылись в самой парной, но с появлением культуры парения удобнее мыться в отдельном помещении.',options:[
    ['w_yes','Да, отдельная помывочная','Мыться отдельно от парной'],
    ['w_no','Без отдельной помывочной','Предпочитаю сэкономить'],
    ['w_compare','Хочу сравнить','Посмотрю оба варианта и решу']
  ]},
  {key:'bedroom',title:'Нужно место, чтобы остаться на ночь?',description:'',options:[
    ['b_yes','Да, со спальней','Закончить банный вечер и остаться до утра'],
    ['b_no','Только для банного отдыха','Для ночёвки у нас есть дом']
  ]}
];
const safe=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const rub=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n)+' ₽';
const offerPrice=offer=>offer.displayMinRub===offer.displayMaxRub?'≈ '+rub(offer.displayMinRub):'от '+rub(offer.displayMinRub)+' до '+rub(offer.displayMaxRub);

const liveKey='dp_quiz_answers_v1',hiddenKey='dp_quiz_invite_suppressed_until_v1';
// R111: no generic timers, page-percentage or exit-intent interruptions.
// Trigger 1: 18s without scroll, pointer, click, touch or keyboard activity while viewing models.
// Trigger 2: arriving at the editorial 'ВАША БАНЯ' screen (not #configure / footer).
const modelsIdleMs=18000;
const inviteShownSessionKey='dp_quiz_invite_seen_session_r111';
const state={step:0,view:'question',answers:{},selectedCode:null,expanded:false,sending:false,phone:'',city:'',channel:'',error:'',success:false,completedNotified:false,requestId:null};
let quiz=null,book=null,settings=null,dialog=null,invite=null,launcher=null,interacted=false,shownThisVisit=false,lastOpener=null;
let modelsIdleTimer=null;
const trace=(name,params={})=>{try{analytics?.track(name,{placement:'catalog',...params})}catch{}};
// City qualification runs locally; Metrika receives only a true/false event ID,
// never the settlement text, phone number, or buyer's comment.
const isPereslavlCity=value=>{
  const city=String(value||'').normalize('NFKC').toLocaleLowerCase('ru-RU')
    .replace(/ё/g,'е').replace(/[.,\-–—]/g,' ').replace(/\s+/g,' ').trim();
  return /^(?:г |город )?переславль(?: залесский)?(?: ярославская (?:обл|область))?$/u.test(city);
};

const save=()=>{try{sessionStorage.setItem(liveKey,JSON.stringify(state.answers))}catch{}};
const load=()=>{try{const a=JSON.parse(sessionStorage.getItem(liveKey)||'{}');if(a&&typeof a==='object')state.answers={party:ANSWERS.party.includes(a.party)?a.party:undefined,wash:ANSWERS.wash.includes(a.wash)?a.wash:undefined,bedroom:ANSWERS.bedroom.includes(a.bedroom)?a.bedroom:undefined}}catch{}};
const cancelModelsIdle=()=>{if(modelsIdleTimer!==null){clearTimeout(modelsIdleTimer);modelsIdleTimer=null}};
const hideInvite=(dismissed=false)=>{const wasOpen=!!invite?.open;if(wasOpen)invite.close();cancelModelsIdle();if(dismissed&&wasOpen){shownThisVisit=true;try{localStorage.setItem(hiddenKey,String(Date.now()+7*86400000))}catch{}trace('dp_quiz_invite_close');trace('dp_quiz_close_before_completed')}};
const canInvite=(reason)=>{
  // One automatic display per tab session. Old seven-day dismissals from
  // previous releases must not silently suppress a fresh session.
  const isReady=!shownThisVisit&&!dialog?.open&&!invite?.open&&
    !document.querySelector('dialog[open]')&&document.visibilityState==='visible';
  if(!isReady)return false;
  if(reason==='models-idle'){
    let savedChoice=false;try{savedChoice=!!JSON.parse(localStorage.getItem('dp_r101_choice')||'null')}catch{}
    return !savedChoice&&!interacted;
  }
  return reason==='your-bath';
};
const modelsVisible=()=>{
  const el=$('#models');if(!el)return false;
  const r=el.getBoundingClientRect(),h=innerHeight;
  return r.top<=h*0.55&&r.bottom>=h*0.45;
};
// Target the actual visual screen identified by its editorial headings
// ("ВАША БАНЯ" / "Расскажите, какой вы её представляете").
// Neither #configure nor the footer nor scroll percentage is a trigger.
const labelText=node=>(node?.textContent||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('ru-RU');
const findBathVision=()=>{
  const nodes=document.querySelectorAll('h1,h2,h3,[role="heading"],p,span,strong');
  for(const node of nodes){
    const title=labelText(node);
    if(title==='ваша баня'||title==='вашабаня'||
      (/^расскажите,?\s+какой/.test(title)&&title.includes('представляете'))){
      if(!node.getClientRects().length)continue;
      return node.closest('section,[role="region"],article')||node.parentElement;
    }
  }
  return null;
};
const bathVisionVisible=()=>{
  const screen=findBathVision();
  if(!screen)return false;
  const rect=screen.getBoundingClientRect(),h=innerHeight;
  return rect.top<=h*.75&&rect.bottom>=h*.18;
};
const maybeInvite=(reason)=>{
  if(!invite||!canInvite(reason))return false;
  if(reason==='models-idle'&&!modelsVisible())return false;
  if(reason==='your-bath'&&!bathVisionVisible())return false;
  if(reason!=='models-idle'&&reason!=='your-bath')return false;
  try{invite.showModal()}catch(error){console.warn('DachaPar invite could not open:',error);return false}
  shownThisVisit=true;
  try{sessionStorage.setItem(inviteShownSessionKey,'1')}catch{}
  cancelModelsIdle();
  bathScreenObserver?.disconnect();
  bathDomObserver?.disconnect();
  trace('dp_quiz_invite_view',{reason});
  return true;
};
const armModelsIdle=()=>{
  cancelModelsIdle();
  if(!canInvite('models-idle')||!modelsVisible()||bathVisionVisible())return;
  modelsIdleTimer=setTimeout(()=>{modelsIdleTimer=null;maybeInvite('models-idle')},modelsIdleMs);
};
const handleActivity=()=>{
  cancelModelsIdle();
  if(canInvite('models-idle')&&modelsVisible()&&!bathVisionVisible())armModelsIdle();
};
const handleScroll=()=>{
  cancelModelsIdle();
  // Crucial: do not show the invite at the calculator, ritual or footer.
  if(bathVisionVisible()){maybeInvite('your-bath');return}
  armModelsIdle();
};
let bathScreenObserver=null,bathDomObserver=null,observedBathScreen=null;
const watchBathScreen=()=>{
  if(shownThisVisit)return;
  const screen=findBathVision();
  if(!screen||screen===observedBathScreen)return;
  bathScreenObserver?.disconnect();
  observedBathScreen=screen;
  bathScreenObserver=new IntersectionObserver(entries=>{
    if(entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>=.12))
      maybeInvite('your-bath');
  },{root:null,threshold:[0,.12,.4]});
  bathScreenObserver.observe(screen);
  // Handle heading added after a navigation or a delayed site transition.
  if(bathVisionVisible())maybeInvite('your-bath');
};
const observeLateBathScreen=()=>{
  watchBathScreen();
  bathDomObserver?.disconnect();
  bathDomObserver=new MutationObserver(()=>watchBathScreen());
  bathDomObserver.observe(document.body,{childList:true,subtree:true});
};
function launch(event){
  lastOpener=event?.currentTarget||document.activeElement;
  hideInvite();
  if(validAnswers(state.answers)){state.view='results'}else{state.view='question';state.step=question.findIndex(q=>!state.answers[q.key]);if(state.step<0)state.step=0}
  shownThisVisit=true;interacted=true;try{sessionStorage.setItem(inviteShownSessionKey,'1')}catch{}dialog.showModal();fitViewport();render();trace('dp_quiz_start');
}
function close(){
  if(dialog.open)dialog.close();
}
function commonHeader(){
  return '<div class="dp-quiz-head"><span class="dp-quiz-kicker">ДачаПар · ваша баня</span><button type="button" class="dp-quiz-close" data-dpq="close" aria-label="Закрыть подбор">×</button></div>';
}
function progress(){
  return '<div class="dp-quiz-progress-label">Шаг '+(state.step+1)+' из 3</div><div class="dp-quiz-progress" role="progressbar" aria-label="Шаги подбора" aria-valuemin="0" aria-valuemax="3" aria-valuenow="'+(state.step+1)+'">'+[0,1,2].map(i=>'<span class="'+(i<=state.step?'is-active':'')+'"></span>').join('')+'</div>';
}
function questionView(){
  const q=question[state.step];
  const rows=q.options.map(([value,title,desc])=>'<button type="button" class="dp-quiz-choice '+(state.answers[q.key]===value?'is-selected':'')+'" data-dpq="answer" data-value="'+value+'" aria-pressed="'+(state.answers[q.key]===value)+'"><span class="dp-quiz-choice-text"><strong>'+safe(title)+'</strong><small>'+safe(desc)+'</small></span><span class="dp-quiz-circle" aria-hidden="true">'+(state.answers[q.key]===value?'✓':'')+'</span></button>').join('');
  return commonHeader()+progress()+'<h2 id="dp-quiz-title">'+safe(q.title)+'</h2>'+(q.description?'<p class="dp-quiz-copy">'+safe(q.description)+'</p>':'')+'<div class="dp-quiz-choices" role="group" aria-label="'+safe(q.title)+'">'+rows+'</div><div class="dp-quiz-foot">'+(state.step>0?'<button type="button" class="dp-quiz-link" data-dpq="back">← Назад</button>':'<span></span>')+'</div>';
}
function modelCard(offer){
  const photo=models[offer.model],name=photo.name;
  const size=offer.model==='kvadro-house'?houseSizeLabel(offer):offer.firstSize==='500'&&offer.lastSize==='600'?'5–6 м':(Number(offer.firstSize)/100)+' м';
  const description=state.answers.bedroom==='b_yes'?'Со спальней и помывочной':offer.model==='kvadro-house'?'Парная, помывочная, комната отдыха':state.answers.wash==='w_compare'?'Есть варианты с помывочной и без неё':state.answers.wash==='w_yes'?'С отдельной помывочной':'С парной и комнатой отдыха';
  return '<article class="dp-quiz-plan"><img class="dp-quiz-plan-photo" src="'+safe(photo.photo)+'" width="960" height="720" alt="Баня '+safe(name)+'" loading="lazy" decoding="async"><div class="dp-quiz-plan-body"><div class="dp-quiz-plan-title">'+safe(name)+' · '+safe(size)+'</div><p class="dp-quiz-plan-description">'+safe(description)+'</p><div class="dp-quiz-plan-price">'+offerPrice(offer)+'</div></div></article>';
}

function houseSizeLabel(offer){
 const dictionary={'4x4':'4 × 4 м','5x4':'4 × 5 м','6x4':'4 × 6 м','6x5':'5 × 6 м','6x6':'6 × 6 м'};
 const a=dictionary[offer.firstSize]||offer.firstSize;
 const b=dictionary[offer.lastSize]||offer.lastSize;
 return a===b?a:a+' — '+b;
}
function houseOrStandard(offer){return offer.model==='kvadro-house'?houseSizeLabel(offer):offer.firstSize==='500'&&offer.lastSize==='600'?'5–6 м':Number(offer.firstSize)/100+' м';}
function resultsView(){
  const found=recommendModelRanges(quiz.plans,state.answers,book,quiz.priceRules);
  const pills=[({p2:'1–2 человека',p4:'До 4 человек',p6:'5–6 человек',p8:'До 8 человек'})[state.answers.party],({w_yes:'С помывочной',w_no:'Без отдельной помывочной',w_compare:'Сравнить оба варианта'})[state.answers.wash],state.answers.bedroom==='b_yes'?'Со спальней':'Без спальни'].map(x=>'<span class="dp-quiz-pill">'+safe(x)+'</span>').join('');
  const compromise=found.compromise?'<p class="dp-quiz-results-note">Со спальней доступны варианты с отдельной помывочной.</p>':'';
  return '<div class="dp-quiz-results-top">'+commonHeader()+'<div class="dp-quiz-result-heading"><h2 id="dp-quiz-title">Вот какие бани вам подойдут</h2><button type="button" class="dp-quiz-link" data-dpq="edit">Изменить ответы</button></div><div class="dp-quiz-pillbar">'+pills+'</div>'+compromise+'</div>'+
    '<div class="dp-quiz-results-scroll"><div class="dp-quiz-results">'+found.offers.map(modelCard).join('')+'</div><p class="dp-quiz-price-note">Окончательная цена зависит от комплектации и планировки. Доставка рассчитывается отдельно.</p></div>'+
    '<div class="dp-quiz-cta"><div class="dp-quiz-cta-copy"><strong>Подходящие варианты уже найдены</strong><p>Пришлём подробности в удобный мессенджер.</p></div><button type="button" class="dp-quiz-action dp-quiz-cta-primary" data-dpq="form"><span class="dp-quiz-cta-percent" aria-hidden="true">₽</span><span class="dp-quiz-cta-label">Получить планировки и комплектации с ценами <b>+ скидку 20 000 ₽ на «Делюкс»</b></span><span class="dp-quiz-cta-arrow" aria-hidden="true">→</span></button><p class="dp-quiz-cta-condition">Скидка 20 000 ₽ — при выборе комплектации «Делюкс».</p></div>';
}
function formView(){
  const options=[['max','MAX'],['whatsapp','WhatsApp'],['telegram','Telegram']].map(([value,label])=>'<label class="dp-quiz-channel"><input type="radio" name="channel" value="'+value+'" required '+(state.channel===value?'checked':'')+'><span>'+label+'</span></label>').join('');
  return commonHeader()+'<button type="button" class="dp-quiz-link" data-dpq="results">← К подборке</button><h2 id="dp-quiz-title">Куда прислать планировки, комплектации и цены?</h2><form id="dp-quiz-contact-form"><label class="dp-quiz-field" for="dp-quiz-phone">Номер телефона<input id="dp-quiz-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="+7 (999) 123-45-67" required value="'+safe(state.phone)+'"></label><label class="dp-quiz-field" for="dp-quiz-city">Город установки бани (необязательно)<input id="dp-quiz-city" name="city" type="text" autocomplete="address-level2" maxlength="140" placeholder="Например, Переславль-Залесский" value="'+safe(state.city)+'"></label><fieldset class="dp-quiz-channel-field"><legend>Выберите мессенджер</legend><div class="dp-quiz-channels">'+options+'</div></fieldset><p class="dp-quiz-form-note">Нажимая «Получить планировки и цены», вы соглашаетесь с <a href="/consent.html" target="_blank" rel="noopener">обработкой персональных данных</a>. <a href="/privacy.html" target="_blank" rel="noopener">Политика конфиденциальности</a>.</p><p class="dp-quiz-error" role="alert" '+(state.error?'':'hidden')+'>'+safe(state.error)+'</p><button class="dp-quiz-action" type="submit" '+(state.sending?'disabled':'')+'>'+(state.sending?'Отправляем…':'Получить планировки и цены →')+'</button></form>';
}
function successView(){
  const name=({max:'MAX',whatsapp:'WhatsApp',telegram:'Telegram'})[state.channel]||'выбранный мессенджер';
  return commonHeader()+'<div class="dp-quiz-good" aria-hidden="true">✓</div><h2 id="dp-quiz-title">Ваши пожелания получили</h2><p class="dp-quiz-copy">Свяжемся с вами в '+name+' и пришлём подходящие планировки, комплектации и цены. Если не получится написать, позвоним.</p><button type="button" class="dp-quiz-action" data-dpq="close">Вернуться на сайт</button>';
}
function focusTitle(main){const title=$('#dp-quiz-title',main);if(title){title.tabIndex=-1;title.focus({preventScroll:true});}}
function fitViewport(){
 if(!dialog?.open||!matchMedia('(max-width:760px)').matches)return;
 const v=window.visualViewport;dialog.style.setProperty('--dpq-height',(v?.height||innerHeight)+'px');dialog.style.setProperty('--dpq-top',(v?.offsetTop||0)+'px');
 const active=document.activeElement,main=$('.dp-quiz-main',dialog);
 if(main&&active?.matches('input,select,textarea')&&dialog.contains(active)){const r=active.getBoundingClientRect(),b=main.getBoundingClientRect();if(r.bottom>b.bottom-20)main.scrollTop+=r.bottom-b.bottom+20;}
}
function render(){
  const frame=$('.dp-quiz-frame',dialog),main=$('.dp-quiz-main',dialog);
  frame.className='dp-quiz-frame '+(state.view==='question'?'':('is-'+state.view));
  const photo=$('.dp-quiz-photo',frame);
  photo.hidden=state.view!=='question';
  if(state.view==='question'){
    const img=$('img',photo), src=questionPhotos[state.step];
    if(img.getAttribute('src')!==src)img.src=src;
  }
  main.innerHTML=state.view==='question'?questionView():state.view==='results'?resultsView():state.view==='form'?formView():successView();
  main.scrollTop=0;
  if(state.view==='form'){const input=$('#dp-quiz-phone',main);attachPhoneMask(input);if(!matchMedia('(max-width:760px)').matches)input.focus({preventScroll:true});else focusTitle(main);}
  else focusTitle(main);
  fitViewport();
}
function newAnswer(value){
  const q=question[state.step];if(!q.options.some(o=>o[0]===value))return;
  state.answers[q.key]=value;save();state.selectedCode=null;state.expanded=false;
  trace('dp_quiz_answer',{step:state.step+1,variant:value});
  if(state.step<2){state.step++;state.view='question';}else{state.view='results';if(!state.completedNotified){trace('dp_quiz_completed');state.completedNotified=true;}trace('dp_quiz_result');}
  render();
}
async function submitForm(form){
  if(state.sending)return;
  const field=$('#dp-quiz-phone',form);state.phone=field.value;state.city=($('#dp-quiz-city',form)?.value||'').replace(/\s+/g,' ').trim().slice(0,140);
  state.channel=new FormData(form).get('channel')||'';
  if(!['max','whatsapp','telegram'].includes(state.channel)){state.error='Выберите мессенджер.';render();return;}
  try{
    if(!settings||!settings.lead?.enabled)throw new Error('LEAD_NOT_CONNECTED');
    const requestId=state.requestId||crypto.randomUUID();
    const payload=buildCallback({phone:state.phone,name:''},requestId);
    payload.purpose='quiz_catalog';
    payload.contactChannel=state.channel;
    state.requestId=requestId;
    const found=recommendModelRanges(quiz.plans,state.answers,book,quiz.priceRules);
    const ids=found.offers.map(o=>models[o.model].name+' '+houseOrStandard(o)+' ['+o.codes[0]+(o.codes.length>1?', '+o.codes[o.codes.length-1]:'')+']').join('; ');
    const selected='';
    const count=({p2:'1–2',p4:'3–4',p6:'5–6',p8:'до 8'})[state.answers.party];
    const wash=({w_yes:'отдельная нужна',w_no:'не нужна',w_compare:'сравнить оба'})[state.answers.wash];
    const bed=state.answers.bedroom==='b_yes'?'нужна':'не нужна';
    payload.comment=('Квиз: отправить подходящие планировки, комплектации и цены. Город установки: '+(state.city||'не указан')+'. Скидка 20 000 ₽ только на Делюкс. Гостей '+count+'; помывочная '+wash+'; спальня '+bed+'. Варианты: '+ids+selected+'. Мессенджер: '+({max:'MAX',whatsapp:'WhatsApp',telegram:'Telegram'})[state.channel]+'.').slice(0,490);
    payload.journeyContext={purpose:'selection_help',pagePath:location.pathname};
    const attribution=analytics?.attribution?.();if(attribution)payload.attribution=attribution;
    state.error='';state.sending=true;render();
    trace('dp_form_submit_attempt',{flow:'callback',purpose:'selection_help'});
    trace('dp_quiz_submit_attempt');
    const sent=await submitLead(payload,settings,location.origin);
    state.sending=false;state.view='success';state.success=true;save();
    const baseCounted=analytics?.confirmed?.(sent.receipt,{flow:'callback',requestId:payload.requestId,purpose:'selection_help',placement:'catalog'})===true;
    if(baseCounted){trace('dp_quiz_lead_confirmed');if(isPereslavlCity(state.city))trace('dp_quiz_lead_pereslavl_confirmed');}
    trace('dp_quiz_catalog_sent');render();hideInvite();
  }catch(error){
    state.sending=false;
    state.error=error.message==='PHONE_INVALID'?'Проверьте номер телефона.':error.message==='RATE_LIMITED'?'Слишком много попыток. Попробуйте позже.':error.message==='LEAD_NOT_CONNECTED'?'Сервис заявок сейчас недоступен. Позвоните нам по телефону на сайте.':'Не удалось отправить запрос. Попробуйте ещё раз.';
    trace('dp_form_error',{flow:'callback',error_type:error.message==='PHONE_INVALID'?'validation':'network'});render();
  }
}
function bind(){
  dialog.addEventListener('click',event=>{
    if(event.target===dialog){close();return;}
    const btn=event.target.closest('[data-dpq]');if(!btn)return;
    const action=btn.dataset.dpq;
    if(action==='close')return close();
    if(action==='answer')return newAnswer(btn.dataset.value);
    if(action==='back'){state.step=Math.max(0,state.step-1);state.view='question';return render();}
    if(action==='edit'){state.step=0;state.view='question';return render();}
    if(action==='results'){state.view='results';return render();}
    if(action==='form'){state.view='form';trace('dp_quiz_catalog_cta');return render();}
  });
  dialog.addEventListener('submit',e=>{if(e.target?.id==='dp-quiz-contact-form'){e.preventDefault();submitForm(e.target)}});
  dialog.addEventListener('change',e=>{if(e.target?.name==='channel'){state.channel=e.target.value;state.requestId=null;}});
  dialog.addEventListener('input',e=>{if(e.target?.id==='dp-quiz-phone'){state.phone=e.target.value;state.requestId=null;}if(e.target?.id==='dp-quiz-city'){state.city=e.target.value;state.requestId=null;}});
  window.visualViewport?.addEventListener('resize',fitViewport,{passive:true});
  window.visualViewport?.addEventListener('scroll',fitViewport,{passive:true});
  dialog.addEventListener('focusin',()=>requestAnimationFrame(fitViewport));
  dialog.addEventListener('close',()=>{if(!state.success){trace(state.view==='question'?'dp_quiz_close_before_completed':'dp_quiz_close_after_completed');}state.error='';try{lastOpener?.focus?.({preventScroll:true})}catch{};});
  invite.querySelector('[data-dpq-open]').addEventListener('click',launch);
  invite.querySelector('[data-dpq-hide]').addEventListener('click',()=>hideInvite(true));
  invite.addEventListener('cancel',event=>{event.preventDefault();hideInvite(true)});
  invite.addEventListener('click',event=>{if(event.target===invite)hideInvite(true)});
  launcher.addEventListener('click',launch);
  document.addEventListener('click',e=>{if(e.target.closest('#configure,#home-plans,[data-model-card],[data-flow],[data-preset],[data-inquiry],[data-save-choice],[data-size-picker],#contact-dialog,#gallery-dialog,#inquiry-dialog')){interacted=true;cancelModelsIdle()}},{capture:true,passive:true});
  // Exactly two automatic entry points: models idle, and the editorial 'ВАША БАНЯ' screen.
  window.addEventListener('scroll',handleScroll,{passive:true});
  // Anchored jumps and restored pages may not emit a fresh scroll event.
  window.addEventListener('hashchange',()=>requestAnimationFrame(()=>{watchBathScreen();handleScroll()}));
  window.addEventListener('pageshow',()=>requestAnimationFrame(()=>{watchBathScreen();handleScroll()}));
  for(const type of ['pointermove','pointerdown','keydown','touchstart','touchmove','wheel']){
    window.addEventListener(type,handleActivity,{passive:true});
  }
  document.addEventListener('visibilitychange',()=>{cancelModelsIdle();if(!document.hidden)handleScroll()});
  observeLateBathScreen();
  // Covers restored scroll position, anchor navigation, and late loading.
  handleScroll();
}
async function init(){
  if(!$('#models')||$('#dp-quiz-dialog'))return;
  try{
    const [a,b,c]=await Promise.all([fetch('/data/quiz-v1.json',{cache:'no-cache'}),fetch('/data/catalog-pricebook.json',{cache:'no-cache'}),fetch('/data/site-settings.json',{cache:'no-cache'})]);
    if(!a.ok||!b.ok||!c.ok)throw new Error('QUIZ_FETCH_FAIL');
    quiz=await a.json();const comfortBook=await b.json();settings=await c.json();
    if(Object.values(quiz.deluxePrices||{}).reduce((n,m)=>n+Object.keys(m).length,0)!==20)throw new Error('QUIZ_DELUXE_DATA_INVALID');
    book={...comfortBook,deluxePrices:quiz.deluxePrices}; // Quiz-only snapshot; public Comfort catalog stays byte-identical.
    if(quiz.plans?.length!==41||quiz.priceRules?.assertComfortPriceFromExistingPricebook!==true)throw new Error('QUIZ_DATA_INVALID');
    if(settings.lead?.requiredPricebookVersion!==book.version)throw new Error('QUIZ_PRICEBOOK_VERSION');
    analytics?.start(settings);
    load();let alreadyShown=false;try{alreadyShown=sessionStorage.getItem(inviteShownSessionKey)==='1'}catch{}shownThisVisit=alreadyShown;
    // No additional card above the catalog or inside main. A small manual
    // entry is mounted exclusively in the actual page footer.
    const footer=$('footer.site-footer')||$('footer');
    if(!footer)throw new Error('QUIZ_FOOTER_MISSING');
    const mounted=$('[data-quiz-mount]');
    if(mounted)mounted.remove();
    const oldEntry=$('.dp-quiz-entry');
    if(oldEntry)oldEntry.remove();
    const entry=document.createElement('div');
    entry.className='dp-quiz-footer-cta';
    entry.innerHTML='<button type="button" class="dp-quiz-action" id="dp-quiz-open">Подобрать баню за 3 шага <span aria-hidden="true">→</span></button>';
    footer.append(entry);
    launcher=$('#dp-quiz-open');
    invite=document.createElement('dialog');invite.className='dp-quiz-invite';invite.setAttribute('aria-labelledby','dp-quiz-invite-title');
    invite.innerHTML='<div class="dp-quiz-invite-layout"><div class="dp-quiz-invite-visual"><img class="dp-quiz-invite-photo" src="/r101/assets/parus-editorial-960.webp" alt="Готовая баня на загородном участке" width="960" height="720" decoding="async"></div><div class="dp-quiz-invite-inner"><button type="button" class="dp-quiz-invite-close" data-dpq-hide aria-label="Закрыть предложение">×</button><span class="dp-quiz-invite-kicker">ДачаПар · поможем с выбором</span><h2 id="dp-quiz-invite-title">Какая баня подойдёт вам?</h2><p>Ответьте на три коротких вопроса. Покажем подходящие бани и цены, а подробные планировки пришлём в мессенджер.</p><div class="dp-quiz-invite-stages" aria-label="Три вопроса"><span><b>01</b> Сколько гостей</span><span><b>02</b> Помывочная</span><span><b>03</b> Ночёвка</span></div><button type="button" class="dp-quiz-action" data-dpq-open>Подобрать баню <span aria-hidden="true">→</span></button></div></div>';
    dialog=document.createElement('dialog');dialog.id='dp-quiz-dialog';dialog.setAttribute('aria-labelledby','dp-quiz-title');
    dialog.innerHTML='<div class="dp-quiz-frame"><div class="dp-quiz-photo" aria-hidden="true"><img src="/assets/quiz/step1-steamroom.webp" width="508" height="764" alt=""></div><div class="dp-quiz-main"></div></div>';
    document.body.append(invite,dialog);bind();
  }catch(error){console.warn('DachaPar quiz inactive:',error.message);}
}
init();

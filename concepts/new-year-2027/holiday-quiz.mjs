import {ANSWERS,validAnswers,guestExplanation,recommendModelRanges} from '/quiz-engine.mjs?v=r108-ranges';
import {buildCallback,submitLead} from '/lead-client.mjs';
import {attachPhoneMask} from '/phone-mask.mjs';
import {analytics} from '/analytics-core.mjs';

const $=(selector,root=document)=>root.querySelector(selector);
// The three editorial photos are approved for this quiz. They illustrate the experience,
// not documented interiors of any particular production bathhouse.
const questionPhotos=Object.freeze([
  './assets/winter-house-960.webp',
  './assets/winter-sauna-960.webp',
  './assets/winter-parus-960.webp'
]);
const models={
  kvadro:{name:'Квадро',photo:'./assets/winter-sauna-960.webp',description:'Отдельная парная и комната отдыха. Ширина корпуса — 2,1 м.'},
  viking:{name:'Викинг',photo:'./assets/winter-viking-960.webp',description:'Отдельная парная и комната отдыха. Ширина корпуса — 2,4 м.'},
  parus:{name:'Парус',photo:'./assets/winter-parus-960.webp',description:'Прямые стены и отдельная парная. Ширина корпуса — 2,4 м.'},
  'kvadro-house':{name:'Квадро Хаус',photo:'./assets/winter-house-960.webp',description:'Когда после парной хочется остаться подольше и никуда не торопиться.'}
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

const liveKey='dp_ny2027_quiz_answers_v1',inviteShownSessionKey='dp_ny2027_quiz_invite_seen_session';
const state={step:0,view:'question',answers:{},selectedCode:null,expanded:false,sending:false,phone:'',city:'',channel:'',error:'',success:false,completedNotified:false,requestId:null};
let quiz=null,book=null,settings=null,dialog=null,invite=null,launcher=null,interacted=false,shownThisVisit=false,lastOpener=null;
let visibleRemainingMs=8000,visibleStartedAt=0,visibleTimer=null,deadlineReached=false;
const trace=(name,params={})=>{try{analytics?.track(name,{placement:'new_year_2027',...params})}catch{}};
const isPereslavlCity=value=>{
  const city=String(value||'').normalize('NFKC').toLocaleLowerCase('ru-RU')
    .replace(/ё/g,'е').replace(/[.,\-–—]/g,' ').replace(/\s+/g,' ').trim();
  return /^(?:г |город )?переславль(?: залесский)?(?: ярославская (?:обл|область))?$/u.test(city);
};

const save=()=>{try{sessionStorage.setItem(liveKey,JSON.stringify(state.answers))}catch{}};
const load=()=>{try{const a=JSON.parse(sessionStorage.getItem(liveKey)||'{}');if(a&&typeof a==='object')state.answers={party:ANSWERS.party.includes(a.party)?a.party:undefined,wash:ANSWERS.wash.includes(a.wash)?a.wash:undefined,bedroom:ANSWERS.bedroom.includes(a.bedroom)?a.bedroom:undefined}}catch{}};
const stopVisibleClock=()=>{
  if(visibleTimer!==null){clearTimeout(visibleTimer);visibleTimer=null}
  if(visibleStartedAt){visibleRemainingMs=Math.max(0,visibleRemainingMs-(performance.now()-visibleStartedAt));visibleStartedAt=0}
};
const hideInvite=(dismissed=false)=>{
  const wasOpen=!!invite?.open;
  if(wasOpen)invite.close();
  if(dismissed&&wasOpen){
    shownThisVisit=true;
    try{sessionStorage.setItem(inviteShownSessionKey,'1')}catch{}
    trace('dp_quiz_invite_close');trace('dp_quiz_close_before_completed');
  }
};
const maybeInvite=()=>{
  if(!invite||shownThisVisit||document.hidden||dialog?.open||document.querySelector('dialog[open]'))return false;
  try{invite.showModal()}catch(error){console.warn('NY2027 quiz invite unavailable:',error);return false}
  shownThisVisit=true;
  try{sessionStorage.setItem(inviteShownSessionKey,'1')}catch{}
  stopVisibleClock();
  trace('dp_quiz_invite_view',{reason:'eight_seconds_on_new_year_page'});
  return true;
};
const runVisibleClock=()=>{
  if(shownThisVisit||document.hidden||visibleTimer!==null)return;
  if(deadlineReached||visibleRemainingMs<=0){deadlineReached=true;maybeInvite();return}
  visibleStartedAt=performance.now();
  visibleTimer=setTimeout(()=>{
    stopVisibleClock();
    deadlineReached=true;
    maybeInvite();
  },visibleRemainingMs);
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
  return '<div class="dp-quiz-head"><span class="dp-quiz-kicker">ДачаПар · Новый год 2027</span><button type="button" class="dp-quiz-close" data-dpq="close" aria-label="Закрыть подбор">×</button></div>';
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
    payload.comment=('Источник: квиз новый год. Новый год 2027. Отправить подходящие планировки, комплектации и цены. Город установки: '+(state.city||'не указан')+'. Скидка 20 000 ₽ только на Делюкс. Гостей '+count+'; помывочная '+wash+'; спальня '+bed+'. Варианты: '+ids+selected+'. Мессенджер: '+({max:'MAX',whatsapp:'WhatsApp',telegram:'Telegram'})[state.channel]+'.').slice(0,490);
    payload.journeyContext={purpose:'selection_help',pagePath:'/novyy-god/'};
    const attribution=analytics?.attribution?.();if(attribution)payload.attribution=attribution;
    state.error='';state.sending=true;render();
    trace('dp_form_submit_attempt',{flow:'callback',purpose:'selection_help'});
    trace('dp_quiz_submit_attempt');
    const sent=await submitLead(payload,settings,location.origin);
    state.sending=false;state.view='success';state.success=true;save();
    analytics?.confirmed?.(sent.receipt,{flow:'callback',requestId:payload.requestId,purpose:'selection_help',placement:'new_year_2027',quiz:true,pereslavl:isPereslavlCity(state.city)});
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
  dialog.addEventListener('close',()=>{
    if(!state.success)trace(state.completedNotified||state.view!=='question'?'dp_quiz_close_after_completed':'dp_quiz_close_before_completed');
    state.error='';
    try{lastOpener?.focus?.({preventScroll:true})}catch{}
  });
  invite.querySelector('[data-dpq-open]').addEventListener('click',launch);
  invite.querySelector('[data-dpq-hide]').addEventListener('click',()=>hideInvite(true));
  invite.addEventListener('cancel',event=>{event.preventDefault();hideInvite(true)});
  invite.addEventListener('click',event=>{if(event.target===invite)hideInvite(true)});
  launcher.addEventListener('click',launch);
  // Eight seconds of actual visible time on /novyy-god/, not idle time, scroll or percent.
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)stopVisibleClock();else runVisibleClock();
  });
  document.querySelector('#lead-dialog')?.addEventListener('close',()=>{
    if(deadlineReached)maybeInvite();
  });
  window.addEventListener('pageshow',()=>{if(!document.hidden)runVisibleClock()});
  runVisibleClock();
}
async function init(){
  if(!location.pathname.startsWith('/novyy-god/')||$('#dp-quiz-dialog'))return;
  try{
    const [a,b,c]=await Promise.all([
      fetch('/data/quiz-v1.json',{cache:'no-cache'}),
      fetch('/data/catalog-pricebook.json',{cache:'no-cache'}),
      fetch('/data/site-settings.json',{cache:'no-cache'})
    ]);
    if(!a.ok||!b.ok||!c.ok)throw new Error('QUIZ_FETCH_FAIL');
    quiz=await a.json();const comfortBook=await b.json();settings=await c.json();
    if(Object.values(quiz.deluxePrices||{}).reduce((n,m)=>n+Object.keys(m).length,0)!==20)throw new Error('QUIZ_DELUXE_DATA_INVALID');
    book={...comfortBook,deluxePrices:quiz.deluxePrices};
    if(quiz.plans?.length!==41||quiz.priceRules?.assertComfortPriceFromExistingPricebook!==true)throw new Error('QUIZ_DATA_INVALID');
    if(settings.lead?.requiredPricebookVersion!==book.version)throw new Error('QUIZ_PRICEBOOK_VERSION');
    analytics?.start(settings);
    load();
    try{shownThisVisit=sessionStorage.getItem(inviteShownSessionKey)==='1'}catch{}
    const footerLinks=$('footer .footer-links');
    if(!footerLinks)throw new Error('QUIZ_FOOTER_MISSING');
    launcher=document.createElement('button');
    launcher.type='button';
    launcher.id='dp-quiz-open';
    launcher.className='dp-ny-quiz-manual';
    launcher.textContent='Подобрать баню за 3 шага';
    footerLinks.append(launcher);
    invite=document.createElement('dialog');invite.className='dp-quiz-invite dp-ny-quiz-invite';invite.setAttribute('aria-labelledby','dp-quiz-invite-title');
    invite.innerHTML='<div class="dp-quiz-invite-layout"><div class="dp-quiz-invite-visual"><img class="dp-quiz-invite-photo" src="./assets/winter-viking-960.webp" alt="Готовая баня в праздничном зимнем лесу" width="960" height="720" decoding="async"></div><div class="dp-quiz-invite-inner"><button type="button" class="dp-quiz-invite-close" data-dpq-hide aria-label="Закрыть предложение">×</button><span class="dp-quiz-invite-kicker">ДачаПар · Новый год 2027</span><h2 id="dp-quiz-invite-title">Какая баня подойдёт вам?</h2><p>Ответьте на три коротких вопроса. Покажем подходящие бани и цены, а планировки пришлём в мессенджер.</p><div class="dp-quiz-invite-stages" aria-label="Три вопроса"><span><b>01</b> Сколько гостей</span><span><b>02</b> Помывочная</span><span><b>03</b> Ночёвка</span></div><button type="button" class="dp-quiz-action" data-dpq-open>Подобрать баню <span aria-hidden="true">→</span></button></div></div>';
    dialog=document.createElement('dialog');dialog.id='dp-quiz-dialog';dialog.className='dp-ny-quiz-dialog';dialog.setAttribute('aria-labelledby','dp-quiz-title');
    dialog.innerHTML='<div class="dp-quiz-frame"><div class="dp-quiz-photo" aria-hidden="true"><img src="./assets/winter-house-960.webp" width="960" height="720" alt=""></div><div class="dp-quiz-main"></div></div>';
    document.body.append(invite,dialog);
    bind();
  }catch(error){console.warn('DachaPar NY2027 quiz inactive:',error.message);}
}
init();

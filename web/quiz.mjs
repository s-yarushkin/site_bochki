import {ANSWERS,validAnswers,guestExplanation,recommendModelRanges} from './quiz-engine.mjs?v=r108-ranges';
import {buildCallback,submitLead} from './lead-client.mjs?v=r100-20261027';
import {attachPhoneMask} from './phone-mask.mjs';
import {analytics} from './analytics-core.mjs';

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
const modelRoutes={kvadro:'/bani/kvadro/',parus:'/bani/parus/',viking:'/bani/viking/','kvadro-house':'/bani/kvadro-haus/'};
const modelPlanRoutes=Object.fromEntries(Object.keys(modelRoutes).map(key=>[key,'/planirovki/?model='+encodeURIComponent(key)]));
function previewPlans(offer){
  const available=offer.plans.filter(p=>p.image&&p.sitePlanId);
  if(!available.length)return [];
  const picks=[available[0]];
  const distinct=available.find(p=>p.size!==picks[0].size||p.wash!==picks[0].wash);
  if(distinct)picks.push(distinct);
  return picks;
}
const liveKey='dp_quiz_answers_v1',hiddenKey='dp_quiz_invite_suppressed_until_v1';
// Invitе is non-modal: the full quiz opens only when the visitor clicks its button.
const inviteDelayMs=10000,inviteScrollFraction=0.35;
const state={step:0,view:'question',answers:{},selectedCode:null,expanded:false,sending:false,phone:'',channel:'',error:'',success:false,requestId:null};
let quiz=null,book=null,settings=null,dialog=null,invite=null,launcher=null,scrollSeen=false,interacted=false,shownThisVisit=false,startedAt=Date.now(),lastOpener=null;
const trace=(name,params={})=>{try{analytics?.track(name,{placement:'catalog',...params})}catch{}};
const save=()=>{try{sessionStorage.setItem(liveKey,JSON.stringify(state.answers))}catch{}};
const load=()=>{try{const a=JSON.parse(sessionStorage.getItem(liveKey)||'{}');if(a&&typeof a==='object')state.answers={party:ANSWERS.party.includes(a.party)?a.party:undefined,wash:ANSWERS.wash.includes(a.wash)?a.wash:undefined,bedroom:ANSWERS.bedroom.includes(a.bedroom)?a.bedroom:undefined}}catch{}};
const hideInvite=(dismissed=false)=>{if(invite?.open)invite.close();if(dismissed){shownThisVisit=true;try{localStorage.setItem(hiddenKey,String(Date.now()+7*86400000))}catch{}trace('dp_quiz_invite_close')}};
const canInvite=()=>{let until=0;try{until=Number(localStorage.getItem(hiddenKey)||0)}catch{}
  let savedChoice=false;try{savedChoice=!!JSON.parse(localStorage.getItem('dp_r101_choice')||'null')}catch{}
  return !shownThisVisit && !savedChoice && Date.now()>until && !dialog?.open && !document.querySelector('dialog[open]') && document.visibilityState==='visible' && !interacted && Date.now()-startedAt>=inviteDelayMs && !location.hash && !document.activeElement?.matches?.('input,textarea,select');};
const maybeInvite=()=>{if(!canInvite()||!scrollSeen||!invite)return;shownThisVisit=true;invite.showModal();trace('dp_quiz_invite_view')};
function launch(event){
  lastOpener=event?.currentTarget||document.activeElement;
  hideInvite();
  if(validAnswers(state.answers)){state.view='results'}else{state.view='question';state.step=question.findIndex(q=>!state.answers[q.key]);if(state.step<0)state.step=0}
  shownThisVisit=true;interacted=true;dialog.showModal();fitViewport();render();trace('dp_quiz_start');
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
  const layoutItems=previewPlans(offer).map(plan=>{
    const sizeName=offer.model==='kvadro-house'?({'4x4':'4 × 4 м','5x4':'4 × 5 м','6x4':'4 × 6 м','6x5':'5 × 6 м','6x6':'6 × 6 м'}[plan.size]||plan.size):Number(plan.size)/100+' м';
    const label=sizeName+(plan.wash==='Отдельная'?' · с помывочной':'');
    return '<button type="button" class="dp-quiz-layout-preview" data-dpq="plan" data-code="'+safe(plan.code)+'" aria-label="Открыть планировку '+safe(name)+' '+safe(label)+'"><img src="'+safe(plan.image)+'" alt="" width="210" height="130" loading="lazy" decoding="async"><span>'+safe(label)+'</span></button>';
  }).join('');
  const description=state.answers.bedroom==='b_yes'?'Со спальней и помывочной':offer.model==='kvadro-house'?'Парная, помывочная, комната отдыха':state.answers.wash==='w_compare'?'Есть разные варианты помывочной':state.answers.wash==='w_yes'?'С отдельной помывочной':'С парной и комнатой отдыха';
  return '<article class="dp-quiz-plan"><a class="dp-quiz-model-link" href="'+safe(modelRoutes[offer.model])+'" target="_blank" rel="noopener" aria-label="Подробнее о бане '+safe(name)+'"><img class="dp-quiz-plan-photo" src="'+safe(photo.photo)+'" width="960" height="720" alt="Баня '+safe(name)+'" loading="lazy" decoding="async"></a><div class="dp-quiz-plan-body"><div class="dp-quiz-plan-title"><a href="'+safe(modelRoutes[offer.model])+'" target="_blank" rel="noopener">'+safe(name)+' · '+safe(size)+'</a></div><p class="dp-quiz-plan-description">'+safe(description)+'</p><div class="dp-quiz-plan-price">'+offerPrice(offer)+'</div><div class="dp-quiz-layout-row">'+layoutItems+'</div><a class="dp-quiz-layout-all" href="'+safe(modelPlanRoutes[offer.model])+'" target="_blank" rel="noopener">Все планировки ↗</a></div></article>';
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
    '<div class="dp-quiz-cta"><div class="dp-quiz-cta-copy"><strong>Пришлём вам подробные планировки, комплектации и цены</strong><p>С учётом ваших пожеланий и выбранных вариантов.</p></div><button type="button" class="dp-quiz-action dp-quiz-cta-primary" data-dpq="form"><span class="dp-quiz-cta-percent" aria-hidden="true">%</span><span>Получить предложение <b>со скидкой 20 000 ₽</b></span><span aria-hidden="true">→</span></button><p class="dp-quiz-cta-condition">Скидка 20 000 ₽ — при выборе комплектации «Делюкс».</p></div>';
}
function planDetailView(){
  const offers=recommendModelRanges(quiz.plans,state.answers,book,quiz.priceRules).offers;
  const candidate=offers.flatMap(x=>x.plans).find(p=>p.code===state.selectedCode&&p.image&&p.sitePlanId);
  if(!candidate){state.view='results';return resultsView()}
  const house={'4x4':'4 × 4','5x4':'4 × 5','6x4':'4 × 6','6x5':'5 × 6','6x6':'6 × 6'};
  const size=candidate.model==='kvadro-house'?(house[candidate.size]||candidate.size):String(Number(candidate.size)/100);
  return commonHeader()+'<button type="button" class="dp-quiz-link" data-dpq="results">← Все варианты</button><h2 id="dp-quiz-title">Планировка '+safe(models[candidate.model].name)+' · '+safe(size)+' м</h2><p class="dp-quiz-copy">Пример расстановки помещений. Подробности и комплектацию уточним при подборе.</p><div class="dp-quiz-plan-viewport"><img class="dp-quiz-detail-image" src="'+safe(candidate.image)+'" alt="Планировка бани '+safe(models[candidate.model].name)+' '+safe(size)+' м" loading="eager"></div><a class="dp-quiz-layout-all" href="'+safe(modelPlanRoutes[candidate.model])+'" target="_blank" rel="noopener">Смотреть остальные планировки ↗</a>';
}

function formView(){
  const options=[['max','MAX'],['whatsapp','WhatsApp'],['telegram','Telegram']].map(([value,label])=>'<label class="dp-quiz-channel"><input type="radio" name="channel" value="'+value+'" required '+(state.channel===value?'checked':'')+'><span>'+label+'</span></label>').join('');
  return commonHeader()+'<button type="button" class="dp-quiz-link" data-dpq="results">← К подборке</button><h2 id="dp-quiz-title">Куда отправить планировки и предложение со скидкой?</h2><form id="dp-quiz-contact-form"><label class="dp-quiz-field" for="dp-quiz-phone">Номер телефона<input id="dp-quiz-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="+7 (999) 123-45-67" required value="'+safe(state.phone)+'"></label><fieldset class="dp-quiz-channel-field"><legend>Выберите мессенджер</legend><div class="dp-quiz-channels">'+options+'</div></fieldset><p class="dp-quiz-form-note">Нажимая «Получить предложение», вы соглашаетесь с <a href="/consent.html" target="_blank" rel="noopener">обработкой персональных данных</a>. <a href="/privacy.html" target="_blank" rel="noopener">Политика конфиденциальности</a>.</p><p class="dp-quiz-error" role="alert" '+(state.error?'':'hidden')+'>'+safe(state.error)+'</p><button class="dp-quiz-action" type="submit" '+(state.sending?'disabled':'')+'>'+(state.sending?'Отправляем…':'Получить предложение со скидкой →')+'</button></form>';
}
function successView(){
  const name=({max:'MAX',whatsapp:'WhatsApp',telegram:'Telegram'})[state.channel]||'выбранный мессенджер';
  return commonHeader()+'<div class="dp-quiz-good" aria-hidden="true">✓</div><h2 id="dp-quiz-title">Ваши пожелания получили</h2><p class="dp-quiz-copy">Свяжемся с вами в '+name+'. Если не получится написать по номеру, позвоним.</p><button type="button" class="dp-quiz-action" data-dpq="close">Вернуться на сайт</button>';
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
  main.innerHTML=state.view==='question'?questionView():state.view==='results'?resultsView():state.view==='detail'?planDetailView():state.view==='form'?formView():successView();
  main.scrollTop=0;
  if(state.view==='form'){const input=$('#dp-quiz-phone',main);attachPhoneMask(input);if(!matchMedia('(max-width:760px)').matches)input.focus({preventScroll:true});else focusTitle(main);}
  else focusTitle(main);
  fitViewport();
}
function newAnswer(value){
  const q=question[state.step];if(!q.options.some(o=>o[0]===value))return;
  state.answers[q.key]=value;save();state.selectedCode=null;state.expanded=false;
  trace('dp_quiz_answer',{step:state.step+1,variant:value});
  if(state.step<2){state.step++;state.view='question';}else{state.view='results';trace('dp_quiz_result');}
  render();
}
async function submitForm(form){
  if(state.sending)return;
  const field=$('#dp-quiz-phone',form);state.phone=field.value;
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
    payload.comment=('Квиз: индивидуальное предложение. Дополнительная скидка 20 000 ₽ на комплектацию Делюкс для всех моделей. Гостей '+count+'; помывочная '+wash+'; спальня '+bed+'. Варианты: '+ids+selected+'. Мессенджер: '+({max:'MAX',whatsapp:'WhatsApp',telegram:'Telegram'})[state.channel]+'.').slice(0,490);
    payload.journeyContext={purpose:'selection_help',pagePath:location.pathname};
    const attribution=analytics?.attribution?.();if(attribution)payload.attribution=attribution;
    state.error='';state.sending=true;render();
    trace('dp_form_submit_attempt',{flow:'callback',purpose:'selection_help'});
    const sent=await submitLead(payload,settings,location.origin);
    state.sending=false;state.view='success';state.success=true;save();
    analytics?.confirmed?.(sent.receipt,{flow:'callback',requestId:payload.requestId,purpose:'selection_help',placement:'catalog'});
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
    if(action==='plan'){
      const found=recommendModelRanges(quiz.plans,state.answers,book,quiz.priceRules);
      const valid=found.offers.some(offer=>offer.plans.some(p=>p.code===btn.dataset.code&&p.image&&p.sitePlanId));
      if(!valid)return;
      state.selectedCode=btn.dataset.code;state.view='detail';trace('dp_quiz_layout_open',{code:state.selectedCode});return render();
    }
    if(action==='form'){state.view='form';trace('dp_quiz_catalog_cta');return render();}
  });
  dialog.addEventListener('submit',e=>{if(e.target?.id==='dp-quiz-contact-form'){e.preventDefault();submitForm(e.target)}});
  dialog.addEventListener('change',e=>{if(e.target?.name==='channel'){state.channel=e.target.value;state.requestId=null;}});
  dialog.addEventListener('input',e=>{if(e.target?.id==='dp-quiz-phone'){state.phone=e.target.value;state.requestId=null;}});
  window.visualViewport?.addEventListener('resize',fitViewport,{passive:true});
  window.visualViewport?.addEventListener('scroll',fitViewport,{passive:true});
  dialog.addEventListener('focusin',()=>requestAnimationFrame(fitViewport));
  dialog.addEventListener('close',()=>{state.error='';try{lastOpener?.focus?.({preventScroll:true})}catch{};});
  invite.querySelector('[data-dpq-open]').addEventListener('click',launch);
  invite.querySelector('[data-dpq-hide]').addEventListener('click',()=>hideInvite(true));
  invite.addEventListener('cancel',event=>{event.preventDefault();hideInvite(true)});
  invite.addEventListener('click',event=>{if(event.target===invite)hideInvite(true)});
  launcher.addEventListener('click',launch);
  document.addEventListener('click',e=>{if(e.target.closest('#configure,#home-plans,[data-model-card],[data-flow],[data-preset],[data-inquiry],[data-save-choice],[data-size-picker],#contact-dialog,#gallery-dialog,#inquiry-dialog'))interacted=true},{capture:true,passive:true});
  window.addEventListener('scroll',()=>{const height=document.documentElement.scrollHeight-innerHeight;if(height>0&&scrollY/height>=inviteScrollFraction)scrollSeen=true;maybeInvite()},{passive:true});
  document.addEventListener('visibilitychange',maybeInvite);
  window.setTimeout(maybeInvite,inviteDelayMs+500);
  if(matchMedia('(hover:hover) and (pointer:fine)').matches){document.addEventListener('mouseout',e=>{if(e.clientY<=0&&e.relatedTarget===null&&scrollY>180&&Date.now()-startedAt>15000){scrollSeen=true;maybeInvite()}},{passive:true})}
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
    load();shownThisVisit=Object.values(state.answers).some(Boolean);
    const mounted=$('[data-quiz-mount]');
    const entry=mounted||document.createElement('div');entry.className='dp-quiz-entry';
    entry.innerHTML='<div><span class="dp-quiz-entry-label">Начните со своих пожеланий</span><strong>Подберём баню за 3 шага</strong><p>Сравните подходящие модели, размеры и цены.</p></div><button type="button" class="dp-quiz-action" id="dp-quiz-open">Найти свою баню <span aria-hidden="true">↗</span></button>';
    if(!mounted){const anchor=$('#models .section-heading')||$('#models .section-top');
    if(anchor)anchor.insertAdjacentElement('afterend',entry);else $('#models').prepend(entry);}
    launcher=$('#dp-quiz-open');
    invite=document.createElement('dialog');invite.className='dp-quiz-invite';invite.setAttribute('aria-labelledby','dp-quiz-invite-title');
    invite.innerHTML='<div class="dp-quiz-invite-layout"><div class="dp-quiz-invite-visual"><img class="dp-quiz-invite-photo" src="/r101/assets/parus-editorial-960.webp" alt="Готовая баня на загородном участке" width="960" height="720" decoding="async"></div><div class="dp-quiz-invite-inner"><button type="button" class="dp-quiz-invite-close" data-dpq-hide aria-label="Закрыть предложение">×</button><span class="dp-quiz-invite-kicker">ДачаПар · поможем с выбором</span><h2 id="dp-quiz-invite-title">Какая баня подойдёт вам?</h2><p>Ответьте на три коротких вопроса — покажем подходящие планировки, размеры и цены.</p><div class="dp-quiz-invite-stages" aria-label="Три вопроса"><span><b>01</b> Сколько гостей</span><span><b>02</b> Помывочная</span><span><b>03</b> Ночёвка</span></div><button type="button" class="dp-quiz-action" data-dpq-open>Подобрать баню <span aria-hidden="true">→</span></button></div></div>';
    dialog=document.createElement('dialog');dialog.id='dp-quiz-dialog';dialog.setAttribute('aria-labelledby','dp-quiz-title');
    dialog.innerHTML='<div class="dp-quiz-frame"><div class="dp-quiz-photo" aria-hidden="true"><img src="/assets/quiz/step1-steamroom.webp" width="508" height="764" alt=""></div><div class="dp-quiz-main"></div></div>';
    document.body.append(invite,dialog);bind();
  }catch(error){console.warn('DachaPar quiz inactive:',error.message);}
}
init();

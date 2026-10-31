import {ANSWERS,validAnswers,rankPlans,planPrice,guestExplanation} from './quiz-engine.mjs?v=20261031';
import {buildCallback,submitLead} from './lead-client.mjs?v=r100-20261027';
import {attachPhoneMask} from './phone-mask.mjs';
import {analytics} from './analytics-core.mjs';

const $=(selector,root=document)=>root.querySelector(selector);
const models={
  kvadro:{name:'Квадро',photo:'/r101/assets/kvadro-editorial-960.webp',description:'Отдельная парная и комната отдыха. Ширина корпуса — 2,1 м.'},
  viking:{name:'Викинг',photo:'/r101/assets/viking-editorial-960.webp',description:'Отдельная парная и комната отдыха. Ширина корпуса — 2,4 м.'},
  parus:{name:'Парус',photo:'/r101/assets/parus-editorial-960.webp',description:'Прямые стены и отдельная парная. Ширина корпуса — 2,4 м.'},
  'kvadro-house':{name:'Квадро Хаус',photo:'/r101/assets/house-editorial-960.webp',description:'Когда после парной хочется остаться подольше и никуда не торопиться.'}
};
const question=[
  {key:'party',title:'С кем будете отдыхать в бане?',description:'Вспомните обычный выходной на даче.',options:[
    ['p2','Вдвоём','Своя баня для спокойных выходных'],
    ['p4','С семьёй · 3–4 человека','Париться и отдыхать с близкими'],
    ['p6','С друзьями · 5–6 человек','Собираться своей компанией'],
    ['p8','Большой компанией · до 8 человек','Чтобы было где собраться между заходами']
  ]},
  {key:'wash',title:'Нужна отдельная помывочная?',description:'Выберите, как вам будет удобнее после парной.',options:[
    ['w_yes','Да, отдельная комната','Мыться отдельно от парной и комнаты отдыха'],
    ['w_no','Без отдельной помывочной','Больше места для парной и отдыха'],
    ['w_compare','Хочу сравнить','Посмотрю оба варианта и решу']
  ]},
  {key:'bedroom',title:'Нужно место, чтобы остаться на ночь?',description:'Отдельная спальня — или больше места для общего отдыха.',options:[
    ['b_yes','Да, со спальней','Закончить банный вечер и остаться до утра'],
    ['b_no','Только для банного отдыха','Для ночёвки у нас есть дом']
  ]}
];
const safe=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const rub=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Math.ceil(n))+' ₽';
const liveKey='dp_quiz_answers_v1',hiddenKey='dp_quiz_invite_suppressed_until_v1';
const state={step:0,view:'question',answers:{},selectedCode:null,expanded:false,sending:false,phone:'',channel:'',error:'',success:false,requestId:null};
let quiz=null,book=null,settings=null,dialog=null,invite=null,launcher=null,scrollSeen=false,interacted=false,shownThisVisit=false,startedAt=Date.now(),lastOpener=null;
const trace=(name,params={})=>{try{analytics?.track(name,{placement:'catalog',...params})}catch{}};
const save=()=>{try{sessionStorage.setItem(liveKey,JSON.stringify(state.answers))}catch{}};
const load=()=>{try{const a=JSON.parse(sessionStorage.getItem(liveKey)||'{}');if(a&&typeof a==='object')state.answers={party:ANSWERS.party.includes(a.party)?a.party:undefined,wash:ANSWERS.wash.includes(a.wash)?a.wash:undefined,bedroom:ANSWERS.bedroom.includes(a.bedroom)?a.bedroom:undefined}}catch{}};
const hideInvite=(dismissed=false)=>{if(invite)invite.hidden=true;if(dismissed){shownThisVisit=true;try{localStorage.setItem(hiddenKey,String(Date.now()+7*86400000))}catch{}trace('dp_quiz_invite_close')}};
const canInvite=()=>{let until=0;try{until=Number(localStorage.getItem(hiddenKey)||0)}catch{}
  let savedChoice=false;try{savedChoice=!!JSON.parse(localStorage.getItem('dp_r101_choice')||'null')}catch{}
  return !shownThisVisit && !savedChoice && Date.now()>until && !dialog?.open && !document.querySelector('dialog[open]') && document.visibilityState==='visible' && !interacted && Date.now()-startedAt>12000 && !location.hash && !document.activeElement?.matches?.('input,textarea,select');};
const maybeInvite=()=>{if(!canInvite()||!scrollSeen)return;shownThisVisit=true;invite.hidden=false;trace('dp_quiz_invite_view')};
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
  return commonHeader()+progress()+'<h2 id="dp-quiz-title">'+safe(q.title)+'</h2><p class="dp-quiz-copy">'+safe(q.description)+'</p><div class="dp-quiz-choices" role="group" aria-label="'+safe(q.title)+'">'+rows+'</div><div class="dp-quiz-foot">'+(state.step>0?'<button type="button" class="dp-quiz-link" data-dpq="back">← Назад</button>':'<span></span>')+'</div>';
}
const caption=p=>p.bedroom?'Отдельная спальня, парная, помывочная и комната отдыха.':p.wash==='Отдельная'?'Парная, отдельная помывочная и комната отдыха.':p.wash==='Ниша'?'Парная и комната отдыха. Для душа предусмотрена ниша.':models[p.model].description;
function planCard(p){
  const photo=models[p.model],cost=planPrice(p,state.answers.party,book,quiz.priceRules);
  const thumb=p.image?'<img class="dp-quiz-plan-thumb" src="'+safe(p.image)+'" loading="lazy" decoding="async" width="1620" height="1080" alt="Планировка бани '+safe(photo.name)+'">':'';
  const price=cost.rub===null?'':'<div class="dp-quiz-plan-price">≈ '+rub(cost.rub)+'</div>';
  const action=p.image?'<button type="button" class="dp-quiz-action dp-quiz-action--subtle" data-dpq="detail" data-code="'+p.code+'">Смотреть планировку →</button>':'';
  return '<article class="dp-quiz-plan"><img class="dp-quiz-plan-photo" src="'+safe(photo.photo)+'" width="960" height="720" alt="Внешний вид модели '+safe(photo.name)+'" loading="lazy" decoding="async"><div class="dp-quiz-plan-body"><div class="dp-quiz-plan-title">'+safe(photo.name)+' · '+safe(sizeName(p))+'</div><p class="dp-quiz-plan-description">'+safe(caption(p))+'</p>'+thumb+price+(action?'<div class="dp-quiz-plan-actions">'+action+'</div>':'')+'</div></article>';
}
function sizeName(p){
  if(p.model==='kvadro-house'){return ({'4x4':'4 × 4 м','5x4':'4 × 5 м','6x4':'4 × 6 м','6x5':'5 × 6 м','6x6':'6 × 6 м'})[p.size]||p.size}
  const l=(Number(p.size)/100).toLocaleString('ru-RU',{maximumFractionDigits:1});return l+' м'+(p.wideBody?' · ширина 3 м':'');
}
function resultsView(){
  const found=rankPlans(quiz.plans,state.answers,4);
  const all=state.expanded?found.all:found.top;
  const pills=[({p2:'Вдвоём',p4:'Семья · 3–4',p6:'Компания · 5–6',p8:'Компания · до 8'})[state.answers.party],({w_yes:'С помывочной',w_no:'Без отдельной помывочной',w_compare:'Сравнить помывочную'})[state.answers.wash],state.answers.bedroom==='b_yes'?'Со спальней':'Без спальни'].filter(Boolean).map(x=>'<span class="dp-quiz-pill">'+safe(x)+'</span>').join('');
  const title=state.answers.bedroom==='b_yes'?'Подобрали бани с отдельной спальней':state.answers.party==='p2'?'Нашли бани для спокойного отдыха вдвоём':'Ваша подборка бань';
  const compromise=found.compromise?'<div class="dp-quiz-results-note">Бани с отдельной спальней у нас есть только с помывочной. Можете посмотреть их или изменить ответ.</div>':'';
  return commonHeader()+'<h2 id="dp-quiz-title">'+title+'</h2><p class="dp-quiz-copy">'+safe(guestExplanation(state.answers))+'</p><div class="dp-quiz-pillbar">'+pills+'</div><button type="button" class="dp-quiz-link" data-dpq="edit">Изменить ответы</button>'+compromise+'<div class="dp-quiz-results">'+all.map(planCard).join('')+'</div>'+(found.all.length>found.top.length&&!state.expanded?'<div class="dp-quiz-foot"><button type="button" class="dp-quiz-link" data-dpq="more">Показать ещё варианты</button></div>':'')+'<p class="dp-quiz-price-note">Цены ориентировочные, без доставки.</p><div class="dp-quiz-cta"><div><strong>Сохраните планировки и комплектации с ценами</strong></div><button type="button" class="dp-quiz-action" data-dpq="form">Получить подборку →</button></div>';
}
function detailView(){
  const p=quiz.plans.find(x=>x.code===state.selectedCode);
  if(!p){state.view='results';return resultsView();}
  const mirror=state.mirror&&p.mirrorImage;
  const image=mirror?p.mirrorImage:p.image;
  const cost=planPrice(p,state.answers.party,book,quiz.priceRules);
  return commonHeader()+'<button class="dp-quiz-link" data-dpq="results">← К подборке</button><h2 id="dp-quiz-title">'+safe(models[p.model].name)+' · '+safe(sizeName(p))+'</h2><p class="dp-quiz-copy">'+safe(caption(p))+'</p>'+(image?'<div class="dp-quiz-plan-viewport '+(state.planZoom?'is-zoomed':'')+'"><img class="dp-quiz-detail-image" alt="Планировка '+safe(models[p.model].name)+(mirror?', зеркальная':'')+'" src="'+safe(image)+'" width="1620" height="1080"></div><button type="button" class="dp-quiz-link" data-dpq="zoom" aria-pressed="'+Boolean(state.planZoom)+'">'+(state.planZoom?'Показать целиком':'Увеличить схему')+'</button>':'')+'<div class="dp-quiz-detail-meta"><span class="dp-quiz-pill">'+(p.wash==='Отдельная'?'С помывочной':'Без отдельной помывочной')+'</span>'+(p.bedroom?'<span class="dp-quiz-pill">Со спальней</span>':'')+'</div>'+(cost.rub===null?'':'<div class="dp-quiz-plan-price">≈ '+rub(cost.rub)+'</div>')+'<div class="dp-quiz-plan-actions" style="margin-top:18px">'+(p.mirrorImage?'<button class="dp-quiz-action dp-quiz-action--subtle" data-dpq="mirror">'+(state.mirror?'Основная планировка':'Зеркальная планировка')+'</button>':'')+'</div>';
}
function formView(){
  const options=[['max','MAX'],['whatsapp','WhatsApp'],['telegram','Telegram']].map(([value,label])=>'<label class="dp-quiz-channel"><input type="radio" name="channel" value="'+value+'" required '+(state.channel===value?'checked':'')+'><span>'+label+'</span></label>').join('');
  return commonHeader()+'<button type="button" class="dp-quiz-link" data-dpq="results">← К подборке</button><h2 id="dp-quiz-title">Куда отправить подборку?</h2><p class="dp-quiz-copy">Пришлём планировки, комплектацию и цены в удобный вам мессенджер.</p><form id="dp-quiz-contact-form"><label class="dp-quiz-field" for="dp-quiz-phone">Номер телефона<input id="dp-quiz-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="+7 (999) 123-45-67" required value="'+safe(state.phone)+'"></label><fieldset class="dp-quiz-channel-field"><legend>Выберите мессенджер</legend><div class="dp-quiz-channels">'+options+'</div></fieldset><p class="dp-quiz-form-note">Нажимая «Получить подборку», вы соглашаетесь с <a href="/consent.html" target="_blank" rel="noopener">обработкой персональных данных</a>.</p><p class="dp-quiz-error" role="alert" '+(state.error?'':'hidden')+'>'+safe(state.error)+'</p><button class="dp-quiz-action" type="submit" '+(state.sending?'disabled':'')+'>'+(state.sending?'Отправляем…':'Получить подборку →')+'</button></form>';
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
  $('.dp-quiz-photo',frame).hidden=state.view!=='question';
  main.innerHTML=state.view==='question'?questionView():state.view==='results'?resultsView():state.view==='detail'?detailView():state.view==='form'?formView():successView();
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
    const found=rankPlans(quiz.plans,state.answers,4);
    const ids=found.top.map(p=>p.code).join(', ');
    const selected=state.selectedCode?'; просмотрена '+state.selectedCode:'';
    const count=({p2:'1–2',p4:'3–4',p6:'5–6',p8:'до 8'})[state.answers.party];
    const wash=({w_yes:'отдельная нужна',w_no:'не нужна',w_compare:'сравнить оба'})[state.answers.wash];
    const bed=state.answers.bedroom==='b_yes'?'нужна':'не нужна';
    payload.comment='Квиз: планировки, комплектации, цены. Гостей: '+count+'; помывочная: '+wash+'; спальня: '+bed+'. Планировки: '+ids+selected+'. Мессенджер: '+({max:'MAX',whatsapp:'WhatsApp',telegram:'Telegram'})[state.channel]+'. Если не получится написать по номеру — позвонить.';
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
    if(action==='more'){state.expanded=true;return render();}
    if(action==='results'){state.view='results';return render();}
    if(action==='detail'){state.selectedCode=btn.dataset.code;state.mirror=false;state.planZoom=false;state.view='detail';trace('dp_quiz_plan_open',{plan_id:state.selectedCode});return render();}
    if(action==='mirror'){state.mirror=!state.mirror;return render();}
    if(action==='zoom'){state.planZoom=!state.planZoom;return render();}
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
  launcher.addEventListener('click',launch);
  document.addEventListener('click',e=>{if(e.target.closest('#configure,#home-plans,[data-model-card],[data-flow],[data-preset],[data-inquiry],[data-save-choice],[data-size-picker],#contact-dialog,#gallery-dialog,#inquiry-dialog'))interacted=true},{capture:true,passive:true});
  window.addEventListener('scroll',()=>{const height=document.documentElement.scrollHeight-innerHeight;if(height>0&&scrollY/height>.60)scrollSeen=true;maybeInvite()},{passive:true});
  document.addEventListener('visibilitychange',maybeInvite);
  window.setTimeout(maybeInvite,12500);
  if(matchMedia('(hover:hover) and (pointer:fine)').matches){document.addEventListener('mouseout',e=>{if(e.clientY<=0&&e.relatedTarget===null&&scrollY>180&&Date.now()-startedAt>15000){scrollSeen=true;maybeInvite()}},{passive:true})}
}
async function init(){
  if(!$('#models')||$('#dp-quiz-dialog'))return;
  try{
    const [a,b,c]=await Promise.all([fetch('/data/quiz-v1.json',{cache:'no-cache'}),fetch('/data/catalog-pricebook.json',{cache:'no-cache'}),fetch('/data/site-settings.json',{cache:'no-cache'})]);
    if(!a.ok||!b.ok||!c.ok)throw new Error('QUIZ_FETCH_FAIL');
    quiz=await a.json();book=await b.json();settings=await c.json();
    if(quiz.plans?.length!==41||quiz.priceRules?.assertComfortPriceFromExistingPricebook!==true)throw new Error('QUIZ_DATA_INVALID');
    if(settings.lead?.requiredPricebookVersion!==book.version)throw new Error('QUIZ_PRICEBOOK_VERSION');
    analytics?.start(settings);
    load();shownThisVisit=Object.values(state.answers).some(Boolean);
    const mounted=$('[data-quiz-mount]');
    const entry=mounted||document.createElement('div');entry.className='dp-quiz-entry';
    entry.innerHTML='<div><span class="dp-quiz-entry-label">Начните со своих пожеланий</span><strong>Какая баня подойдёт вам?</strong><p>Ответьте на три вопроса. Сравните планировки и цены.</p></div><button type="button" class="dp-quiz-action" id="dp-quiz-open">Найти свою баню <span aria-hidden="true">↗</span></button>';
    if(!mounted){const anchor=$('#models .section-heading')||$('#models .section-top');
    if(anchor)anchor.insertAdjacentElement('afterend',entry);else $('#models').prepend(entry);}
    launcher=$('#dp-quiz-open');
    invite=document.createElement('aside');invite.className='dp-quiz-invite';invite.hidden=true;invite.setAttribute('aria-label','Помощь с выбором бани');
    invite.innerHTML='<button type="button" class="dp-quiz-invite-close" data-dpq-hide aria-label="Не показывать подсказку">×</button><img src="/r101/assets/kvadro-editorial-640.webp" alt="" width="76" height="104" loading="lazy"><div><strong>Какая баня подойдёт вам?</strong><p>Сравните планировки и цены по трём ответам.</p><button type="button" class="dp-quiz-action" data-dpq-open>Подобрать баню →</button></div>';
    dialog=document.createElement('dialog');dialog.id='dp-quiz-dialog';dialog.setAttribute('aria-labelledby','dp-quiz-title');
    dialog.innerHTML='<div class="dp-quiz-frame"><div class="dp-quiz-photo" aria-hidden="true"><img src="/r101/assets/parus-editorial-960.webp" width="720" height="960" alt=""><div class="dp-quiz-photo-note">У каждого свой<br>банный вечер<small>Подберём баню под ваши привычки.</small></div></div><div class="dp-quiz-main"></div></div>';
    document.body.append(invite,dialog);bind();
  }catch(error){console.warn('DachaPar quiz inactive:',error.message);}
}
init();

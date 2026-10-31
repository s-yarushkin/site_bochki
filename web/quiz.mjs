import {ANSWERS,validAnswers,rankPlans,planPrice,guestExplanation} from './quiz-engine.mjs?v=20261031';
import {buildCallback,submitLead} from './lead-client.mjs?v=r100-20261027';
import {attachPhoneMask} from './phone-mask.mjs';
import {analytics} from './analytics-runtime.mjs?v=r100-20261027';

const $=(selector,root=document)=>root.querySelector(selector);
const models={
  kvadro:{name:'Квадро',photo:'/assets/kvadro-garden-r7-960.webp',description:'Когда хочется выдохнуть после недели дел и провести время с близкими.'},
  viking:{name:'Викинг',photo:'/assets/viking-p3-960.webp',description:'Для тех, кто любит собраться вместе и растянуть банный вечер.'},
  parus:{name:'Парус',photo:'/parus-media/assets/photos/02_exterior-960.webp',description:'Спокойные вечера за городом, без спешки и лишних забот.'},
  'kvadro-house':{name:'Квадро Хаус',photo:'/qh-media/assets/photos/kh7-07-960.webp',description:'Когда после парной хочется остаться подольше и никуда не торопиться.'}
};
const question=[
  {key:'party',title:'Сколько вас обычно собирается на банный вечер?',description:'Подберём размер под ваш привычный отдых. Не обязательно париться всем одновременно.',options:[
    ['p2','Вдвоём','Иногда хочется просто тишины'],
    ['p4','3–4 человека','Семья или самые близкие'],
    ['p6','5–6 человек','Любим собраться своей компанией'],
    ['p8','Иногда все восемь!','Тесновато, зато весело']
  ]},
  {key:'wash',title:'Нужна отдельная помывочная?',description:'Это отдельная комната для мытья, а не просто душевая ниша.',options:[
    ['w_yes','Да, обязательно','Хочу, чтобы парная и помывочная были раздельными'],
    ['w_no','Нет, не нужна','Лучше сэкономлю на лишних помещениях'],
    ['w_compare','Покажите оба варианта','Посмотрю планировки и цены, потом решу']
  ]},
  {key:'bedroom',title:'Хотите оставаться в бане на ночь?',description:'Или вам достаточно парной и места, где приятно отдохнуть после неё?',options:[
    ['b_yes','Да, хочу отдельную спальню','Чтобы после банного вечера никуда не торопиться'],
    ['b_no','Нет, после бани пойдём домой','Лучше оставить больше места для отдыха']
  ]}
];
const safe=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const rub=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:Number.isInteger(n)?0:2}).format(n)+' ₽';
const liveKey='dp_quiz_answers_v1',hiddenKey='dp_quiz_invite_suppressed_until_v1';
const state={step:0,view:'question',answers:{},selectedCode:null,expanded:false,sending:false,phone:'',error:'',success:false,requestId:null};
let quiz=null,book=null,settings=null,dialog=null,invite=null,launcher=null,scrollSeen=false,interacted=false,shownThisVisit=false,startedAt=Date.now(),lastOpener=null;
const trace=(name,params={})=>{try{analytics?.track(name,{placement:'catalog',...params})}catch{}};
const save=()=>{try{sessionStorage.setItem(liveKey,JSON.stringify(state.answers))}catch{}};
const load=()=>{try{const a=JSON.parse(sessionStorage.getItem(liveKey)||'{}');if(a&&typeof a==='object')state.answers={party:ANSWERS.party.includes(a.party)?a.party:undefined,wash:ANSWERS.wash.includes(a.wash)?a.wash:undefined,bedroom:ANSWERS.bedroom.includes(a.bedroom)?a.bedroom:undefined}}catch{}};
const hideInvite=(dismissed=false)=>{if(invite)invite.hidden=true;if(dismissed){shownThisVisit=true;try{localStorage.setItem(hiddenKey,String(Date.now()+7*86400000))}catch{}trace('dp_quiz_invite_close')}};
const canInvite=()=>{let until=0;try{until=Number(localStorage.getItem(hiddenKey)||0)}catch{}
  return !shownThisVisit && Date.now()>until && !dialog?.open && !document.querySelector('dialog[open]') && document.visibilityState==='visible' && !interacted && Date.now()-startedAt>12000 && !location.hash && !document.activeElement?.matches?.('input,textarea,select');};
const maybeInvite=()=>{if(!canInvite()||!scrollSeen)return;shownThisVisit=true;invite.hidden=false;trace('dp_quiz_invite_view')};
const slideLink=p=>quiz.sourceAlbum+'#slide=id.'+encodeURIComponent(p.slideId);
function launch(event){
  lastOpener=event?.currentTarget||document.activeElement;
  hideInvite();
  if(validAnswers(state.answers)){state.view='results'}else{state.view='question';state.step=question.findIndex(q=>!state.answers[q.key]);if(state.step<0)state.step=0}
  dialog.showModal();render();trace('dp_quiz_start');
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
  return commonHeader()+progress()+'<h2 id="dp-quiz-title">'+safe(q.title)+'</h2><p class="dp-quiz-copy">'+safe(q.description)+'</p><div class="dp-quiz-choices" role="group" aria-label="'+safe(q.title)+'">'+rows+'</div><div class="dp-quiz-foot">'+(state.step>0?'<button type="button" class="dp-quiz-link" data-dpq="back">← Назад</button>':'<span></span>')+'<span class="dp-quiz-stepnote">Без регистрации и звонков</span></div>';
}
const caption=p=>p.bedroom?'Здесь предусмотрена отдельная спальня, чтобы после банного вечера можно было остаться. Размещение и оснащение согласуем.':p.wash==='Отдельная'?'В отдельной помывочной можно спокойно освежиться после парной, а отдых продолжить в своей комнате.':p.wash==='Ниша'?'После парной можно предусмотреть место для душа, не выделяя под него целую комнату. Оснащение уточняется.':models[p.model].description;
const labels=a=>[question[0].options.find(o=>o[0]===a.party)?.[1],question[1].options.find(o=>o[0]===a.wash)?.[1],question[2].options.find(o=>o[0]===a.bedroom)?.[1]];
function planCard(p){
  const photo=models[p.model],cost=planPrice(p,state.answers.party,book,quiz.priceRules);
  const priceText=cost.rub===null?'Стоимость уточним':rub(cost.rub);
  return '<article class="dp-quiz-plan"><img class="dp-quiz-plan-photo" src="'+safe(photo.photo)+'" width="960" height="720" alt="Внешний вид модели '+safe(photo.name)+'" loading="lazy" decoding="async"><div class="dp-quiz-plan-body"><div class="dp-quiz-plan-title">'+safe(photo.name)+' · '+safe(sizeName(p))+'</div><p class="dp-quiz-plan-description">'+safe(caption(p))+'</p>'+(p.image?'<img class="dp-quiz-plan-thumb" src="'+safe(p.image)+'" loading="lazy" decoding="async" width="1620" height="1080" alt="Схема выбранной планировки">':'<p class="dp-quiz-plan-description">Актуальную схему откроем из альбома планировок.</p>')+'<div class="dp-quiz-plan-price"><small>'+(cost.rub===null?'Требуется индивидуальный расчёт':'Предварительная стоимость')+'</small>'+priceText+'</div><div class="dp-quiz-plan-actions"><button type="button" class="dp-quiz-action dp-quiz-action--subtle" data-dpq="detail" data-code="'+p.code+'">Посмотреть планировку →</button><button type="button" class="dp-quiz-link" data-dpq="select" data-code="'+p.code+'">Выбрать эту</button></div></div></article>';
}
function sizeName(p){
  if(p.model==='kvadro-house'){return ({'4x4':'4 × 4 м','5x4':'4 × 5 м','6x4':'4 × 6 м','6x5':'5 × 6 м','6x6':'6 × 6 м'})[p.size]||p.size}
  const l=(Number(p.size)/100).toLocaleString('ru-RU',{maximumFractionDigits:1});return l+' м'+(p.wideBody?' · ширина 3 м':'');
}
function resultsView(){
  const found=rankPlans(quiz.plans,state.answers,4);
  const all=state.expanded?found.all:found.top;
  const pills=labels(state.answers).filter(Boolean).map(x=>'<span class="dp-quiz-pill">'+safe(x)+'</span>').join('');
  const title=state.answers.bedroom==='b_yes'?'Нашли варианты со спальней':state.answers.party==='p2'?'Нашли варианты для тихих банных вечеров':'Нашли бани, которые могут вам подойти';
  const compromise=found.compromise?'<div class="dp-quiz-results-note">Планировки с отдельной спальней сейчас включают и помывочную. Покажем их для сравнения — либо можно изменить ответ.</div>':'';
  const caution='<div class="dp-quiz-results-note">Цены предварительные: указаны базовый «Комфорт», доплата за новые помещения и выбранную печь. Окончательный состав, душевая, мебель и доставка уточняются перед заказом.</div>';
  return commonHeader()+'<h2 id="dp-quiz-title">'+title+'</h2><p class="dp-quiz-copy">'+safe(guestExplanation(state.answers))+'</p><div class="dp-quiz-pillbar">'+pills+'</div><button type="button" class="dp-quiz-link" data-dpq="edit">Изменить ответы ↗</button>'+compromise+caution+'<div class="dp-quiz-results">'+all.map(planCard).join('')+'</div>'+(found.all.length>found.top.length&&!state.expanded?'<div class="dp-quiz-foot"><button type="button" class="dp-quiz-link" data-dpq="more">Посмотреть все '+found.all.length+' подходящие планировки →</button></div>':'')+'<div class="dp-quiz-cta"><div><strong>Сохраним ваши варианты</strong><p>Пришлём подробные планировки, комплектации и цены, чтобы вы могли сравнить всё спокойно.</p></div><button type="button" class="dp-quiz-action" data-dpq="form">Получить мою подборку →</button></div><p class="dp-quiz-stepnote" style="text-align:left">Номер телефона понадобится только для отправки предложения.</p>';
}
function detailView(){
  const p=quiz.plans.find(x=>x.code===state.selectedCode);
  if(!p){state.view='results';return resultsView();}
  const mirror=state.mirror&&p.mirrorImage;
  const image=mirror?p.mirrorImage:p.image;
  const cost=planPrice(p,state.answers.party,book,quiz.priceRules);
  return commonHeader()+'<button class="dp-quiz-link" data-dpq="results">← Все подходящие варианты</button><h2 id="dp-quiz-title">'+safe(models[p.model].name)+' · '+safe(sizeName(p))+'</h2><p class="dp-quiz-copy">'+safe(caption(p))+'</p>'+(image?'<img class="dp-quiz-detail-image" alt="Планировка '+safe(p.code)+(mirror?' зеркальная':' основная')+'" src="'+safe(image)+'" width="1620" height="1080">':'<div class="dp-quiz-results-note">Эта схема обновлена в альбоме v04. Изображение ещё не перенесено в каталог сайта — покажем оригинальный слайд, а не устаревший план.</div>')+'<div class="dp-quiz-detail-meta"><span class="dp-quiz-pill">'+safe(p.code)+'</span><span class="dp-quiz-pill">'+(p.wash==='Отдельная'?'Есть отдельная помывочная':'Без отдельной помывочной')+'</span>'+(p.bedroom?'<span class="dp-quiz-pill">Со спальней</span>':'')+'</div><div class="dp-quiz-plan-price"><small>'+(cost.rub===null?'Расчёт по запросу':'Предварительная стоимость')+'</small>'+(cost.rub===null?'Стоимость уточним':rub(cost.rub))+'</div><div class="dp-quiz-plan-actions" style="margin-top:18px">'+(p.mirrorImage?'<button class="dp-quiz-action dp-quiz-action--subtle" data-dpq="mirror">'+(state.mirror?'Показать основной вариант':'Зеркальная планировка')+'</button>':'')+'<a class="dp-quiz-link" href="'+safe(slideLink(p))+'" target="_blank" rel="noopener noreferrer">Открыть в альбоме ↗</a></div><div class="dp-quiz-cta"><div><strong>Нравится этот вариант?</strong><p>Сохраним его в вашей подборке и уточним комплектацию.</p></div><button class="dp-quiz-action" type="button" data-dpq="form">Получить предложение →</button></div>';
}
function formView(){
  const found=rankPlans(quiz.plans,state.answers,4);
  const selected=quiz.plans.find(x=>x.code===state.selectedCode);
  return commonHeader()+'<button type="button" class="dp-quiz-link" data-dpq="results">← Вернуться к планировкам</button><h2 id="dp-quiz-title">Пришлём подробные планировки и комплектации с ценами</h2><p class="dp-quiz-copy">Сохраним подходящие варианты и подготовим предложение. Вы сможете спокойно всё сравнить — без обязательств покупать.</p>'+(selected?'<div class="dp-quiz-pillbar"><span class="dp-quiz-pill">Выбрано: '+safe(models[selected.model].name)+' · '+safe(sizeName(selected))+'</span></div>':'<div class="dp-quiz-pillbar">'+found.top.slice(0,3).map(p=>'<span class="dp-quiz-pill">'+safe(models[p.model].name)+' · '+safe(sizeName(p))+'</span>').join('')+'</div>')+'<form id="dp-quiz-contact-form"><label class="dp-quiz-field" for="dp-quiz-phone">Ваш номер телефона<input id="dp-quiz-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="+7 (999) 123-45-67" required value="'+safe(state.phone)+'" /></label><p class="dp-quiz-form-note">Менеджер свяжется с вами, уточнит детали и пришлёт подходящие планировки с актуальной стоимостью. Без рекламных рассылок.</p><p class="dp-quiz-form-note">Нажимая кнопку, вы соглашаетесь с <a href="/consent.html" target="_blank" rel="noopener">условиями обработки персональных данных</a>. <a href="/privacy.html" target="_blank" rel="noopener">Политика конфиденциальности</a>.</p><p class="dp-quiz-error" role="alert" '+(state.error?'':'hidden')+'>'+safe(state.error)+'</p><button class="dp-quiz-action" type="submit" '+(state.sending?'disabled':'')+'>'+(state.sending?'Отправляем…':'Получить мою подборку →')+'</button></form>';
}
function successView(){
  return commonHeader()+'<div class="dp-quiz-good" aria-hidden="true">✓</div><h2 id="dp-quiz-title">Ваш запрос получили</h2><p class="dp-quiz-copy">Менеджер свяжется с вами, уточнит пожелания и пришлёт подходящие планировки с актуальными ценами. Спасибо за интерес к ДачаПар.</p><button type="button" class="dp-quiz-action" data-dpq="close">Вернуться на сайт →</button>';
}
function render(){
  const frame=$('.dp-quiz-frame',dialog),main=$('.dp-quiz-main',dialog);
  frame.className='dp-quiz-frame '+(state.view==='question'?'':('is-'+state.view));
  $('.dp-quiz-photo',frame).hidden=state.view!=='question';
  main.innerHTML=state.view==='question'?questionView():state.view==='results'?resultsView():state.view==='detail'?detailView():state.view==='form'?formView():successView();
  main.scrollTop=0;
  if(state.view==='form'){const input=$('#dp-quiz-phone',main);attachPhoneMask(input);input.focus({preventScroll:true});}
  else {const title=$('#dp-quiz-title',main);if(title){title.tabIndex=-1;title.focus({preventScroll:true});}}
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
  try{
    if(!settings||!settings.lead?.enabled)throw new Error('LEAD_NOT_CONNECTED');
    const requestId=state.requestId||crypto.randomUUID();
    const payload=buildCallback({phone:state.phone,name:''},requestId);
    state.requestId=requestId;
    const found=rankPlans(quiz.plans,state.answers,4);
    const ids=found.top.map(p=>p.code).join(', ');
    const selected=state.selectedCode?'; выбран '+state.selectedCode:'';
    const count=({p2:'1–2',p4:'3–4',p6:'5–6',p8:'до 8'})[state.answers.party];
    const wash=({w_yes:'отдельная нужна',w_no:'не нужна',w_compare:'сравнить оба'})[state.answers.wash];
    const bed=state.answers.bedroom==='b_yes'?'нужна':'не нужна';
    payload.comment='КВИЗ ДачаПар: прислать подробные планировки, комплектации и цены. Гостей: '+count+'; помывочная: '+wash+'; спальня: '+bed+'. Подборка: '+ids+selected+'. Цены предварительные, состав уточнить.';
    payload.journeyContext={purpose:'selection_help',pagePath:location.pathname,source:'quiz_v1'};
    const attribution=analytics?.attribution?.();if(attribution)payload.attribution=attribution;
    state.error='';state.sending=true;render();
    trace('dp_form_submit_attempt',{flow:'callback',purpose:'selection_help'});
    const sent=await submitLead(payload,settings,location.origin);
    state.sending=false;state.view='success';state.success=true;save();
    analytics?.confirmed?.(sent.receipt,{flow:'callback',requestId:payload.requestId,purpose:'selection_help',placement:'catalog'});
    trace('dp_quiz_catalog_sent');render();hideInvite(true);
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
    if(action==='detail'||action==='select'){state.selectedCode=btn.dataset.code;state.mirror=false;if(action==='detail'){state.view='detail';trace('dp_quiz_plan_open',{plan_id:state.selectedCode})}else state.view='form';return render();}
    if(action==='mirror'){state.mirror=!state.mirror;return render();}
    if(action==='form'){state.view='form';trace('dp_quiz_catalog_cta');return render();}
  });
  dialog.addEventListener('submit',e=>{if(e.target?.id==='dp-quiz-contact-form'){e.preventDefault();submitForm(e.target)}});
  dialog.addEventListener('close',()=>{state.error='';try{lastOpener?.focus?.({preventScroll:true})}catch{};});
  invite.querySelector('[data-dpq-open]').addEventListener('click',launch);
  invite.querySelector('[data-dpq-hide]').addEventListener('click',()=>hideInvite(true));
  launcher.addEventListener('click',launch);
  document.addEventListener('click',e=>{if(e.target.closest('#configure,#home-plans,[data-model-card],[data-flow],[data-preset],#contact-dialog,#gallery-dialog'))interacted=true},{capture:true,passive:true});
  window.addEventListener('scroll',()=>{const height=document.documentElement.scrollHeight-innerHeight;if(height>0&&scrollY/height>.60)scrollSeen=true;maybeInvite()},{passive:true});
  document.addEventListener('visibilitychange',maybeInvite);
  window.setTimeout(maybeInvite,12500);
  if(matchMedia('(hover:hover) and (pointer:fine)').matches){document.addEventListener('mouseout',e=>{if(e.clientY<=0&&e.relatedTarget===null&&scrollY>180&&Date.now()-startedAt>15000){scrollSeen=true;maybeInvite()}},{passive:true})}
}
async function init(){
  if(!$('#models'))return;
  try{
    const [a,b,c]=await Promise.all([fetch('/data/quiz-v1.json',{cache:'no-cache'}),fetch('/data/catalog-pricebook.json',{cache:'no-cache'}),fetch('/data/site-settings.json',{cache:'no-cache'})]);
    if(!a.ok||!b.ok||!c.ok)throw new Error('QUIZ_FETCH_FAIL');
    quiz=await a.json();book=await b.json();settings=await c.json();
    if(quiz.plans?.length!==41||quiz.priceRules?.assertComfortPriceFromExistingPricebook!==true)throw new Error('QUIZ_DATA_INVALID');
    if(settings.lead?.requiredPricebookVersion!==book.version)throw new Error('QUIZ_PRICEBOOK_VERSION');
    load();
    const entry=document.createElement('div');entry.className='dp-quiz-entry';
    entry.innerHTML='<div><strong>Не знаете, какую баню выбрать?</strong><p>Три простых вопроса — и покажем подходящие планировки с ценами. Без телефона.</p></div><button type="button" class="dp-quiz-action" id="dp-quiz-open">Подобрать мою баню →</button>';
    $('#models .section-top')?.insertAdjacentElement('afterend',entry);launcher=$('#dp-quiz-open');
    invite=document.createElement('aside');invite.className='dp-quiz-invite';invite.hidden=true;invite.setAttribute('aria-label','Помощь с выбором бани');
    invite.innerHTML='<button type="button" class="dp-quiz-invite-close" data-dpq-hide aria-label="Не показывать подсказку">×</button><img src="/assets/kvadro-garden-r7-600.webp" alt="" width="76" height="104" loading="lazy"><div><strong>Какая баня подойдёт вам?</strong><p>Подберём за 3 вопроса и покажем цены.</p><button type="button" class="dp-quiz-action" data-dpq-open>Подобрать баню →</button></div>';
    dialog=document.createElement('dialog');dialog.id='dp-quiz-dialog';dialog.setAttribute('aria-labelledby','dp-quiz-title');
    dialog.innerHTML='<div class="dp-quiz-frame"><div class="dp-quiz-photo" aria-hidden="true"><img src="/parus-media/assets/photos/02_exterior-960.webp" width="720" height="960" alt=""><div class="dp-quiz-photo-note">Баня, в которой хочется остаться подольше<small>Три ответа — и покажем подходящие варианты.</small></div></div><div class="dp-quiz-main"></div></div>';
    document.body.append(invite,dialog);bind();
  }catch(error){console.warn('DachaPar quiz inactive:',error.message);}
}
init();

import {comfortSelection,comfortPrice,selectionLink,safeReference,inquiryPayload,withdrawnPlans} from './state.mjs';
import {submitLead,leadAvailable,callbackAvailable} from '../lead-client.mjs';
import {analytics} from '../analytics-core.mjs';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const names={kvadro:'Квадро',parus:'Парус',viking:'Викинг','kvadro-house':'Квадро Хаус'};
const money=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';
let book,settings,photos=[],plans=[],choice=null,context={},lastFocus=null,sending=false,sent=false,lastBody='',requestId=null;
const dialog=$('#inquiry-dialog'),form=$('#inquiry-form'),status=$('#form-status'),fields=$('#form-fields');
const getField=name=>form.elements.namedItem(name);
const announce=text=>{const t=$('.toast');t.textContent=text;t.hidden=false;clearTimeout(announce.timer);announce.timer=setTimeout(()=>t.hidden=true,4200)};
const track=(event,extra={})=>analytics?.track(event,{...extra,experiment_id:'r101_comfort',variant:'editorial'});
const placement=el=>el.closest('.hero')?'hero':el.closest('[data-model-card]')?(location.pathname.startsWith('/bani/')&&location.pathname!=='/bani/'?'model':'catalog'):el.closest('.closing')?'final':el.closest('#individual,#breath')?'personal':el.closest('.plan')?'plans':el.closest('.resume')?'mobile':'result';
const storage={read(){try{return JSON.parse(localStorage.getItem('dp_r101_choice')||'null')}catch{return null}},write(v){try{localStorage.setItem('dp_r101_choice',JSON.stringify(v))}catch{}}};
function choiceText(s){return s?`${names[s.model]} · ${book.r85.models[s.model].sizes[s.size].label} · ${money(comfortPrice(book,s))}`:'Модель и размер пока не выбраны';}
function updateSelection(s,persist=true){
 choice=comfortSelection(book,s);if(!choice)return;
 if(persist)storage.write(choice);
 for(const select of $$(`[data-size-picker="${choice.model}"]`))select.value=choice.size;
 for(const el of $$(`[data-price="${choice.model}"]`))el.textContent=money(comfortPrice(book,choice));
 for(const el of $$(`[data-model-card="${choice.model}"] [data-inquiry]`))el.dataset.size=choice.size;
 $('#resume-title').textContent=choiceText(choice);$('#resume').hidden=false;
 for(const el of $$('[data-closing-choice]')){el.hidden=false;el.textContent='Ваш выбор: '+choiceText(choice)+' · Комфорт';}
}
function closeDialog(){dialog.close();lastFocus?.focus();track('dp_form_close',{placement:'result'});}
function openInquiry(button){
 lastFocus=button;const purpose=button.dataset.inquiry||'quote';
 if(!book){announce('Не удалось загрузить расчёт. Позвоните: +7 (951) 734-99-99');return;}
 let selected=button.dataset.model?comfortSelection(book,{model:button.dataset.model,size:button.dataset.photo&&choice?.model===button.dataset.model?choice.size:button.dataset.size}):choice;
 if(selected)updateSelection(selected);
 const ref=button.dataset.photo?safeReference(photos,button.dataset.photo,selected?.model):null;
 const plan=button.dataset.plan?plans.find(p=>p.id===button.dataset.plan&&!withdrawnPlans.has(p.id)):null;
 context={purpose,pagePath:location.pathname,reference:ref,plan,selection:selected,placement:placement(button)};
 track('dp_cta_click',{purpose,model:selected?.model,size:selected?.size,placement:context.placement});
 $('#inquiry-title').textContent='Как с вами связаться';
 $('#inquiry-summary').textContent=selected?choiceText(selected)+' · Комфорт'+(plan?' · '+plan.title:'')+(ref?' · Обсудим выбранное исполнение':''):'Поможем выбрать модель и размер';
 if(sent){form.reset();sent=false;requestId=null;lastBody='';}
 getField('channel').disabled=!selected;$('#channel-field').hidden=!selected;if(!selected)getField('channel').value='phone';
 $('.dialog-intro',dialog).textContent=selected?'Поможем продумать вашу баню и подготовим предложение с выбранным оснащением и доставкой.':'Позвоним, чтобы понять ваши пожелания и подобрать баню. Затем подготовим предложение для вашего участка.';
 $('.form-submit',dialog).textContent=selected?'Получить предложение':'Обсудить выбор бани';
 $('#preview-note').hidden=location.hostname!=='127.0.0.1';
 status.textContent='';status.className='form-status';fields.hidden=false;
 fields.disabled=!(selected?leadAvailable(settings,location.origin,book.version):callbackAvailable(settings,location.origin));
 if(fields.disabled)status.textContent='Сейчас заявку можно оставить по телефону: +7 (951) 734-99-99.';
 dialog.showModal();getField('phone').focus();track('dp_form_open',{purpose,model:selected?.model,size:selected?.size,placement:context.placement});
}
$('.menu-button').addEventListener('click',e=>{const b=e.currentTarget;const open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));$('#mobile-menu').hidden=!open;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#mobile-menu').hidden){$('#mobile-menu').hidden=true;$('.menu-button').setAttribute('aria-expanded','false');$('.menu-button').focus();}});
$('.dialog-close').addEventListener('click',closeDialog);
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
dialog.addEventListener('cancel',()=>{track('dp_form_close',{placement:'result'});});
for(const a of $$('a[href^="tel:"]'))a.addEventListener('click',()=>track('dp_phone_click',{placement:a.closest('header')?'header':'footer'}));
for(const a of $$('a.btn'))a.addEventListener('click',()=>track('dp_cta_click',{placement:placement(a)}));
for(const b of $$('[data-inquiry]'))b.addEventListener('click',()=>openInquiry(b));
$('[data-resume-inquiry]').addEventListener('click',e=>openInquiry(e.currentTarget));
$('[data-dismiss-resume]').addEventListener('click',()=>$('#resume').hidden=true);
for(const d of $$('details:not(.form-details)'))d.addEventListener('toggle',()=>{if(d.open)track(d.querySelector('table')?'dp_quote_view':'dp_faq_open',{placement:'faq'});});
form.addEventListener('submit',async e=>{
 e.preventDefault();if(sending||sent||fields.disabled||!form.reportValidity())return;
 const values=Object.fromEntries(['name','phone','channel','settlement','comment'].map(n=>[n,getField(n).value]));
 let payload;sending=true;
 try{payload=inquiryPayload(book,context.selection,values,context,requestId||crypto.randomUUID());
  const attribution=analytics?.attribution(),clientId=await analytics?.clientID();if(attribution||clientId)payload.attribution={...attribution,...(clientId?{clientId}:{})};
  const {requestId:ignored,...body}=payload;const key=JSON.stringify(body);
  if(key!==lastBody){requestId=crypto.randomUUID();lastBody=key;}payload.requestId=requestId;
 }catch{sending=false;status.textContent='Проверьте мобильный номер: +7 и ещё 10 цифр.';status.className='form-status error';getField('phone').setAttribute('aria-invalid','true');getField('phone').focus();track('dp_form_error',{error_type:'validation'});return;}
 getField('phone').removeAttribute('aria-invalid');sending=true;fields.disabled=true;status.className='form-status';status.textContent='Передаём ваш запрос…';track('dp_form_submit_attempt',{flow:payload.flow,purpose:context.purpose,model:context.selection?.model});
 try{const result=await submitLead(payload,settings,location.origin);sent=true;fields.hidden=true;status.className='form-status success';status.textContent=location.hostname==='127.0.0.1'?'Тестовая заявка принята в локальной версии. Реальным менеджерам ничего не отправлено.':'Заявка принята. Передали ваш выбор и пожелания менеджеру. '+(payload.contactChannel==='phone'?'Свяжемся по указанному телефону.':'Свяжемся в выбранном мессенджере.');analytics?.confirmed(result.receipt,{flow:payload.flow,requestId:payload.requestId,purpose:context.purpose,model:context.selection?.model});}
 catch(error){status.className='form-status error';status.textContent=error.message==='RATE_LIMITED'?'Слишком много попыток. Попробуйте позже или позвоните нам.':'Пока не получили подтверждение заявки. Ваши данные остались в форме. Попробуйте ещё раз или позвоните нам.';track('dp_form_error',{error_type:error.message==='RATE_LIMITED'?'rate_limit':'network'});}
 finally{sending=false;fields.disabled=false;getField('channel').disabled=!context.selection;}
});
// A native scrolling page: no wheel capture, no pointer lock, no video payload.
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const hero=$('.hero'),depthScenes=$$('[data-depth-scene]');let ticking=false;
function depthFrame(){
 ticking=false;if(reduce.matches)return;
 if(hero){const r=hero.getBoundingClientRect();if(r.bottom>=0&&r.top<=innerHeight)hero.style.setProperty('--hero-p',String(Math.max(0,Math.min(1,-r.top/(r.height||1)))));}
 for(const scene of depthScenes){const r=scene.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)continue;scene.style.setProperty('--depth-p',String(Math.max(0,Math.min(1,(innerHeight-r.top)/(innerHeight+r.height)))));}
}
function scheduleDepth(){if(!ticking&&!reduce.matches){ticking=true;requestAnimationFrame(depthFrame);}}
addEventListener('scroll',scheduleDepth,{passive:true});addEventListener('resize',scheduleDepth,{passive:true});scheduleDepth();
reduce.addEventListener('change',()=>{if(hero)hero.style.setProperty('--hero-p','0');for(const scene of depthScenes)scene.style.setProperty('--depth-p','0');scheduleDepth();});
function ritual(key){for(const img of $$('[data-ritual-image]')){const active=img.dataset.ritualImage===key;img.classList.toggle('active',active);img.setAttribute('aria-hidden',String(!active));}for(const b of $$('[data-ritual]'))b.setAttribute('aria-pressed',String(b.dataset.ritual===key));}
for(const b of $$('[data-ritual]'))b.addEventListener('click',()=>{
 ritual(b.dataset.ritual);
 if(matchMedia('(max-width:760px)').matches){const rail=$('.ritual-notes'),target=$(`[data-ritual-step="${b.dataset.ritual}"]`);if(rail&&target)rail.scrollTo({left:target.offsetLeft-rail.offsetLeft,behavior:reduce.matches?'instant':'smooth'});}
});
if('IntersectionObserver'in window){
 const io=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio);if(visible[0])ritual(visible[0].target.dataset.ritualStep)},{threshold:[.4,.7],rootMargin:'-15% 0px -20% 0px'});for(const el of $$('[data-ritual-step]'))io.observe(el);
 const re=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){e.target.classList.remove('pending');re.unobserve(e.target)}},{threshold:.08});for(const el of $$('.section-heading,.works-grid .work,.steps li')){el.classList.add('reveal');if(el.getBoundingClientRect().top>innerHeight)el.classList.add('pending');re.observe(el)}document.documentElement.classList.add('js-ready');
}
addEventListener('load',()=>{if(window.ScrollCraft)window.ScrollCraft.mount(document.querySelector('main'));},{once:true});
try{
 [book,settings,photos,plans]=await Promise.all(['/data/catalog-pricebook.json','/data/site-settings.json','/data/photo-references.json','/r101/plans.json'].map(async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('LOAD');return r.json()}));
 analytics?.start(settings);
 const q=new URLSearchParams(location.search),pathModel=Object.keys(names).find(m=>location.pathname===`/bani/${m==='kvadro-house'?'kvadro-haus':m}/`);
 let initial=pathModel?{model:pathModel,size:q.get('size')}:q.has('model')&&!location.pathname.startsWith('/planirovki')?{model:q.get('model'),size:q.get('size')}:storage.read();
 if(initial)updateSelection(initial,false);
 if(pathModel)track('dp_model_view',{model:pathModel,placement:'model'});
 if(location.hash==='#photos')$('.construction')?.setAttribute('open','');
 const requestedPhoto=pathModel&&safeReference(photos,q.get('photo'),pathModel);
 if(requestedPhoto){const trigger=$(`[data-photo="${CSS.escape(requestedPhoto.photoId)}"]`);if(trigger){$('.construction')?.setAttribute('open','');trigger.closest('figure')?.scrollIntoView({block:'center',behavior:'instant'});}}
 if(q.get('plan')&&withdrawnPlans.has(q.get('plan'))){const note=$('#plan-notice');if(note){note.hidden=false;note.textContent='Эта схема уточняется и временно не показывается. Можно обсудить помещения с менеджером.';}}
 if(location.pathname==='/planirovki/'){
  const filter=Object.hasOwn(names,q.get('model'))?q.get('model'):null;
  for(const el of $$('[data-plan-model]'))el.hidden=!!filter&&el.dataset.planModel!==filter;
  for(const a of $$('.filters a'))if((new URL(a.href).searchParams.get('model')||null)===filter)a.setAttribute('aria-current','page');
  const wanted=plans.find(p=>p.id===q.get('plan'));if(wanted){const el=$('#plan-'+CSS.escape(wanted.id));if(el&&!el.hidden)el.scrollIntoView({block:'start',behavior:'instant'});}
 }
 for(const picker of $$('[data-size-picker]'))picker.addEventListener('change',()=>{updateSelection({model:picker.dataset.sizePicker,size:picker.value});track('dp_size_select',{model:choice.model,size:choice.size,package:'comfort',placement:'catalog'});if(pathModel===choice.model){const url=new URL(location.href);url.searchParams.set('size',choice.size);history.replaceState(null,'',url)}});
 for(const b of $$('[data-save]'))b.addEventListener('click',async()=>{const select=$(`[data-size-picker="${b.dataset.save}"]`);updateSelection({model:b.dataset.save,size:select.value});const text=choiceText(choice)+' · Комфорт\nПечь, полки, мебель и свет входят в Комфорт.\n'+selectionLink(location.origin,choice);try{await navigator.clipboard.writeText(text);announce('Ссылка на выбранную баню скопирована.')}catch{const a=document.createElement('a');const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));a.href=url;a.download='ДачаПар-мой-выбор.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('Выбор сохранён в файл.')}track('dp_quote_save',{model:choice.model,size:choice.size,placement:'catalog'});});
}catch{for(const b of $$('[data-inquiry],[data-save]'))b.title='Расчёт не загрузился. Доступен звонок: +7 (951) 734-99-99';}

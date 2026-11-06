const origin=typeof location==='undefined'?'':location.origin;
const codes=new Set(['page_view','dp_model_view','dp_model_select','dp_size_select','dp_plan_view','dp_plan_select','dp_cta_click','dp_form_open','dp_form_close','dp_form_submit_attempt','dp_quiz_start','dp_quiz_answer','dp_quiz_result','dp_3d_open','dp_3d_rotate','dp_3d_close','active_time_ping']);
let enabled=false,queue=[],sending=false,pendingFlush=null,visitContext=null,timer,trigger=null,lastCtaName=null,lastInteraction=Date.now(),lastBeat=Date.now();
const recentEvents=new Map();
export const cookieChoice=(env=globalThis)=>{try{return String(env.document?.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('dp_consent='))?.slice('dp_consent='.length)??null;}catch{return null;}};
function context(){
 if(typeof location==='undefined')return {};
 const q=new URL(location.href).searchParams;let referrer_host='';try{const u=new URL(document.referrer);if(u.origin!==origin)referrer_host=u.hostname;}catch{}
 const limited=(key,max)=>{const value=q.get(key);return value&&value.length<=max?value:undefined;};
 return {context:limited('dp_ctx',1800),visit_context:visitContext??undefined,utm_source:limited('utm_source',80),utm_medium:limited('utm_medium',40),utm_campaign:limited('utm_campaign',80),utm_content:limited('utm_content',80),yclid:limited('yclid',150),gclid:limited('gclid',150),referrer_host:referrer_host.slice(0,150),page_path:location.pathname.slice(0,160)};
}
function selection(){const q=new URL(location.href).searchParams;return {model_id:q.get('bath')??q.get('model')??undefined,size_id:q.get('bathSize')??undefined,plan_id:q.get('layout')??q.get('plan')??undefined};}
export function journeyEvent(event_code,params={}){
 if(!enabled||cookieChoice()!=='all'||!codes.has(event_code))return null;
 const event={event_id:crypto.randomUUID(),event_code,page_path:location.pathname,...selection()};
 if(params.model_id&&params.model_id!==event.model_id){delete event.size_id;delete event.plan_id;}
 if(params.size_id&&params.size_id!==event.size_id)delete event.plan_id;
 for(const key of ['model_id','size_id','plan_id','cta_id','placement','purpose','step','active_seconds']){const value=params[key];if((typeof value==='string'&&value.length<=80)||(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=15))event[key]=value;}
 const key=event_code==='dp_model_select'?event_code+'|'+event.model_id:event_code==='dp_size_select'?event_code+'|'+event.model_id+'|'+event.size_id:event_code==='dp_cta_click'?event_code+'|'+event.cta_id:event_code+'|'+event.model_id+'|'+event.size_id+'|'+event.plan_id+'|'+event.step;
 const old=recentEvents.get(key),now=Date.now();if(old&&now-old.at<150)return old.id;recentEvents.set(key,{at:now,id:event.event_id});if(recentEvents.size>100)for(const [k,v]of recentEvents)if(now-v.at>1000)recentEvents.delete(k);
 if(queue.length>=30)queue.shift();queue.push(event);if(event_code==='dp_cta_click'){trigger=event.event_id;lastCtaName=event.cta_id??'unknown';}
 clearTimeout(timer);timer=setTimeout(()=>{timer=null;flushJourney();},1500);return event.event_id;
}
export function journeyFormOpened(opener,reason='quote'){
 const map={layout_quote:['layout_quote','plans'],production:['production','final'],foundation:['foundation','model']};
 let [cta_id,placement]=map[reason]??['unknown','unknown'];
 if(!map[reason]){if(opener?.closest?.('#contact,footer'))[cta_id,placement]=['footer_quote','footer'];else if(opener?.closest?.('header'))[cta_id,placement]=['header_quote','header'];else if(opener?.closest?.('#bath-model'))[cta_id,placement]=['catalog_quote','catalog'];else if(opener?.closest?.('#breath'))[cta_id,placement]=['contact','final'];}
 journeyEvent('dp_cta_click',{cta_id,placement,purpose:reason});
}
export async function flushJourney(){
 if(sending)return pendingFlush;
 if(!enabled||cookieChoice()!=='all'||!queue.length)return;
 sending=true;const events=queue.splice(0,30);
 pendingFlush=(async()=>{try{const response=await fetch('/api/analytics/events/batch',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...context(),events}),signal:AbortSignal.timeout(1500),keepalive:true});if(!response.ok)throw Error('TRACKING_UNAVAILABLE');const data=await response.json();if(typeof data.visit_context==='string'&&data.visit_context.length<1800)visitContext=data.visit_context;}
 catch{queue=[...events,...queue].slice(-30);}finally{sending=false;pendingFlush=null;if(queue.length&&!timer)timer=setTimeout(()=>{timer=null;flushJourney();},15000);}})();return pendingFlush;
}
export async function leadJourneyContext(){
 if(typeof window==='undefined')return undefined;
 try{if(enabled&&cookieChoice()==='all')await Promise.race([flushJourney(),new Promise(resolve=>setTimeout(resolve,350))]);return {...context(),trigger_event_id:trigger??undefined};}catch{return context();}
}
function banner(){
 if(document.querySelector('#dp-cookie-banner'))return;
 const box=document.createElement('section');box.id='dp-cookie-banner';box.className='dp-cookie-banner';box.setAttribute('aria-label','Настройки аналитики');
 const title=document.createElement('h2');title.textContent='Настройки сайта';
 const text=document.createElement('p');text.textContent='Разрешите собирать статистику посещений? Она помогает нам сделать сайт удобнее.';
 const policy=document.createElement('a');policy.href='/privacy.html';policy.textContent='Правила обработки и хранения данных';const actions=document.createElement('div'),status=document.createElement('p');status.setAttribute('role','status');
 const choice=async value=>{
  const previous=cookieChoice();
  const buttons=[...box.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);status.textContent='Сохраняем выбор…';
  try{const response=await fetch('/api/analytics/consent',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({choice:value,version:'crm-cookies-20261105'}),signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('CONSENT_UNAVAILABLE');
   if(value==='necessary'||previous!=='all')try{localStorage.removeItem('dp_attribution_v1');}catch{}
   if(value==='necessary'){queue=[];trigger=null;lastCtaName=null;visitContext=null;for(const raw of document.cookie.split(';')){const name=raw.split('=')[0].trim();if(name.startsWith('_ym_')){document.cookie=name+'=; Max-Age=0; Path=/';document.cookie=name+'=; Max-Age=0; Path=/; Domain='+location.hostname;}}}
   box.remove();document.dispatchEvent(new CustomEvent('dachapar:consent',{detail:{choice:value}}));if(value==='all')journeyEvent('page_view');else if(previous==='all')location.reload();
  }catch{status.textContent='Не удалось сохранить выбор. Можно продолжить пользоваться сайтом и отправлять заявки.';buttons.forEach(b=>b.disabled=false);}
 };
 for(const [value,label]of [['all','Разрешить аналитику'],['necessary','Только необходимое']]){const button=document.createElement('button');button.type='button';button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 4l9 7v9H3z M10 20v-6h4v6 M17 7V4h3v5"/></svg>';button.append(label);button.addEventListener('click',()=>choice(value));actions.append(button);}box.append(title,text,actions,policy,status);document.body.append(box);
}
function clickContext(event){
 const target=event.target.closest?.('button,a');if(!target)return;
 const model=target.dataset.modelCard,size=target.dataset.sizePicker,plan=target.closest('[data-plan-options]')?target.textContent.trim().toLowerCase():null;
 if(model)journeyEvent('dp_model_select',{model_id:model});if(size)journeyEvent('dp_size_select',{size_id:size});if(plan&&/^dp3d-\d{2}$/.test(plan))journeyEvent('dp_plan_select',{plan_id:plan});
 const rules=[['[data-plan-request]','catalog_quote','catalog'],['[data-start-quiz]','hero_help','hero'],['[data-production]','production','final'],['[data-foundation]','foundation','model'],['.hh-plan-overview .choice-primary','layout_quote','plans'],['#dp-quiz-contact-form button[type=submit]','quiz_catalog','quiz'],['[data-inquiry]','contact','final'],['#inquiry-open','contact','header']];
 for(const [selector,cta_id,placement]of rules)if(target.matches(selector)){journeyEvent('dp_cta_click',{cta_id,placement});break;}
}
async function install(){
 if(!/^https?:$/.test(location.protocol)||/^\/(?:manager\.html|api\/)/.test(location.pathname))return;
 try{const response=await fetch('/api/analytics/config',{cache:'no-store',signal:AbortSignal.timeout(3000)});const config=await response.json();if(!response.ok)return;enabled=config.enabled===true;}catch{return;}
 if(document.cookie.split(';').some(c=>c.trim()==='dp_staff=1')){enabled=false;return;}
 const css=document.createElement('link');css.rel='stylesheet';css.href='/journey-tracker.css?v=welcome-20261106';document.head.append(css);
 const preferences=document.createElement('button');preferences.type='button';preferences.className='dp-cookie-settings';preferences.textContent='Настройки аналитики';preferences.addEventListener('click',banner);(document.querySelector('footer')??document.body).append(preferences);
 if(!['all','necessary'].includes(cookieChoice()))banner();else if(cookieChoice()==='all')journeyEvent('page_view');
 document.addEventListener('dachapar:event',event=>{const {name,params={}}=event.detail??{};if(name==='dp_quiz_catalog_cta'){journeyEvent('dp_cta_click',{cta_id:'quiz_catalog',placement:'quiz'});return;}if(name==='dp_cta_click'||name==='dp_form_open')return;journeyEvent(name,{...params,model_id:params.model??params.model_id,size_id:params.size??params.size_id});});
 document.addEventListener('click',clickContext,true);
 const forms=new WeakSet();const observe=()=>{for(const d of document.querySelectorAll('dialog[open]'))if(d.querySelector('form')&&!forms.has(d)){forms.add(d);journeyEvent('dp_form_open',{cta_id:lastCtaName??undefined});d.addEventListener('close',()=>{journeyEvent('dp_form_close');trigger=null;lastCtaName=null;forms.delete(d);},{once:true});}};
 const observer=new MutationObserver(observe);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});observe();
 for(const event of ['pointerdown','keydown','scroll'])document.addEventListener(event,()=>{lastInteraction=Date.now();},{passive:true});
 setInterval(()=>{const now=Date.now();if(document.visibilityState==='visible'&&document.hasFocus()&&now-lastInteraction<60000)journeyEvent('active_time_ping',{active_seconds:Math.min(10,(now-lastBeat)/1000)});lastBeat=now;},10000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushJourney();});
}
if(typeof window!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}

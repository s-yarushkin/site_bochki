export const CONSENT_VERSION='crm-cookies-20261109';
export const CONSENT_ACTIONS=Symbol.for('dachapar.analytics-consent');
export const readConsent=(env=globalThis)=>String(env.document?.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('dp_consent='))?.slice(11)??null;
const methods=new Set(['banner','settings','form-submit','quiz-start']);
export function createConsentActions(env){
 let pending=null,pendingChoice=null;
 function save(choice,method='banner'){
  if(!['all','necessary'].includes(choice)||!methods.has(method))return Promise.resolve(false);
  if(pending)return pendingChoice===choice?pending:pending.then(()=>save(choice,method));
  // Submitting a request or starting a quiz never overrides explicit refusal.
  if(['form-submit','quiz-start'].includes(method)&&readConsent(env)==='necessary')return Promise.resolve(false);
  if(choice==='all'&&readConsent(env)==='all')return Promise.resolve(true);
  pendingChoice=choice;
  pending=(async()=>{try{
   const r=await env.fetch('/api/analytics/consent',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({choice,version:CONSENT_VERSION+'-'+method}),signal:env.AbortSignal?.timeout?.(4000)});
   if(!r.ok)return false;
   env.document.dispatchEvent(new env.CustomEvent('dachapar:consent',{detail:{choice,method}}));return true;
  }catch{return false;}finally{pending=null;pendingChoice=null;}})();return pending;
 }
 return {save,pending:()=>pending};
}
export const consentActions=typeof window==='undefined'?null:(window[CONSENT_ACTIONS]??=createConsentActions(window));
export function mountConsentActions({document=globalThis.document,actions=consentActions}={}){
 if(!document||!actions)return;
 const link=(text,href)=>{const a=document.createElement('a');a.textContent=text;a.href=href;a.target='_blank';a.rel='noopener';return a;};
 function scan(){
  for(const a of document.querySelectorAll('form a[href*="consent.html"]')){
   const p=a.closest('p'),form=a.closest('form');if(!p||!form||p.querySelector('[data-dp-analytics-link]'))continue;
   if(!/нажимая|отправляя/i.test(p.textContent))continue;
   const analyticsLink=link('аналитику сайта и рекламы','/analytics-consent.html');analyticsLink.dataset.dpAnalyticsLink='';
   p.replaceChildren(document.createTextNode('Нажимая кнопку отправки, вы даёте согласие на '),link('обработку данных','/consent.html'),document.createTextNode(' и '),analyticsLink,document.createTextNode('.'));
   form.dataset.dpAnalyticsNotice=CONSENT_VERSION;
  }
  for(const b of document.querySelectorAll('[data-dpq-open],#dp-quiz-open')){
   if(b.dataset.dpAnalyticsNotice||b.closest('form'))continue;
   const p=document.createElement('p');p.className='dp-analytics-note';p.append(document.createTextNode('Нажимая «'+b.textContent.replace(/[→↗]/g,'').trim()+'», вы даёте '),link('согласие на статистику сайта и рекламы','/analytics-consent.html'),document.createTextNode('.'));
   b.after(p);b.dataset.dpAnalyticsNotice=CONSENT_VERSION;
  }
 }
 scan();const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});
 document.addEventListener('submit',event=>{if(event.isTrusted!==false&&event.target?.dataset?.dpAnalyticsNotice===CONSENT_VERSION)actions.save('all','form-submit');},true);
 document.addEventListener('click',event=>{if(event.isTrusted===false)return;const b=event.target.closest?.('[data-dpq-open],#dp-quiz-open');if(b?.dataset.dpAnalyticsNotice===CONSENT_VERSION)actions.save('all','quiz-start');},true);
 return ()=>observer.disconnect();
}

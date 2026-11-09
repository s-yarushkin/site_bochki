export const CONSENT_VERSION='crm-cookies-20261107';
export function showConsentBanner({mode='initial',readChoice,aggregate,onSaved,env=globalThis}={}){
 const {document}=env;if(document.querySelector('#dp-cookie-banner'))return;
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const box=node('section',null,'dp-cookie-banner');box.id='dp-cookie-banner';box.setAttribute('role','region');box.setAttribute('aria-labelledby','dp-cookie-title');
 const heading=node('h2',mode==='settings'?'Настройки аналитики':'Сделаем выбор бани удобнее');heading.id='dp-cookie-title';
 const dismiss=node('button','×','dp-cookie-dismiss');dismiss.type='button';dismiss.setAttribute('aria-label','Закрыть уведомление без изменения выбора');dismiss.addEventListener('click',()=>{if(mode==='initial')try{env.sessionStorage?.setItem('dp_analytics_banner_dismissed','1');}catch{}box.remove();document.documentElement.classList.remove('dp-consent-open');});
 const text=node('p','С вашего согласия включим Яндекс Метрику. Историю выбора на нашем сайте сохраним до 180 дней. Сайт и заявки доступны при любом выборе.');
 const actions=node('div',null,'dp-cookie-actions'),details=node('a','Об аналитике и согласии','dp-cookie-policy'),status=node('p',null,'dp-cookie-status');details.href='/analytics-consent.html';details.target='_blank';details.rel='noopener';status.setAttribute('role','status');
 const placement=mode==='initial'?'cookie_banner':'cookie_settings';let busy=false;
 async function choose(value){if(busy)return;busy=true;const buttons=[...actions.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);status.textContent='Сохраняем выбор…';const previous=readChoice();
  try{const r=await env.fetch('/api/analytics/consent',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({choice:value,version:CONSENT_VERSION}),signal:env.AbortSignal?.timeout?.(5000)});if(!r.ok)throw Error('CONSENT_UNAVAILABLE');
   aggregate?.record(value==='all'?'consent_accept':'consent_decline',{placement});box.remove();document.documentElement.classList.remove('dp-consent-open');onSaved?.(value,previous);
  }catch{status.textContent='Выбор не сохранился. Можно повторить или продолжить пользоваться сайтом — заявки работают.';busy=false;buttons.forEach(b=>b.disabled=false);}
 }
 for(const [value,label]of [['all','Разрешить аналитику'],['necessary','Без аналитики']]){const b=node('button',label,'dp-cookie-choice');b.type='button';b.addEventListener('click',()=>choose(value));actions.append(b);}
 box.append(heading,dismiss,text,actions,details,status);document.body.append(box);document.documentElement.classList.add('dp-consent-open');if(mode==='initial')aggregate?.record('consent_shown',{placement});
 return box;
}

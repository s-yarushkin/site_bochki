import {CONSENT_VERSION,CONSENT_ACTIONS,createConsentActions} from './consent-actions.mjs';
export {CONSENT_VERSION};
export function showConsentBanner({mode='initial',readChoice,aggregate,onSaved,env=globalThis}={}){
 const {document}=env;const flow=env[CONSENT_ACTIONS]??=createConsentActions(env);if(document.querySelector('#dp-cookie-banner'))return;
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const box=node('section',null,'dp-cookie-banner');box.id='dp-cookie-banner';box.setAttribute('role','region');box.setAttribute('aria-label','Статистика сайта');
 const text=node('p',mode==='settings'?'Выберите, разрешать ли подробную статистику сайта.':'Собираем статистику действий для улучшения сайта. Нажимая «Хорошо», вы даёте согласие на такую обработку данных.');
 const actions=node('div',null,'dp-cookie-actions'),details=node('a','Условия обработки','dp-cookie-policy'),status=node('p',null,'dp-cookie-status');details.href='/analytics-consent.html';details.target='_blank';details.rel='noopener';status.setAttribute('role','status');
 const placement=mode==='initial'?'cookie_banner':'cookie_settings';let busy=false;
 async function choose(value){if(busy)return;busy=true;const buttons=[...actions.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);status.textContent='Сохраняем выбор…';const previous=readChoice();
  try{if(!await flow.save(value,mode==='initial'?'banner':'settings'))throw Error('CONSENT_UNAVAILABLE');
   aggregate?.record(value==='all'?'consent_accept':'consent_decline',{placement});box.remove();document.documentElement.classList.remove('dp-consent-open');onSaved?.(value,previous);
  }catch{status.textContent=flow.failure?.()==='rate-limit'?'Слишком много попыток. Повторите через минуту.':'Не удалось связаться с сервером. Нажмите «Хорошо» ещё раз — сайт и заявки работают.';busy=false;buttons.forEach(b=>b.disabled=false);}
 }
 for(const [value,label]of (mode==='settings'?[['all','Хорошо'],['necessary','Без аналитики']]:[['all','Хорошо']])){const b=node('button',label,'dp-cookie-choice');b.type='button';b.addEventListener('click',()=>choose(value));actions.append(b);}
 const links=node('div',null,'dp-cookie-links');links.append(details);if(mode==='initial'){const preferences=node('button','Настройки','dp-cookie-policy dp-cookie-preferences');preferences.type='button';preferences.addEventListener('click',()=>{box.remove();showConsentBanner({mode:'settings',readChoice,aggregate,onSaved,env});});links.append(preferences);}
 box.append(text,actions,links,status);document.body.append(box);document.documentElement.classList.add('dp-consent-open');if(mode==='initial')aggregate?.record('consent_shown',{placement});
 return box;
}

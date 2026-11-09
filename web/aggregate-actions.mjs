export const COUNTER_EVENTS=new Set(['dp_model_view','dp_model_select','dp_size_select','dp_plan_view','dp_plan_select','dp_cta_click','dp_form_open','dp_form_close','dp_form_submit_attempt','dp_quiz_start','dp_quiz_answer','dp_quiz_result','dp_quiz_invite_view','dp_quiz_invite_close','dp_quiz_completed','dp_quiz_close_before_completed','dp_quiz_close_after_completed','dp_3d_open','dp_3d_close','dp_gallery_open','dp_plan_mirror','dp_plan_compare','dp_package_select','dp_compare_view','dp_faq_open','dp_phone_click','dp_delivery_start','dp_base_kit_open','consent_shown','consent_accept','consent_decline']);
const models=new Set(['kvadro','parus','viking','kvadro-house']),ctas=new Set(['header_quote','hero_help','catalog_quote','layout_quote','footer_quote','quiz_catalog','production','foundation','contact','unknown']),places=new Set(['header','hero','catalog','model','plans','gallery','quiz','footer','final','unknown','cookie_banner','cookie_settings']);
const pages=new Set(['/','/bani/','/planirovki/','/novyy-god/','/novyy-god-2027/','/bani/kvadro/','/bani/parus/','/bani/viking/','/bani/kvadro-haus/']);
export function aggregateContext(location,referrer=''){
 const u=new URL(location.href),q=u.searchParams,known=new Set(['yandex','google','vk','youtube','telegram','max','partner','offline']),raw=(q.get('utm_source')??'').toLowerCase();let source=known.has(raw)?raw:raw?'other':'direct',channel='direct',host='';
 try{const ref=new URL(referrer);if(ref.origin!==u.origin)host=ref.hostname.toLowerCase();}catch{}
 const is=d=>host===d||host.endsWith('.'+d);if(source==='direct'&&host){source=is('yandex.ru')||host==='ya.ru'?'yandex':is('google.com')||is('google.ru')?'google':is('vk.com')||is('vk.ru')?'vk':is('youtube.com')||is('youtu.be')?'youtube':is('t.me')||is('telegram.org')?'telegram':'other';channel='other_referral';}
 const medium=(q.get('utm_medium')??'').toLowerCase();if(q.has('yclid')||q.has('gclid')||['cpc','ppc','paid','paid_social','display','cpm'].includes(medium)){channel='paid';if(source==='direct')source=q.has('yclid')?'yandex':q.has('gclid')?'google':'other';}else if(['yandex','google'].includes(source)&&host)channel='search_organic';else if(['vk','youtube'].includes(source))channel='social_organic';else if(['telegram','max'].includes(source))channel='messenger';else if(['partner','offline'].includes(source))channel='partner_referral';else if(source==='other')channel='other_referral';else if(source!=='direct')channel='unknown';
 return {page:pages.has(u.pathname)?u.pathname:'/other/',source,channel};
}
export function createAggregateActions(env){
 let enabled=false,queue=[],timer=null;const recent=new Map();
 const staff=()=>String(env.document?.cookie??'').split(';').some(c=>c.trim()==='dp_staff=1');
 function flush(){if(timer){env.clearTimeout(timer);timer=null;}if(!enabled||staff()||!queue.length){queue=[];return Promise.resolve();}const events=queue.splice(0,30);
  // No identifiers, exact timestamps, full URLs/referrers, campaign or click IDs.
  // No retry: a lost response must not silently double-count an accepted batch.
  return env.fetch('/api/analytics/counters',{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify({...aggregateContext(env.location,env.document.referrer),events}),keepalive:true,signal:env.AbortSignal?.timeout?.(3000)}).catch(()=>{});
 }
 function record(event_code,params={}){if(!enabled||staff()||!COUNTER_EVENTS.has(event_code))return false;const e={event_code};if(models.has(params.model_id))e.model_id=params.model_id;if(ctas.has(params.cta_id))e.cta_id=params.cta_id;if(places.has(params.placement))e.placement=params.placement;if(Number.isInteger(params.step)&&params.step>=1&&params.step<=7)e.step=params.step;
  const key=JSON.stringify(e),time=Date.now();if(time-(recent.get(key)??0)<150)return false;recent.set(key,time);if(recent.size>100)for(const [k,v]of recent)if(time-v>1000)recent.delete(k);if(queue.length<30)queue.push(e);if(!timer)timer=env.setTimeout(flush,800);return true;
 }
 return {record,flush,start(config){enabled=config?.aggregate_enabled===true&&!staff();return enabled;}};
}
export const aggregateActions=typeof window==='undefined'?null:createAggregateActions(window);

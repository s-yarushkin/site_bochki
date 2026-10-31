export const GOALS=Object.freeze(['dp_lead_confirmed','dp_quote_lead_confirmed','dp_callback_lead_confirmed','dp_premium_quote_confirmed','dp_detailed_quote_confirmed','dp_phone_click','dp_form_open','dp_form_close','dp_form_error','dp_form_submit_attempt','dp_builder_start','dp_builder_complete','dp_builder_interaction','dp_model_view','dp_model_select','dp_size_select','dp_base_kit_open','dp_gallery_open','dp_cta_click','dp_plan_view','dp_plan_select','dp_plan_mirror','dp_plan_compare','dp_package_select','dp_reference_select','dp_quote_view','dp_quote_save','dp_quote_share','dp_quote_restore','dp_delivery_start','dp_compare_view','dp_faq_open', 'dp_quiz_invite_view','dp_quiz_invite_close','dp_quiz_start','dp_quiz_answer','dp_quiz_result','dp_quiz_plan_open','dp_quiz_catalog_cta','dp_quiz_catalog_sent']);
const goals=new Set(GOALS),receipts=new Set(GOALS.filter(x=>x.includes('_confirmed')));
const placements=new Set(['header','hero','catalog','base','bundle','personal','delivery','builder','faq','final','footer','mobile','seo','model','plans','gallery','packages','result','compare','unknown']);
const models=new Set(['kvadro','viking','parus','kvadro-house']);
const purposes=new Set(['quote','callback','plan','plan_info','photo','delivery','selection_help']);
const touchKey='dp_attribution_v1',seenKey='dp_counted_leads_v1';
export const cleanCampaign=(v,max=180)=>typeof v==='string'&&v.length>0&&v.length<=max&&/^[a-zA-Z0-9а-яА-ЯёЁ _.:+\-/(),]{1,180}$/.test(v)?v:null;
const token=(v,max=90)=>typeof v==='string'&&v.length<=max&&/^[a-zA-Z0-9а-яА-ЯёЁ_.:+-]+$/.test(v)?v:null;
const safePath=p=>typeof p==='string'&&/^\/[a-z0-9/_.-]{0,120}$/.test(p)?p:'/';
export function safeParams(params={}){
 const result={event_version:2};let place=params.placement?.replace(/^landing_/,'');
 place=({selection:'builder',configure:'builder',contact:'final',closing:'final',menu:'mobile',page:'unknown',packages_base:'bundle',packages_comfort:'bundle',hero_compare:'hero'})[place]||place;
 if(placements.has(place))result.placement=place;
 if(models.has(params.model||params.model_id))result.model=params.model||params.model_id;
 if(['quote','callback'].includes(params.flow))result.flow=params.flow;
 if(typeof params.size==='string'&&/^(?:[456][05]0|[456]x[456])$/.test(params.size))result.size=params.size;
 if(Number.isInteger(params.step)&&params.step>=1&&params.step<=7)result.step=params.step;
 if(['comfort','deluxe','custom'].includes(params.package))result.package=params.package;
 if(purposes.has(params.purpose))result.purpose=params.purpose;
 for(const key of ['plan_id','object_id','photo_id','experiment_id','variant'])if(typeof params[key]==='string'&&/^[a-zA-Z0-9_-]{1,90}$/.test(params[key]))result[key]=params[key];
 if(typeof params.mirrored==='boolean')result.mirrored=params.mirrored;
 if(typeof params.page_path==='string')result.page_path=safePath(params.page_path);
 if(['validation','network','rate_limit','in_progress'].includes(params.error_type))result.error_type=params.error_type;
 return result;
}
export function createAnalytics(env){
 let active=false,counterId=null;const counted=new Set();
 const store=type=>{try{return env[type]}catch{return null}};
 function touch(){
  const q=new URLSearchParams(env.location.search),value={landing:safePath(env.location.pathname)};
  for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','yclid']){const v=key==='yclid'?token(q.get(key),180):cleanCampaign(q.get(key));if(v)value[key]=v}
  try{const h=new URL(env.document.referrer).hostname.toLowerCase();value.referrer=h==='yandex.ru'||h.endsWith('.yandex.ru')?'yandex':h==='google.com'||h.endsWith('.google.com')?'google':'external'}catch{}
  return value;
 }
 function remember(){
  const s=store('localStorage');if(!s)return;
  let previous;try{previous=JSON.parse(s.getItem(touchKey)||'null')}catch{}
  const now=Date.now(),fresh=touch(),old=previous&&Number.isFinite(previous.at)&&now-previous.at<30*86400000?previous:null;
  const campaign=Object.keys(fresh).some(k=>k==='yclid'||k.startsWith('utm_'));
  try{s.setItem(touchKey,JSON.stringify({first:old?.first||fresh,last:campaign||!old?fresh:old.last,at:now}))}catch{}
 }
 function emit(name,params={}){
  if(!goals.has(name))return false;const safe=safeParams({...params,page_path:env.location.pathname});
  env.document.dispatchEvent(new env.CustomEvent('dachapar:event',{detail:{name,params:safe}}));
  if(!active||typeof env.ym!=='function')return false;
  try{env.ym(counterId,'reachGoal',name,safe);return true}catch{return false}
 }
 function track(name,params={}){if(receipts.has(name))return false;return emit(name,params)}
 function start(settings){
  const c=settings?.analytics;if(active)return true;
  if(c?.enabled!==true||c.counterId!==113675581||env.location.origin!==settings.productionOrigin||!c.allowedOrigins?.includes(env.location.origin))return false;
  active=true;counterId=c.counterId;remember();
  // The landing URL and functional choice parameters are owned by their consumers.
  // Analytics never rewrites the URL, before or after counter initialization.
  if(typeof env.ym!=='function'){const stub=function(){(stub.a=stub.a||[]).push(arguments)};stub.l=Date.now();env.ym=stub}
  env.ym(counterId,'init',{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:c.webvisor===true});
  if(!env.document.querySelector('script[data-dp-metrika]')){const s=env.document.createElement('script');s.async=true;s.src='https://mc.yandex.ru/metrika/tag.js?id='+counterId;s.dataset.dpMetrika='1';env.document.head.append(s)}
  return true;
 }
 function attribution(){if(!active)return null;remember();try{const value=JSON.parse(store('localStorage')?.getItem(touchKey)||'null');return value?{first:value.first,last:value.last}:null}catch{return null}}
 function clientID(){
  if(!active||typeof env.ym!=='function')return Promise.resolve(null);
  return new Promise(resolve=>{let done=false;const finish=value=>{if(done)return;done=true;resolve(typeof value==='string'&&/^\d{1,24}$/.test(value)?value:null)};setTimeout(()=>finish(null),350);try{env.ym(counterId,'getClientID',finish)}catch{finish(null)}});
 }
 function confirmed(receipt,{flow,requestId,...params}={}){
  if(!['quote','callback'].includes(flow)||receipt?.ok!==true||receipt?.delivered!==true||receipt?.analytics?.persisted!==true||receipt?.duplicate===true||typeof requestId!=='string')return false;
  let saved=[];try{saved=JSON.parse(store('sessionStorage')?.getItem(seenKey)||'[]')}catch{}
  if(counted.has(requestId)||(Array.isArray(saved)&&saved.includes(requestId)))return false;
  counted.add(requestId);try{store('sessionStorage')?.setItem(seenKey,JSON.stringify([...new Set([...(Array.isArray(saved)?saved:[]),requestId])].slice(-60)))}catch{}
  emit('dp_lead_confirmed',{...params,flow});emit(flow==='quote'?'dp_quote_lead_confirmed':'dp_callback_lead_confirmed',{...params,flow});
  if(flow==='quote'&&receipt.analytics.premiumQualified===true)emit('dp_premium_quote_confirmed',{flow});
  if(flow==='quote'&&receipt.analytics.detailedQualified===true)emit('dp_detailed_quote_confirmed',{flow});
  return true;
 }
 return {start,track,confirmed,attribution,clientID,isActive:()=>active};
}
export const analytics=typeof window==='undefined'?null:createAnalytics(window);

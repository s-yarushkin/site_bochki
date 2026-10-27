export const GOALS=Object.freeze(['dp_lead_confirmed','dp_quote_lead_confirmed','dp_callback_lead_confirmed','dp_premium_quote_confirmed','dp_detailed_quote_confirmed','dp_phone_click','dp_form_open','dp_form_close','dp_form_error','dp_builder_start','dp_builder_complete','dp_builder_interaction','dp_model_view','dp_model_select','dp_size_select','dp_base_kit_open','dp_gallery_open','dp_cta_click']);
const goals=new Set(GOALS),receipts=new Set(GOALS.filter(x=>x.includes('_confirmed')));
const placements=new Set(['header','hero','catalog','base','bundle','personal','delivery','builder','faq','final','footer','mobile','seo','unknown']);
const models=new Set(['kvadro','viking','parus','kvadro-house']);
const touchKey='dp_attribution_v1',seenKey='dp_counted_leads_v1';
const clean=(v,max=90)=>typeof v==='string'&&v.length<=max&&/^[a-zA-Z0-9а-яА-ЯёЁ_.:+-]+$/.test(v)?v:null;
const safePath=p=>typeof p==='string'&&/^\/[a-z0-9/-]{0,100}$/.test(p)?p:'/';
export function safeParams(params={}) {
 const result={};let place=params.placement?.replace(/^landing_/,'');
 place=({selection:'builder',configure:'builder',contact:'final',closing:'final',menu:'mobile',page:'unknown',packages:'bundle',packages_base:'bundle',packages_comfort:'bundle',hero_compare:'hero'})[place]||place;
 if(placements.has(place))result.placement=place;
 if(models.has(params.model))result.model=params.model;
 if(params.flow==='quote'||params.flow==='callback')result.flow=params.flow;
 if(typeof params.size==='string'&&/^[0-9x]{3,5}$/.test(params.size))result.size=params.size;
 if(Number.isInteger(params.step)&&params.step>=1&&params.step<=7)result.step=params.step;
 if(['base','comfort','custom'].includes(params.package))result.package=params.package;
 return result;
}
export function createAnalytics(env) {
 let active=false,counterId=null,allowedOptionIds=new Set(),allowedFinishes=new Set(),allowedRoofs=new Set();const counted=new Set();
 const store=type=>{try{return env[type];}catch{return null;}};
 function touch(){
  const q=new URLSearchParams(env.location.search),value={landing:safePath(env.location.pathname)};
  for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','yclid']){const v=clean(q.get(key),key==='yclid'?180:90);if(v)value[key]=v;}
  try{const h=new URL(env.document.referrer).hostname.toLowerCase();value.referrer=h.endsWith('yandex.ru')?'yandex':h.endsWith('google.com')?'google':'external';}catch{}
  return value;
 }
 function remember(){
  const s=store('localStorage');if(!s)return;
  let previous;try{previous=JSON.parse(s.getItem(touchKey)||'null');}catch{}
  const now=Date.now(),fresh=touch(),old=previous&&Number.isFinite(previous.at)&&now-previous.at<30*86400000?previous:null;
  const campaign=Object.keys(fresh).some(k=>k==='yclid'||k.startsWith('utm_'));
  try{s.setItem(touchKey,JSON.stringify({first:old?.first||fresh,last:campaign||!old?fresh:old.last,at:now}));}catch{}
 }
 function sanitiseURL(){
  try{const u=new URL(env.location.href),q=new URLSearchParams();
   for(const key of ['model','size','utm_source','utm_medium','utm_campaign','utm_content','utm_term','yclid']){const v=clean(u.searchParams.get(key),key==='yclid'?180:90);if(v&&(key!=='model'||models.has(v))&&(key!=='size'||/^[0-9x]{3,5}$/.test(v)))q.set(key,v);}
   for(const [key,allowed]of [['finish',allowedFinishes],['roof',allowedRoofs]]){const value=u.searchParams.get(key);if(allowed.has(value))q.set(key,value);}
   if(u.searchParams.has('options'))q.set('options',[...new Set((u.searchParams.get('options')||'').split(','))].filter(id=>allowedOptionIds.has(id)).join(','));
   if(u.searchParams.has('area')){const pieces=[...new Set((u.searchParams.get('area')||'').split(','))].filter(Boolean);const cleanAreas=[];for(const piece of pieces){const m=piece.match(/^([a-z0-9_]+):([1-9]|[1-3][0-9]|40)$/);if(m&&allowedOptionIds.has(m[1])&&cleanAreas.length<5)cleanAreas.push(m[1]+':'+m[2]);}if(cleanAreas.length)q.set('area',cleanAreas.join(','));}
   const hash=/^#[a-z][a-z0-9-]{0,49}$/.test(u.hash)?u.hash:'';
   env.history.replaceState(env.history.state,'',u.pathname+(q.size?'?'+q.toString():'')+hash);
  }catch{}
 }
 function emit(name,params={}){
  if(!goals.has(name))return false;const safe=safeParams(params);
  env.document.dispatchEvent(new env.CustomEvent('dachapar:event',{detail:{name,params:safe}}));
  if(!active||typeof env.ym!=='function')return false;
  try{env.ym(counterId,'reachGoal',name,safe);return true;}catch{return false;}
 }
 function track(name,params={}){if(receipts.has(name))return false;return emit(name,params);}
 function start(settings,{optionIds=[],finishIds=[],roofIds=[]}={}){
  const c=settings?.analytics;
  if(active)return true;
  if(c?.enabled!==true||c.counterId!==113675581||c.webvisor!==false||env.location.origin!==settings.productionOrigin||!c.allowedOrigins?.includes(env.location.origin))return false;
  allowedOptionIds=new Set(optionIds);allowedFinishes=new Set(finishIds);allowedRoofs=new Set(roofIds);active=true;counterId=c.counterId;remember();sanitiseURL();
  if(typeof env.ym!=='function'){const stub=function(){(stub.a=stub.a||[]).push(arguments);};stub.l=Date.now();env.ym=stub;}
  env.ym(counterId,'init',{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:false});
  if(!env.document.querySelector('script[data-dp-metrika]')){const s=env.document.createElement('script');s.async=true;s.src='https://mc.yandex.ru/metrika/tag.js?id='+counterId;s.dataset.dpMetrika='1';env.document.head.append(s);}
  return true;
 }
 function attribution(){if(!active)return null;remember();try{const value=JSON.parse(store('localStorage')?.getItem(touchKey)||'null');return value?{first:value.first,last:value.last}:null;}catch{return null;}}
 function confirmed(receipt,{flow,requestId}={}){
  if(!['quote','callback'].includes(flow)||receipt?.ok!==true||receipt?.delivered!==true||receipt?.analytics?.persisted!==true||receipt?.duplicate===true||typeof requestId!=='string')return false;
  let saved=[];try{saved=JSON.parse(store('sessionStorage')?.getItem(seenKey)||'[]');}catch{}
  if(counted.has(requestId)||(Array.isArray(saved)&&saved.includes(requestId)))return false;
  counted.add(requestId);try{store('sessionStorage')?.setItem(seenKey,JSON.stringify([...new Set([...(Array.isArray(saved)?saved:[]),requestId])].slice(-60)));}catch{}
  emit('dp_lead_confirmed',{flow});emit(flow==='quote'?'dp_quote_lead_confirmed':'dp_callback_lead_confirmed',{flow});
  if(flow==='quote'&&receipt.analytics.premiumQualified===true)emit('dp_premium_quote_confirmed',{flow});
  if(flow==='quote'&&receipt.analytics.detailedQualified===true)emit('dp_detailed_quote_confirmed',{flow});
  return true;
 }
 return {start,track,confirmed,attribution,isActive:()=>active};
}
export const analytics=typeof window==='undefined'?null:createAnalytics(window);

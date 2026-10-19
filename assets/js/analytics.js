// ADS-01 single public-site measurement adapter; safe no-op until owner GO.
import {ADS01_COUNTER_ID, ADS01_PRIVACY_APPROVED} from './analytics-config.js';
const goals=new Set(['dp_lead_confirmed','dp_quote_lead_confirmed','dp_callback_lead_confirmed','dp_premium_quote_confirmed','dp_detailed_quote_confirmed','dp_phone_click','dp_form_open','dp_form_error','dp_builder_start','dp_builder_complete','dp_model_view','dp_model_select','dp_size_select','dp_base_kit_open','dp_gallery_open','dp_cta_click']);
const models=new Set(['kvadro','parus','viking','kvadro-house']);
const placements=new Set(['header','hero','catalog','base','bundle','personal','delivery','builder','faq','final','footer','mobile','seo','unknown']);
const decisionsKey='dp_analytics_consent_v1', touchKey='dp_attribution_v1', seenKey='dp_counted_leads_v1';
const ready=Number.isSafeInteger(ADS01_COUNTER_ID)&&ADS01_COUNTER_ID>0&&ADS01_PRIVACY_APPROVED===true;
let active=false;
const getStore=()=>{try{return localStorage;}catch{return null;}};
const getSession=()=>{try{return sessionStorage;}catch{return null;}};
function isAllowed(){return ready && getStore()?.getItem(decisionsKey)==='accepted';}
function cleanValue(v,max=90){return typeof v==='string' && v.length<=max && /^[a-zA-Z0-9а-яА-ЯёЁ_.:+-]+$/.test(v) ? v : null;}
function safePath(p){return typeof p==='string' && /^\/[a-z0-9/-]{0,100}$/.test(p) ? p : '/';}
function readTouch(){
  const q=new URLSearchParams(location.search), touch={landing:safePath(location.pathname)};
  for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','yclid']){
    const v=cleanValue(q.get(key),key==='yclid'?180:90);
    if(v)touch[key]=v;
  }
  if(document.referrer) {
    try {const h=new URL(document.referrer).hostname.toLowerCase();
      touch.referrer=h.endsWith('yandex.ru')?'yandex':h.endsWith('google.com')?'google':'external';
    }catch{}
  }
  return touch;
}
function rememberTouch(){
  if(!isAllowed())return;
  const store=getStore();if(!store)return;
  let old=null;try{old=JSON.parse(store.getItem(touchKey));}catch{}
  const now=Date.now(), fresh=readTouch();
  const haveCampaign=Object.keys(fresh).some(k=>k==='yclid'||k.startsWith('utm_'));
  const previous=old && Number.isFinite(old.at)&&now-old.at<30*86400000?old:null;
  const data={first:previous?.first||fresh,last:haveCampaign||!previous?fresh:previous.last,at:now};
  try{store.setItem(touchKey,JSON.stringify(data));}catch{}
}
export function attributionForLead(){
  if(!isAllowed())return null;
  rememberTouch();
  try{let data=JSON.parse(getStore()?.getItem(touchKey)||'null');return data?{first:data.first,last:data.last}:null;}catch{return null;}
}
function suppressTrackingQuery(){
  // Avoid sending arbitrary query strings/PII through default pageview metadata.
  try {
    const u=new URL(location.href), q=new URLSearchParams();
    for(const key of ['model','contact','from']){
      const v=cleanValue(u.searchParams.get(key),50);if(v)q.set(key,v);
    }
    const safe=u.pathname+(q.size?'?'+q.toString():'')+u.hash;
    if(safe!==u.pathname+u.search+u.hash)history.replaceState(history.state,'',safe);
  }catch{}
}
function initCounter(){
  if(!isAllowed()||active)return;
  rememberTouch();suppressTrackingQuery();
  active=true;
  if(typeof window.ym!=='function'){
    const stub=function(){(stub.a=stub.a||[]).push(arguments);};
    stub.l=Date.now();window.ym=stub;
  }
  window.ym(ADS01_COUNTER_ID,'init',{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});
  if(!document.querySelector('script[data-dp-metrika]')){
    const s=document.createElement('script');s.async=true;s.src='https://mc.yandex.ru/metrika/tag.js';s.dataset.dpMetrika='1';document.head.append(s);
  }
}
function displayConsent(){
  if(!ready||getStore()?.getItem(decisionsKey))return;
  const root=document.createElement('aside');root.setAttribute('role','region');root.setAttribute('aria-label','Настройки аналитики');
  root.style.cssText='position:fixed;bottom:90px;left:12px;right:12px;max-width:620px;margin:auto;background:#fff;color:#202c26;border:1px solid #aaa;border-radius:12px;padding:14px;z-index:9997;box-shadow:0 4px 22px #0003;font:14px/1.4 Arial,sans-serif';
  const desc=document.createElement('p');desc.textContent='Разрешить анонимизированную аналитику посещений и действий на сайте? Поля заявки скрыты от записи.';desc.style.margin='0 0 10px';
  const yes=document.createElement('button'),no=document.createElement('button');
  yes.type=no.type='button';yes.textContent='Разрешить аналитику';no.textContent='Без аналитики';
  yes.style.cssText='padding:8px 12px;margin-right:10px';no.style.cssText='padding:8px 12px';
  yes.addEventListener('click',()=>{try{getStore()?.setItem(decisionsKey,'accepted');}catch{}root.remove();initCounter();});
  no.addEventListener('click',()=>{try{getStore()?.setItem(decisionsKey,'denied');getStore()?.removeItem(touchKey);}catch{}root.remove();});
  root.append(desc,yes,no);document.body.append(root);
}
export function revokeAnalyticsConsent(){
  try{getStore()?.setItem(decisionsKey,'denied');getStore()?.removeItem(touchKey);}catch{}
  active=false;
  // Already loaded third-party tracker cannot be unloaded reliably; a reload ensures no reinitialization.
  if(typeof location!=='undefined')location.reload();
}
export function trackGoal(name,params={}){
  if(!active||!goals.has(name)||typeof window.ym!=='function')return false;
  const safe={};
  if(placements.has(params.placement))safe.placement=params.placement;
  if(models.has(params.model))safe.model=params.model;
  if(params.flow==='quote'||params.flow==='callback')safe.flow=params.flow;
  if(typeof params.step==='number'&&Number.isInteger(params.step)&&params.step>=1&&params.step<=7)safe.step=params.step;
  if(params.size && /^[0-9x]{3,5}$/.test(params.size))safe.size=params.size;
  try{window.ym(ADS01_COUNTER_ID,'reachGoal',name,safe);return true;}catch{return false;}
}
function seenReceipt(requestId){
  if(typeof requestId!=='string'||!getSession())return true;
  try {const list=JSON.parse(getSession().getItem(seenKey)||'[]');return Array.isArray(list)&&list.includes(requestId);}catch{return false;}
}
function markReceipt(requestId){
  try{const s=getSession(),list=JSON.parse(s?.getItem(seenKey)||'[]');s?.setItem(seenKey,JSON.stringify([...new Set([...(Array.isArray(list)?list:[]),requestId])].slice(-60)));}catch{}
}
export function confirmedLead(receipt,{flow,requestId}={}){
  if(!active||receipt?.ok!==true||receipt?.delivered!==true||receipt?.duplicate===true||seenReceipt(requestId))return false;
  markReceipt(requestId);trackGoal('dp_lead_confirmed',{flow});
  if(flow==='quote')trackGoal('dp_quote_lead_confirmed',{flow});
  if(flow==='callback')trackGoal('dp_callback_lead_confirmed',{flow});
  if(receipt.analytics?.premiumQualified===true)trackGoal('dp_premium_quote_confirmed',{flow:'quote'});
  if(receipt.analytics?.detailedQualified===true)trackGoal('dp_detailed_quote_confirmed',{flow:'quote'});
  return true;
}
function placement(el){
  if(el.closest('.mobile-cta'))return 'mobile';
  if(el.closest('.hero')||el.closest('#top'))return 'hero';
  if(el.closest('.header'))return 'header';
  if(el.closest('.catalog'))return 'catalog';
  if(el.closest('#base'))return 'base';
  if(el.closest('#bundle'))return 'bundle';
  if(el.closest('#personal'))return 'personal';
  if(el.closest('#delivery'))return 'delivery';
  if(el.closest('#builder'))return 'builder';
  if(el.closest('#faq'))return 'faq';
  if(el.closest('.final-cta'))return 'final';
  if(el.closest('.footer'))return 'footer';
  if(location.pathname!=='/')return 'seo';
  return 'unknown';
}
function monitorClicks(){
  document.addEventListener('click',event=>{
    const el=event.target instanceof Element?event.target.closest('a,button'):null;
    if(!el||!active)return;
    const place=placement(el), href=el.getAttribute('href')||'';
    if(/^tel:/i.test(href)){trackGoal('dp_phone_click',{placement:place});return;}
    if(/^mailto:/i.test(href)){trackGoal('dp_cta_click',{placement:place});return;}
    if(el.matches('[data-base-open]'))trackGoal('dp_base_kit_open',{placement:place,model:el.dataset.baseOpen});
    if(el.matches('[data-gallery-open]'))trackGoal('dp_gallery_open',{placement:place,model:el.dataset.galleryOpen});
    if(el.matches('[data-flow],[data-bundle],[data-catalog-select],a[href*="#builder"],a[href*="#models"],a[href*="contact=manager"]')){
      trackGoal('dp_cta_click',{placement:place});
    }
  });
  if('IntersectionObserver' in window){
    const seen=new Set();
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(!entry.isIntersecting||!active)continue;
        const model=entry.target.getAttribute('data-model');
        if(models.has(model)&&!seen.has(model)){
          seen.add(model);trackGoal('dp_model_view',{placement:'catalog',model});observer.unobserve(entry.target);
        }
      }
    },{threshold:0.5});
    const observe=()=>document.querySelectorAll('.product-card[data-model]').forEach(el=>observer.observe(el));
    observe();
  }
}
if(typeof document!=='undefined'){
  const start=()=>{if(!ready)return;monitorClicks();if(isAllowed())initCounter();else displayConsent();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
}

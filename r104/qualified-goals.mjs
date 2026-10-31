// Qualify free-text locally. Never send names, phones, comments or settlements to Metrika.
export const QUALIFIED_GOALS=Object.freeze({bedroom:'dp_vision_bedroom_confirmed',location:'dp_vision_location_confirmed'});
const normalized=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/gu,' ').trim().replace(/\s+/g,' ');
export function qualifyVision({source,comment,settlement}={}){
 if(source!=='vision_block')return {bedroom:false,location:false};
 const words=normalized(comment).split(' '),city=normalized(settlement);
 return {bedroom:words.some(w=>/^спальн(?:я|ю|и|е|ей|ями|ях)$/u.test(w)),location:/(?:^| )(?:сергиев посад|никитская слобода)(?: |$)/u.test(city)};
}
export function createQualifiedGoals(env){
 let active=false;const seen=new Set(),key='dp_vision_confirmed_v1';
 function start(settings){
  const config=settings?.analytics;
  active=config?.enabled===true&&config.counterId===113675581&&env.location.origin===settings.productionOrigin&&config.allowedOrigins?.includes(env.location.origin)===true;
  return active;
 }
 function confirmed(receipt,{requestId,flow,qualification,baseCounted}={}){
  if(!active||baseCounted!==true||!['quote','callback'].includes(flow)||receipt?.ok!==true||receipt?.delivered!==true||receipt?.analytics?.persisted!==true||receipt?.duplicate===true||typeof requestId!=='string'||!requestId||typeof env.ym!=='function')return false;
  if(qualification?.bedroom!==true&&qualification?.location!==true)return false;
  let stored=[];try{stored=JSON.parse(env.sessionStorage?.getItem(key)||'[]')}catch{}
  if(seen.has(requestId)||(Array.isArray(stored)&&stored.includes(requestId)))return false;
  seen.add(requestId);try{env.sessionStorage?.setItem(key,JSON.stringify([...new Set([...(Array.isArray(stored)?stored:[]),requestId])].slice(-60)))}catch{}
  const params={event_version:1,placement:'personal',flow};
  for(const kind of ['bedroom','location'])if(qualification[kind]===true){
   const name=QUALIFIED_GOALS[kind];
   env.document.dispatchEvent(new env.CustomEvent('dachapar:event',{detail:{name,params}}));
   env.ym(113675581,'reachGoal',name,params);
  }
  return true;
 }
 return {start,confirmed};
}

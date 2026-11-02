import {test} from 'node:test';import assert from 'node:assert/strict';import {createAnalytics,safeParams,cleanCampaign} from '../web/analytics-core.mjs';
function environment(){const data=new Map(),calls=[],events=[];const env={location:new URL('https://xn--80aaan1dh9b.xn--p1ai/?utm_campaign=Бани+для+дачи&plan=p1&planMirror=1&reference=abc'),localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},sessionStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},document:{referrer:'https://yandex.ru/',dispatchEvent:e=>events.push(e),querySelector:()=>null,createElement:()=>({dataset:{}}),head:{append:()=>{}}},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail}},ym:(...args)=>{calls.push(args);if(args[1]==='getClientID')args[2]('123456789012345678')}};return{env,calls,events,data};}
const settings={productionOrigin:'https://xn--80aaan1dh9b.xn--p1ai',analytics:{enabled:true,counterId:113675581,allowedOrigins:['https://xn--80aaan1dh9b.xn--p1ai'],webvisor:false}};
test('analytics preserves spaced campaigns and all functional URL parameters',()=>{const {env}=environment(),original=env.location.href,a=createAnalytics(env);a.start(settings);assert.equal(env.location.href,original);assert.equal(a.attribution().first.utm_campaign,'Бани для дачи');assert.equal(a.attribution().last.referrer,'yandex');assert.equal(cleanCampaign('<script>'),null);});
test('events contain only approved enum values and IDs, never contacts',()=>{assert.deepEqual(safeParams({phone:'+79990000001',name:'private',comment:'private',plan_id:'p1',model:'kvadro',package:'deluxe',purpose:'photo',object_id:'obj',photo_id:'photo',mirrored:true}),{event_version:2,model:'kvadro',package:'deluxe',purpose:'photo',plan_id:'p1',object_id:'obj',photo_id:'photo',mirrored:true});});
test('success goal requires both persisted receipt and delivered notification; once per request',()=>{const {env,calls}=environment(),a=createAnalytics(env);a.start(settings);assert.equal(a.track('dp_lead_confirmed'),false);assert.equal(a.confirmed({ok:true,delivered:true},{flow:'quote',requestId:'test'}),false);const receipt={ok:true,delivered:true,analytics:{persisted:true}};assert.equal(a.confirmed(receipt,{flow:'quote',requestId:'test'}),true);assert.equal(a.confirmed(receipt,{flow:'quote',requestId:'test'}),false);assert.equal(calls.filter(x=>x[2]==='dp_lead_confirmed').length,1);});
test('ClientID is optional and never becomes an event parameter',async()=>{const {env}=environment(),a=createAnalytics(env);assert.equal(await a.clientID(),null);a.start(settings);assert.equal(await a.clientID(),'123456789012345678');assert.equal(safeParams({clientId:'123'}).clientId,undefined);});

test('quiz goals distinguish completion, submit attempt, and abandonment without contact params',()=>{
 const {env,calls,events}=environment();const a=createAnalytics(env);a.start(settings);
 for(const name of ['dp_quiz_completed','dp_quiz_submit_attempt','dp_quiz_close_before_completed','dp_quiz_close_after_completed'])
   assert.equal(a.track(name,{city:'г. Переславль',phone:'+79990000000'}),true);
 assert.equal(a.track('dp_quiz_lead_confirmed'),false,'Confirmed conversions cannot be fired via generic tracking');
 for(const name of ['dp_quiz_completed','dp_quiz_submit_attempt','dp_quiz_close_before_completed','dp_quiz_close_after_completed']){
   const event=calls.find(x=>x[2]===name);assert.ok(event,name);
   assert.equal(event[3].city,undefined);
   assert.equal(event[3].phone,undefined);
 }
 assert.equal(events.filter(e=>e.type==='dachapar:event').length,4);
});
test('quiz success and Pereslavl goals need both persisted delivery and a unique request ID',()=>{
 const {env,calls}=environment(),a=createAnalytics(env);a.start(settings);
 const x={flow:'callback',requestId:'quiz-pereslavl-1',quiz:true,pereslavl:true,purpose:'selection_help'};
 assert.equal(a.confirmed({ok:true,delivered:false,analytics:{persisted:true}},x),false);
 assert.equal(a.confirmed({ok:true,delivered:true,analytics:{persisted:false}},x),false);
 assert.equal(a.confirmed({ok:true,delivered:true,analytics:{persisted:true},duplicate:true},x),false);
 assert.equal(calls.filter(x=>typeof x[2]==='string'&&x[2].startsWith('dp_quiz_lead_')).length,0);
 const ok={ok:true,delivered:true,analytics:{persisted:true}};
 assert.equal(a.confirmed(ok,x),true);
 assert.equal(a.confirmed(ok,x),false,'Same request cannot double-count');
 assert.equal(calls.filter(x=>x[2]==='dp_quiz_lead_confirmed').length,1);
 assert.equal(calls.filter(x=>x[2]==='dp_quiz_lead_pereslavl_confirmed').length,1);
 assert.equal(calls.filter(x=>x[2]==='dp_lead_confirmed').length,1);
 assert.equal(calls.filter(x=>x[2]==='dp_callback_lead_confirmed').length,1);
 assert.deepEqual(Object.keys(calls.find(x=>x[2]==='dp_quiz_lead_pereslavl_confirmed')[3]).sort(),['event_version','flow','placement']);
 assert.equal(a.confirmed(ok,{flow:'callback',requestId:'quiz-other-2',quiz:true,pereslavl:false}),true);
 assert.equal(calls.filter(x=>x[2]==='dp_quiz_lead_confirmed').length,2);
 assert.equal(calls.filter(x=>x[2]==='dp_quiz_lead_pereslavl_confirmed').length,1);
 assert.equal(a.confirmed(ok,{flow:'callback',requestId:'ordinary-3'}),true);
 assert.equal(calls.filter(x=>x[2]==='dp_quiz_lead_confirmed').length,2,'Ordinary callback must not count as quiz');
});

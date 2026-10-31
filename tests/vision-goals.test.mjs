import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qualifyVision,createQualifiedGoals,QUALIFIED_GOALS} from '../r104/qualified-goals.mjs';
const origin='https://xn--80aaan1dh9b.xn--p1ai';
const settings={productionOrigin:origin,analytics:{enabled:true,counterId:113675581,allowedOrigins:[origin]}};
const receipt={ok:true,delivered:true,analytics:{persisted:true}};
function fixture(){const calls=[],events=[],store=new Map();return {calls,events,env:{location:{origin},sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},ym:(...args)=>calls.push(args),document:{dispatchEvent:e=>events.push(e)},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail}}}};}
test('only the specified invitation block qualifies, not another identical CTA',()=>{
 for(const source of [undefined,'other','catalog','resume'])assert.deepEqual(qualifyVision({source,comment:'Спальня',settlement:'Сергиев Посад'}),{bedroom:false,location:false});
 assert.deepEqual(qualifyVision({source:'vision_block',comment:'Нужна спальня',settlement:'г. Сергиев-Посад'}),{bedroom:true,location:true});
});
test('bedroom variants and cities are read from their respective fields',()=>{
 for(const comment of ['Спальня','хочу спальню','две спальни'])assert.equal(qualifyVision({source:'vision_block',comment}).bedroom,true);
 assert.equal(qualifyVision({source:'vision_block',comment:'спальное место'}).bedroom,false);
 assert.equal(qualifyVision({source:'vision_block',comment:'Сергиев Посад',settlement:'Москва'}).location,false);
 assert.equal(qualifyVision({source:'vision_block',settlement:'Никитская   Слобода'}).location,true);
 assert.equal(qualifyVision({source:'vision_block',settlement:'Сергиев Посадский'}).location,false);
});
test('no goals for click, invalid delivery, duplicate, missing persistence or unconfirmed base goal',()=>{
 const {env,calls}=fixture(),g=createQualifiedGoals(env);g.start(settings);
 const q={bedroom:true,location:true};
 for(const r of [{ok:true}, {...receipt,delivered:false},{...receipt,analytics:{persisted:false}},{...receipt,duplicate:true}])assert.equal(g.confirmed(r,{requestId:'a',flow:'quote',qualification:q,baseCounted:true}),false);
 assert.equal(g.confirmed(receipt,{requestId:'a',flow:'quote',qualification:q,baseCounted:false}),false);
 assert.equal(calls.length,0);
});
test('confirmed lead emits two independent goals once, without free text or contact data',()=>{
 const {env,calls,events}=fixture(),g=createQualifiedGoals(env);g.start(settings);
 const args={requestId:'test-1',flow:'callback',baseCounted:true,qualification:qualifyVision({source:'vision_block',comment:'Спальня, телефон +79990000002, частное имя',settlement:'Сергиев Посад'})};
 assert.equal(g.confirmed(receipt,args),true);assert.equal(g.confirmed(receipt,args),false);
 const reloaded=createQualifiedGoals(env);reloaded.start(settings);assert.equal(reloaded.confirmed(receipt,args),false);
 assert.deepEqual(calls.map(x=>x[2]),Object.values(QUALIFIED_GOALS));
 assert.equal(events.length,2);
 assert.doesNotMatch(JSON.stringify({calls,events}),/спальня|посад|7999|частное|test-1/i);
});
test('local preview and disabled analytics never emit goals',()=>{
 const {env,calls}=fixture();env.location.origin='http://127.0.0.1:4188';const g=createQualifiedGoals(env);assert.equal(g.start(settings),false);
 assert.equal(g.confirmed(receipt,{requestId:'a',flow:'quote',baseCounted:true,qualification:{bedroom:true}}),false);assert.equal(calls.length,0);
});

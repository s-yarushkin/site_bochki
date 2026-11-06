import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,dirname,resolve,basename} from 'node:path';import {randomUUID} from 'node:crypto';
import {openLeadStore} from '../api/server/lead-store.mjs';import {openCrmAccess} from '../api/server/crm-access.mjs';import {hashManagerPassword} from '../api/server/manager-auth.mjs';
import {safeDestination,classifySource,openCrmInsights} from '../api/server/crm-insights.mjs';
const accounts=[{phone:'+79990000001',hash:hashManagerPassword('Test-fixture-long-password')},{phone:'+79990000002',hash:hashManagerPassword('Test-fixture-long-password')}];
function fixture(action){const folder=mkdtempSync(join(tmpdir(),'dachapar-insights-')),path=join(folder,'test.sqlite');let time='2026-11-05T10:00:00.000Z';const now=()=>time;
 const leads=openLeadStore(path,{clock:now}),crm=openCrmAccess(path,{now});crm.migrate();const [owner,manager]=crm.seedLegacy({accounts,ownerPhone:accounts[0].phone});
 const insights=openCrmInsights(path,{secret:'a'.repeat(64),origin:'https://site.test',now});insights.migrate();
 const browser=()=>({headers:{cookie:insights.consent({headers:{}},true)[0].split(';')[0]}});
 const lead=()=>leads.create({flow:'callback',phone:'+79990000003'},randomUUID()).lead.id;
 const event=(event_code='page_view',extra={})=>({event_id:randomUUID(),event_code,page_path:'/',...extra});
 try{return action({insights,leads,crm,owner,manager,browser,lead,event,setTime:value=>{time=value;}});}finally{insights.close();crm.close();leads.close();assert.equal(dirname(resolve(folder)),resolve(tmpdir()));assert.ok(basename(folder).startsWith('dachapar-insights-'));rmSync(folder,{recursive:true,force:true});}
}
test('destinations reject external, encoded, duplicate or unexpected parameters and preserve functional model state',()=>{
 assert.equal(safeDestination('/?bath=parus&bathSize=450&layout=dp3d-18#bath-model'),'/?bath=parus&bathSize=450&layout=dp3d-18#bath-model');
 for(const value of ['//evil.test','https://evil.test','/\\evil.test','/%252f%252fevil.test','/?next=https://evil.test','/?bath=parus&bath=kvadro','/manager.html','/api/manager/','/novyy-god/#evil'])assert.throws(()=>safeDestination(value),/INVALID_DESTINATION/);
});
test('organic referrers are exact domains, ads take priority and missing evidence stays direct/unknown',()=>{
 assert.equal(classifySource({referrer_host:'www.google.com'}).channel,'search_organic');
 assert.equal(classifySource({referrer_host:'yandex.ru',yclid:'123456'}).channel,'paid');
 assert.equal(classifySource({referrer_host:'google.com.evil.test'}).channel,'other_referral');
 assert.equal(classifySource({utm_source:'google',utm_medium:'organic',referrer_host:'evil.test'}).channel,'other_referral');
 assert.equal(classifySource({}).channel,'direct');assert.equal(classifySource({utm_source:'youtube',utm_medium:'cpc'}).channel,'paid');
});
test('different publications stay distinct; technical requests are not verified visits',()=>fixture(({insights,owner})=>{
 const a=insights.createLink(owner.id,{label:'VK post',source:'vk',channel:'social_organic',destination:'/'}),b=insights.createLink(owner.id,{label:'YouTube video',source:'youtube',channel:'social_organic',destination:'/'});
 assert.notEqual(a.id,b.id);assert.notEqual(a.slug,b.slug);insights.redirect(a.slug);insights.redirect(b.slug,'TelegramBot');
 const r=insights.report({from:'2026-11-05',to:'2026-11-05'});assert.equal(r.rows.reduce((n,x)=>n+x.verified_visits,0),0);assert.equal(r.rows.find(x=>x.link_id===a.id).technical_requests,1);assert.equal(r.rows.find(x=>x.link_id===b.id).suspected_bot_requests,1);
}));
test('without consent events are refused, invented visitor IDs cannot attach another browser history',()=>fixture(({insights,browser,event,lead})=>{
 const a=browser(),id=lead(),e=event('dp_cta_click',{cta_id:'catalog_quote'});insights.events(a,{events:[e]});
 const forged={headers:{cookie:'dp_visitor='+randomUUID()}};assert.equal(insights.events(forged,{events:[event()]}).accepted,0);
 insights.bindLead(forged,id,{visitor_id:randomUUID(),trigger_event_id:e.event_id});assert.equal(insights.leadAttribution(id).visitor_id,null);assert.equal(insights.leadTimeline(id).length,0);
}));
test('first, last non-direct and direct conversion remain distinct across visits; confirmation and events deduplicate',()=>fixture(({insights,browser,event,lead,leads,setTime})=>{
 const b=browser(),a=event('dp_cta_click',{cta_id:'hero_quote'});insights.events(b,{utm_source:'vk',utm_medium:'social',events:[a]});
 assert.equal(insights.events(b,{events:[a]}).accepted,0);
 setTime('2026-11-06T10:00:00.000Z');insights.events(b,{referrer_host:'yandex.ru',events:[event()]});
 setTime('2026-11-07T10:00:00.000Z');insights.events(b,{events:[event()]});const id=lead();insights.bindLead(b,id,{trigger_event_id:a.event_id});
 const attributed=insights.leadAttribution(id);assert.equal(attributed.first_touch.source,'vk');assert.equal(attributed.last_non_direct_touch.source,'yandex');assert.equal(attributed.conversion_touch.channel,'direct');
 leads.delivery(id,'delivered');insights.confirmed(id);insights.confirmed(id);
 assert.equal(insights.leadTimeline(id).filter(e=>e.event_code==='dp_lead_confirmed').length,1);
 const report=insights.report({from:'2026-11-05',to:'2026-11-07'});assert.equal(report.rows.reduce((n,r)=>n+r.real_leads,0),1);assert.equal(report.rows.find(r=>r.source==='yandex').real_leads,1);
}));
test('test leads and won status are reflected in every commercial source report and restored',()=>fixture(({insights,browser,event,lead,leads,crm,owner,manager})=>{
 const b=browser(),id=lead();insights.events(b,{utm_source:'youtube',events:[event()]});insights.bindLead(b,id,{});leads.delivery(id,'delivered');insights.confirmed(id);leads.update(id,{status:'won',assignee:'',managerNote:''});
 const totals=()=>{const rows=insights.report({from:'2026-11-05',to:'2026-11-05'}).rows;return [rows.reduce((n,r)=>n+r.real_leads,0),rows.reduce((n,r)=>n+r.won,0)];};
 assert.deepEqual(totals(),[1,1]);crm.classify(manager.id,id,{classification:'test',reason:'Fixture'});assert.deepEqual(totals(),[0,0]);crm.classify(owner.id,id,{classification:'real',reason:'Restore'});assert.deepEqual(totals(),[1,1]);
}));
test('publication context works without a visitor cookie and cannot be substituted by arbitrary dp_ref',()=>fixture(({insights,owner,lead})=>{
 const l=insights.createLink(owner.id,{label:'Campaign',source:'yandex',channel:'paid',destination:'/?bath=parus#bath-model'});const context=new URL(l.full_url).searchParams.get('dp_ctx'),id=lead();
 insights.bindLead({headers:{}},id,{context});assert.equal(insights.leadAttribution(id).conversion_touch.link_id,l.id);assert.equal(insights.leadAttribution(id).visitor_id,null);
 assert.equal(insights.source({context:context+'bad',dp_ref:l.slug}).link_id,null);
}));
test('retention and withdrawal remove history without deleting CRM leads',()=>fixture(({insights,browser,event,lead,setTime,leads})=>{
 const b=browser(),id=lead();insights.events(b,{events:[event()]});insights.bindLead(b,id,{});insights.confirmed(id);assert.ok(insights.leadTimeline(id).length);
 insights.consent(b,false);assert.equal(insights.leadTimeline(id).length,0);assert.ok(leads.get(id));
 const fresh=browser();insights.events(fresh,{events:[event()]});setTime('2027-06-01T00:00:00.000Z');insights.purge();assert.equal(insights.visitor(fresh),null);assert.ok(leads.get(id));
}));
test('visit tokens keep separate tabs scoped and cannot attach a different browser',()=>fixture(({insights,browser,event,lead,setTime})=>{
 const a=browser(),b=browser();const first=insights.events(a,{utm_source:'vk',events:[event()]});
 const second=insights.events(a,{utm_source:'youtube',events:[event()]});
 const id=lead();insights.bindLead(a,id,{visit_context:first.visit_context});assert.equal(insights.leadAttribution(id).conversion_touch.source,'vk');
 const alien=lead();insights.bindLead(b,alien,{visitor_id:insights.visitor(a),visit_context:second.visit_context});assert.notEqual(insights.leadAttribution(alien).visitor_id,insights.visitor(a));assert.equal(insights.leadAttribution(alien).conversion_touch.channel,'direct');
 setTime('2026-11-05T10:31:00.000Z');insights.events(a,{visit_context:first.visit_context,events:[event()]});assert.equal(insights.report({from:'2026-11-05',to:'2026-11-05'}).totals.verified_visits,4);
}));
test('daily unique counts are not added; undelivered real leads remain visible with exact report drilldown',()=>fixture(({insights,browser,event,lead,setTime,crm,manager,owner})=>{
 const b=browser(),publication=insights.createLink(owner.id,{label:'Видео про Парус',source:'youtube',channel:'social_organic',destination:'/'}),context=new URL(publication.full_url).searchParams.get('dp_ctx');
 insights.events(b,{context,events:[event()]});const first=lead();insights.bindLead(b,first,{});
 setTime('2026-11-06T10:00:00.000Z');insights.events(b,{context,events:[event()]});const second=lead();insights.bindLead(b,second,{});
 const report=insights.report({from:'2026-11-05',to:'2026-11-06'});assert.equal(report.totals.unique_browsers,1);assert.equal(report.daily.reduce((n,r)=>n+r.unique_browsers,0),2);assert.equal(report.totals.real_leads,2);assert.equal(report.totals.confirmed_leads,0);assert.deepEqual(new Set(report.rows[0].lead_ids),new Set([first,second]));assert.equal(report.rows[0].label,'Видео про Парус');assert.equal(report.previous.totals.real_leads,0);
 crm.classify(manager.id,first,{classification:'test',reason:'Fixture'});assert.equal(insights.report({from:'2026-11-05',to:'2026-11-06'}).totals.real_leads,1);assert.equal(crm.classificationHistory(first)[0].actor_name,'Менеджер');
 assert.throws(()=>insights.report({from:'2026-02-31',to:'2026-03-05'}),/INVALID_REPORT/);
}));
test('event payload strips private content, caps active time and rejects forged confirmation',()=>fixture(({insights,browser,event,lead,leads,crm,manager,setTime})=>{
 const b=browser();insights.events(b,{events:[event()]});setTime('2026-11-05T10:00:05.000Z');
 insights.events(b,{events:[event('dp_cta_click',{cta_id:'layout_quote',phone:'+79990000009',name:'PRIVATE',comment:'PRIVATE',page_path:'/?phone=secret'}),event('dp_lead_confirmed'),event('active_time_ping',{active_seconds:999}),event('active_time_ping',{active_seconds:999})]});
 const id=lead();insights.bindLead(b,id,{});let history=JSON.stringify(insights.leadTimeline(id));assert.ok(!history.includes('PRIVATE'));assert.ok(!history.includes('+799'));assert.ok(!history.includes('phone=secret'));assert.equal(insights.actions({from:'2026-11-05',to:'2026-11-05'}).stages.at(-1).visits,0);
 leads.delivery(id,'delivered');insights.confirmed(id);assert.equal(insights.actions({from:'2026-11-05',to:'2026-11-05'}).stages.at(-1).visits,1);crm.classify(manager.id,id,{classification:'test',reason:'Fixture'});assert.equal(insights.actions({from:'2026-11-05',to:'2026-11-05'}).stages.at(-1).visits,0);
 assert.ok(insights.visitorDetail(insights.visitor(b)).visits[0].active_seconds<=5);assert.throws(()=>insights.events(b,{events:Array.from({length:31},()=>event())}),/INVALID_EVENTS/);
}));
test('quiz overview counts invitations and completed combinations for consented browsers',()=>fixture(({insights,browser,event})=>{
 const a=browser(),b=browser();
 const variant='p4__w_yes__b_no';
 const completion=event('dp_quiz_result',{variant});
 insights.events(a,{events:[event('dp_quiz_invite_view'),completion,event('dp_quiz_result')]});
 insights.events(b,{events:[event('dp_quiz_invite_view'),event('dp_quiz_result',{variant}),event('dp_quiz_result',{variant:'invalid'})]});
 assert.equal(insights.events(a,{events:[completion]}).accepted,0);
 assert.equal(insights.events({headers:{}},{events:[event('dp_quiz_invite_view')]}).accepted,0);
 const report=insights.actions({from:'2026-11-05',to:'2026-11-05'});
 assert.equal(report.unique_browsers,2);
 assert.deepEqual(report.quiz,{invite_views:2,completions:4,known_combinations:2,combinations:[{variant,count:2}]});
}));

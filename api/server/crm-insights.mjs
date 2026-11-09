import {DatabaseSync} from 'node:sqlite';
import {randomUUID,randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {crmAnswer,crmJson} from './crm-manager-api.mjs';

export const CHANNELS=['search_organic','social_organic','messenger','partner_referral','paid','direct','other_referral','unknown'];
export const SOURCES=['yandex','google','vk','youtube','telegram','max','partner','offline','other'];
export const EVENT_CODES=new Set(['page_view','dp_model_view','dp_model_select','dp_size_select','dp_plan_view','dp_plan_select','dp_cta_click','dp_form_open','dp_form_close','dp_form_submit_attempt','dp_quiz_invite_view','dp_quiz_start','dp_quiz_answer','dp_quiz_result','dp_3d_open','dp_3d_rotate','dp_3d_close','active_time_ping','dp_lead_confirmed']);
const QUIZ_VARIANT=/^(?:p2|p4|p6|p8)__(?:w_yes|w_no|w_compare)__(?:b_yes|b_no)$/;
const CTAS=new Set(['header_quote','hero_help','catalog_quote','layout_quote','footer_quote','quiz_catalog','production','foundation','contact','unknown']);
const PLACEMENTS=new Set(['header','hero','catalog','model','plans','gallery','quiz','footer','final','unknown']);
const UUID=/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const ID=/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/;
const label=(v,max=120)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u001f]/.test(v))throw Error('INVALID_TEXT');return v.trim();};
const campaign=v=>typeof v==='string'&&/^[a-zA-Zа-яА-ЯёЁ][a-zA-Zа-яА-ЯёЁ0-9 _.-]{0,79}$/.test(v)&&!/[0-9]{7,}/.test(v)?v:null;
const pathOnly=v=>typeof v==='string'&&/^\/[a-z0-9_/-]{0,160}$/.test(v)?v:'/';
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};

export function safeDestination(input){
 if(typeof input!=='string'||input.length>500||!input.startsWith('/')||input.startsWith('//')||/[\\\u0000-\u0020]/.test(input)||/%(?:25|2f|5c|0[ad])/i.test(input))throw Error('INVALID_DESTINATION');
 const url=new URL(input,'https://site.invalid');
 if(url.origin!=='https://site.invalid'||!/^\/(?:bani\/(?:kvadro|parus|viking|kvadro-haus)\/|bani\/|planirovki\/|novyy-god\/|novyy-god-2027\/)?$/.test(url.pathname))throw Error('INVALID_DESTINATION');
 const values={bath:/^(kvadro|parus|viking|kvadro-house)$/,model:/^(kvadro|parus|viking|kvadro-house)$/,bathSize:/^(?:[456][05]0|[456]x[456])$/,package:/^(comfort|deluxe)$/,layout:/^dp3d-\d{2}$/,plan:/^[a-zA-Z0-9_-]{1,40}$/,mirror:/^(0|1|true|false)$/};
 const seen=new Set();for(const [key,value] of url.searchParams){if(!values[key]?.test(value)||seen.has(key))throw Error('INVALID_DESTINATION');seen.add(key);}
 if(url.hash&&!/^#(?:main|models|bath-model|plans|packages|contact|request)$/.test(url.hash))throw Error('INVALID_DESTINATION');
 return url.pathname+url.search+url.hash;
}
export function classifySource({utm_source,utm_medium,utm_campaign,utm_content,yclid,gclid,referrer_host}={}){
 const medium=typeof utm_medium==='string'?utm_medium.toLowerCase():'',source=typeof utm_source==='string'?utm_source.toLowerCase():'';
 const paid=[yclid,gclid].some(id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,150}$/.test(id))||/^(cpc|ppc|paid|paid_social|display|cpm)$/.test(medium);
 let host=typeof referrer_host==='string'?referrer_host.toLowerCase():'';if(!/^[a-z0-9.-]{1,150}$/.test(host))host='';
 const is=(domain)=>host===domain||host.endsWith('.'+domain);
 const searchYandex=['yandex.ru','www.yandex.ru','ya.ru','www.ya.ru'].includes(host),searchGoogle=['google.com','www.google.com','google.ru','www.google.ru'].includes(host);
 let platform=SOURCES.includes(source)?source:null;
 if(!platform){if(searchYandex)platform='yandex';else if(searchGoogle)platform='google';else if(is('vk.com')||is('vk.ru'))platform='vk';else if(is('youtube.com')||is('youtu.be'))platform='youtube';else if(is('t.me')||is('telegram.org'))platform='telegram';}
 let channel='unknown',confidence='unknown';
 if(paid){channel='paid';confidence='high';}
 else if(platform&&['yandex','google'].includes(platform)&&(searchYandex||searchGoogle)&&(!medium||medium==='organic')){channel='search_organic';confidence='medium';}
 else if(platform&&['vk','youtube'].includes(platform)&&(!medium||['social','organic','social_organic'].includes(medium))){channel='social_organic';confidence=source?'medium':'low';}
 else if(platform&&['telegram','max'].includes(platform)){channel='messenger';confidence=source?'medium':'low';}
 else if(platform==='partner'){channel='partner_referral';confidence='medium';}
 else if(host){channel='other_referral';confidence='low';}
 else if(!source&&!medium){channel='direct';confidence='unknown';}
 return {channel,source:platform??(channel==='direct'?'direct':'unknown'),confidence,link_id:null,campaign:campaign(utm_campaign),content:campaign(utm_content)};
}

export function openCrmInsights(path,{secret,origin,now=()=>new Date().toISOString(),enabled=true}={}){
 if(typeof secret!=='string'||secret.length<64)throw Error('INSIGHTS_SECRET_REQUIRED');
 const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=100;');
 const sign=value=>createHmac('sha256',secret).update(origin+'|'+value).digest('base64url');
 const signed=value=>{const body=Buffer.from(JSON.stringify(value)).toString('base64url');return body+'.'+sign(body);};
 function unpack(value){if(typeof value!=='string'||value.length>1800)return null;const [body,mac,...extra]=value.split('.');if(extra.length||!body||!mac||!equal(sign(body),mac))return null;try{const data=JSON.parse(Buffer.from(body,'base64url'));return data.kind==='publication'||data.exp>Date.parse(now())?data:null;}catch{return null;}}
 const visitorToken=req=>String(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('dp_visitor='))?.slice(11);
 const visitor=req=>{const data=unpack(visitorToken(req));return data?.kind==='visitor'&&UUID.test(data.id??'')&&db.prepare('SELECT 1 FROM visitors WHERE visitor_id=? AND consent_until>?').get(data.id,now())?data.id:null;};
 function migrate(){db.exec(`
  CREATE TABLE IF NOT EXISTS site_entries(day TEXT NOT NULL,page_path TEXT NOT NULL,source TEXT NOT NULL,channel TEXT NOT NULL,link_id TEXT NOT NULL DEFAULT '',entries INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,page_path,source,channel,link_id));
  CREATE TABLE IF NOT EXISTS analytics_totals_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS tracking_sources(key TEXT PRIMARY KEY,label TEXT NOT NULL,system INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS tracking_links(id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,label TEXT NOT NULL,source TEXT NOT NULL,channel TEXT NOT NULL,campaign TEXT,content TEXT,destination TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',created_by TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS link_requests(day TEXT NOT NULL,link_id TEXT NOT NULL REFERENCES tracking_links(id),suspected_bot INTEGER NOT NULL,requests INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,link_id,suspected_bot));
  CREATE TABLE IF NOT EXISTS visitors(visitor_id TEXT PRIMARY KEY,consent_at TEXT NOT NULL,consent_until TEXT NOT NULL,consent_version TEXT NOT NULL,first_seen TEXT NOT NULL,last_seen TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS visits(visit_id TEXT PRIMARY KEY,visitor_id TEXT NOT NULL REFERENCES visitors(visitor_id) ON DELETE CASCADE,started_at TEXT NOT NULL,last_active_at TEXT NOT NULL,landing_path TEXT NOT NULL,touch_json TEXT NOT NULL,active_seconds INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS visits_visitor_time ON visits(visitor_id,started_at);
  CREATE INDEX IF NOT EXISTS visits_period ON visits(started_at);
  CREATE TABLE IF NOT EXISTS visitor_events(event_id TEXT PRIMARY KEY,visit_id TEXT NOT NULL REFERENCES visits(visit_id) ON DELETE CASCADE,at TEXT NOT NULL,event_code TEXT NOT NULL,page_path TEXT NOT NULL,metadata_json TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS events_visit_time ON visitor_events(visit_id,at);
  CREATE INDEX IF NOT EXISTS events_retention ON visitor_events(at);
  CREATE TABLE IF NOT EXISTS lead_attribution(lead_id TEXT PRIMARY KEY REFERENCES leads(id),visitor_id TEXT REFERENCES visitors(visitor_id) ON DELETE SET NULL,visit_id TEXT REFERENCES visits(visit_id) ON DELETE SET NULL,trigger_event_id TEXT,first_touch TEXT NOT NULL,last_non_direct_touch TEXT NOT NULL,conversion_touch TEXT NOT NULL,confidence TEXT NOT NULL,confirmed INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
 `);db.prepare('INSERT OR IGNORE INTO analytics_totals_meta VALUES(?,?)').run('entries_started_at',now());for(const key of SOURCES)db.prepare('INSERT OR IGNORE INTO tracking_sources VALUES(?,?,1)').run(key,key);}
 function log(actor,action,id,before,after){db.prepare('INSERT INTO audit_log(actor_id,action,object_type,object_id,before_json,after_json,at) VALUES(?,?,?,?,?,?,?)').run(actor,action,'tracking_link',id,JSON.stringify(before),JSON.stringify(after),now());}
 function createLink(actor,data){
  const source=data.source,channel=data.channel;if(!db.prepare('SELECT 1 FROM tracking_sources WHERE key=?').get(source??'')||!CHANNELS.includes(channel)||['direct','unknown','other_referral'].includes(channel))throw Error('INVALID_SOURCE');
  const id=randomUUID(),slug=source+'-'+randomBytes(6).toString('hex'),time=now();
  db.prepare('INSERT INTO tracking_links(id,slug,label,source,channel,campaign,content,destination,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,slug,label(data.label),source,channel,campaign(data.campaign),campaign(data.content),safeDestination(data.destination),actor,time);
  log(actor,'tracking_link_create',id,null,{source,channel,status:'active'});
  return link(id);
 }
 function link(id){const row=db.prepare('SELECT * FROM tracking_links WHERE id=? OR slug=?').get(id,id);if(!row)return null;
  const url=new URL(row.destination,origin);url.searchParams.set('utm_source',row.source);url.searchParams.set('utm_medium',row.channel==='paid'?'cpc':row.channel==='messenger'?'messenger':row.channel==='partner_referral'?'referral':'social');
  if(row.campaign)url.searchParams.set('utm_campaign',row.campaign);if(row.content)url.searchParams.set('utm_content',row.content);url.searchParams.set('dp_ref',row.slug);
  url.searchParams.set('dp_ctx',signed({kind:'publication',link_id:row.id}));
  return {...row,short_url:origin+'/go/'+row.slug,full_url:url.href};
 }
 function source(data){data=data??{};const token=unpack(data.context),row=token?.kind==='publication'?link(token.link_id):null;
  if(row)return {channel:row.channel,source:row.source,confidence:'high',link_id:row.id,campaign:row.campaign,content:row.content};
  if(token?.kind==='source')return token.touch;
  return classifySource(data);
 }
 function visit(id,data){
  const time=now(),token=unpack(data?.visit_context);
  const scoped=token?.kind==='visit'&&token.visitor_id===id?db.prepare('SELECT * FROM visits WHERE visit_id=? AND visitor_id=?').get(token.visit_id,id):null;
  const current=scoped??db.prepare('SELECT * FROM visits WHERE visitor_id=? ORDER BY started_at DESC LIMIT 1').get(id);
  const fresh=source(data),previous=current?JSON.parse(current.touch_json):null;
  const changedLanding=data?.landing===true&&!['direct','unknown'].includes(fresh.channel)&&previous&&['source','channel','link_id','campaign','content'].some(key=>fresh[key]!==previous[key]);
  if(current&&!changedLanding&&Date.parse(time)-Date.parse(current.last_active_at)<1800000)return current;
  const visit_id=randomUUID(),touch={...source(data),at:time};db.prepare('INSERT INTO visits(visit_id,visitor_id,started_at,last_active_at,landing_path,touch_json) VALUES(?,?,?,?,?,?)').run(visit_id,id,time,time,pathOnly(data?.page_path),JSON.stringify(touch));
  return db.prepare('SELECT * FROM visits WHERE visit_id=?').get(visit_id);
 }
 function countEntry(data){
  const page=typeof data?.page_path==='string'?data.page_path.replace(/index\.html$/,''):null;
  const publicPath=typeof page==='string'&&page.length<=160&&(/^\/(?:[a-z0-9_-]+\/)*$/.test(page)||['/privacy.html','/consent.html','/requisites.html'].includes(page));
  if(!publicPath||/^\/(?:api|crm|assets|r101|choice|manager)(?:\/|$)/.test(page))return {accepted:0};
  const touch=source({...data,utm_source:data.utm_source||(data.yclid?'yandex':data.gclid?'google':undefined)}),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now()));
  db.prepare('INSERT INTO site_entries VALUES(?,?,?,?,?,1) ON CONFLICT(day,page_path,source,channel,link_id) DO UPDATE SET entries=entries+1').run(day,page,touch.source,touch.channel,touch.link_id??'');
  return {accepted:1};
 }
 function entryReport({from,to,page,source:filterSource,link}){
  const rows=db.prepare("SELECT day,page_path,source,channel,link_id,entries FROM site_entries WHERE day BETWEEN ? AND ? AND (?='' OR page_path=?) AND (?='' OR source=?) AND (?='' OR link_id=?)").all(from,to,page??'',page??'',filterSource??'',filterSource??'',link??'',link??'');
  return {total:rows.reduce((n,row)=>n+row.entries,0),linked:rows.reduce((n,row)=>n+(row.link_id?row.entries:0),0),started_at:db.prepare("SELECT value FROM analytics_totals_meta WHERE key='entries_started_at'").get()?.value,rows};
 }
 function consent(req,all,version='crm-cookies-20261105'){
  const current=visitor(req),time=now();if(all!==true){if(current)db.prepare('DELETE FROM visitors WHERE visitor_id=?').run(current);return ['dp_visitor=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax','dp_consent=necessary; Max-Age=15552000; Path=/; Secure; SameSite=Lax'];}
  const id=current??randomUUID(),until=new Date(Date.parse(time)+180*86400000).toISOString();db.prepare('INSERT INTO visitors VALUES(?,?,?,?,?,?) ON CONFLICT(visitor_id) DO UPDATE SET consent_at=excluded.consent_at,consent_until=excluded.consent_until,consent_version=excluded.consent_version').run(id,time,until,version,time,time);
  return [`dp_visitor=${signed({kind:'visitor',id,exp:Date.parse(until)})}; Max-Age=15552000; Path=/; Secure; HttpOnly; SameSite=Lax`,'dp_consent=all; Max-Age=15552000; Path=/; Secure; SameSite=Lax'];
 }
 function events(req,data){
  if(!enabled)return {accepted:0,disabled:true};
  const id=visitor(req);if(!id)return {accepted:0,consentRequired:true};if(!Array.isArray(data.events)||data.events.length>30)throw Error('INVALID_EVENTS');
  const pending=data.events.filter(e=>e&&UUID.test(e.event_id??'')&&EVENT_CODES.has(e.event_code)&&e.event_code!=='dp_lead_confirmed'&&!db.prepare('SELECT 1 FROM visitor_events WHERE event_id=?').get(e.event_id));
  if(!pending.length)return {accepted:0};
  const current=visit(id,{...data,landing:pending.some(e=>e.event_code==='page_view')}),time=now();let accepted=0,activeBudget=Math.max(0,(Date.parse(time)-Date.parse(current.last_active_at))/1000);
  for(const event of pending){
   if(!event||!UUID.test(event.event_id??'')||!EVENT_CODES.has(event.event_code)||event.event_code==='dp_lead_confirmed')continue;
   const metadata={};for(const key of ['model_id','size_id','plan_id','cta_id','placement','purpose']){
    const value=event[key];const valid=key==='size_id'?/^(?:[456][05]0|[456]x[456])$/.test(value??''):key==='model_id'?['kvadro','parus','viking','kvadro-house'].includes(value):key==='cta_id'?CTAS.has(value):key==='placement'?PLACEMENTS.has(value):key==='plan_id'?/^(?:dp3d-\d{2}|DP-PL-\d{3}|p\d{1,2})$/.test(value??''):['quote','callback','plan','plan_info','photo','delivery','selection_help','production','foundation','layout_quote'].includes(value);
    if(valid)metadata[key]=value;
   }
   if(Number.isInteger(event.step)&&event.step>=1&&event.step<=7)metadata.step=event.step;
   if(event.event_code==='dp_quiz_result'&&typeof event.variant==='string'&&QUIZ_VARIANT.test(event.variant))metadata.variant=event.variant;
   let active=event.event_code==='active_time_ping'?Math.max(0,Math.min(15,activeBudget,Number(event.active_seconds)||0)):0;
   const changed=db.prepare('INSERT OR IGNORE INTO visitor_events VALUES(?,?,?,?,?,?)').run(event.event_id,current.visit_id,time,event.event_code,pathOnly(event.page_path),JSON.stringify(metadata)).changes;
   accepted+=Number(changed);if(changed&&active){db.prepare('UPDATE visits SET active_seconds=active_seconds+? WHERE visit_id=?').run(active,current.visit_id);activeBudget-=active;}
  }
  db.prepare('UPDATE visits SET last_active_at=? WHERE visit_id=?').run(time,current.visit_id);db.prepare('UPDATE visitors SET last_seen=? WHERE visitor_id=?').run(time,id);return {accepted,visit_context:signed({kind:'visit',visitor_id:id,visit_id:current.visit_id,exp:Date.parse(time)+86400000})};
 }
 function bindLead(req,leadId,data){
  const staff=String(req.headers.cookie??'').split(';').some(s=>s.trim()==='dp_staff=1');
  const id=enabled&&!staff?visitor(req):null,time=now();let first,last,conversion,current,trigger=null;
  if(id){current=visit(id,{...data,landing:false});const visits=db.prepare('SELECT touch_json FROM visits WHERE visitor_id=? AND started_at>=? ORDER BY started_at').all(id,new Date(Date.parse(time)-30*86400000).toISOString()).map(r=>JSON.parse(r.touch_json));first=visits.find(t=>!['direct','unknown'].includes(t.channel))??visits[0];last=visits.filter(t=>!['direct','unknown'].includes(t.channel)).at(-1);conversion=JSON.parse(current.touch_json);
   if(UUID.test(data?.trigger_event_id??'')){const found=db.prepare("SELECT e.event_id FROM visitor_events e JOIN visits v ON v.visit_id=e.visit_id WHERE e.event_id=? AND v.visitor_id=? AND v.visit_id=? AND e.event_code='dp_cta_click'").get(data.trigger_event_id,id,current.visit_id);trigger=found?.event_id??null;}
  }else{conversion={...source(data),at:time};first=conversion;last=!['direct','unknown'].includes(conversion.channel)?conversion:null;}
  db.prepare('INSERT OR IGNORE INTO lead_attribution(lead_id,visitor_id,visit_id,trigger_event_id,first_touch,last_non_direct_touch,conversion_touch,confidence,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(leadId,id,current?.visit_id??null,trigger,JSON.stringify(first??null),JSON.stringify(last??null),JSON.stringify(conversion),id?'browser_linked':conversion.link_id?'publication_only':'unlinked',time);
 }
 function confirmed(id){db.exec('BEGIN IMMEDIATE');try{
  const row=db.prepare('SELECT * FROM lead_attribution WHERE lead_id=?').get(id);if(!row||row.confirmed){db.exec('COMMIT');return;}
  db.prepare('UPDATE lead_attribution SET confirmed=1 WHERE lead_id=?').run(id);if(enabled&&row.visit_id)db.prepare('INSERT OR IGNORE INTO visitor_events VALUES(?,?,?,?,?,?)').run(randomUUID(),row.visit_id,now(),'dp_lead_confirmed','/',JSON.stringify({lead_id:id}));
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
 }
 function leadAttribution(id){const row=db.prepare('SELECT * FROM lead_attribution WHERE lead_id=?').get(id);return row?{...row,first_touch:JSON.parse(row.first_touch),last_non_direct_touch:JSON.parse(row.last_non_direct_touch),conversion_touch:JSON.parse(row.conversion_touch),model:'last_non_direct',window_days:30}:null;}
 function leadTimeline(id){const row=db.prepare('SELECT visitor_id,created_at FROM lead_attribution WHERE lead_id=?').get(id);if(!row?.visitor_id)return [];
  return db.prepare("SELECT e.*,v.started_at,v.touch_json FROM visitor_events e JOIN visits v ON v.visit_id=e.visit_id WHERE v.visitor_id=? AND e.event_code!='active_time_ping' AND (e.at<=? OR (e.event_code='dp_lead_confirmed' AND json_extract(e.metadata_json,'$.lead_id')=?)) ORDER BY e.at,e.rowid LIMIT 1000").all(row.visitor_id,row.created_at,id).map(r=>({...r,metadata:JSON.parse(r.metadata_json),touch:JSON.parse(r.touch_json)}));
 }
 function report({from,to,model='last_non_direct',window=30,details=true}={}){
  if(!['first','last_non_direct','conversion'].includes(model)||![7,30,90].includes(Number(window)))throw Error('INVALID_REPORT');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from??'')||!/^\d{4}-\d{2}-\d{2}$/.test(to??'')||from>to)throw Error('INVALID_REPORT');
  const start=from+'T00:00:00+03:00',end=to+'T23:59:59.999+03:00',lo=new Date(start).toISOString(),hi=new Date(end).toISOString();
  if(Date.parse(hi)-Date.parse(lo)>366*86400000)throw Error('INVALID_REPORT');
  for(const day of [from,to])if(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(day+'T12:00:00Z'))!==day)throw Error('INVALID_REPORT');
  const cohort=new Map(),daily=new Map(),dayOf=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
  const dayGroup=at=>{const key=dayOf(at);if(!daily.has(key))daily.set(key,{day:key,verified_visits:0,real_leads:0,won:0,browsers:new Set()});return daily.get(key);};
  const groups=new Map();const group=t=>{const key=t?.link_id??`${t?.channel??'unknown'}:${t?.source??'unknown'}`;if(!groups.has(key))groups.set(key,{key,link_id:t?.link_id??null,channel:t?.channel??'unknown',source:t?.source??'unknown',technical_requests:0,suspected_bot_requests:0,verified_visits:0,unique_browsers:0,real_leads:0,confirmed_leads:0,won:0,active_seconds:0,site_entries:0,linked_entries:0,browsers:new Set(),convertingVisits:new Set()});return groups.get(key);};
  for(const row of db.prepare('SELECT * FROM visits WHERE started_at BETWEEN ? AND ?').all(lo,hi)){const target=group(JSON.parse(row.touch_json));target.verified_visits++;target.active_seconds+=row.active_seconds;target.browsers.add(row.visitor_id);cohort.set(row.visit_id,target.key);const day=dayGroup(row.started_at);day.verified_visits++;day.browsers.add(row.visitor_id);}
  for(const row of db.prepare("SELECT a.*,l.id crm_lead_id,l.status,l.notification_status,l.created_at lead_created FROM leads l LEFT JOIN lead_attribution a ON a.lead_id=l.id LEFT JOIN lead_classification c ON c.lead_id=l.id WHERE COALESCE(c.classification,'real')='real' AND l.created_at BETWEEN ? AND ?").all(lo,hi)){
   let first=JSON.parse(row.first_touch??'null'),last=JSON.parse(row.last_non_direct_touch??'null');const conversion=JSON.parse(row.conversion_touch??'null');
   if(row.visitor_id&&model!=='conversion'){
    const cutoff=row.created_at??row.lead_created,history=db.prepare('SELECT touch_json FROM visits WHERE visitor_id=? AND started_at BETWEEN ? AND ? ORDER BY started_at').all(row.visitor_id,new Date(Date.parse(cutoff)-Number(window)*86400000).toISOString(),cutoff).map(v=>JSON.parse(v.touch_json));
    if(history.length){const external=history.filter(t=>!['direct','unknown'].includes(t.channel));first=external[0]??history[0];last=external.at(-1)??null;}
   }
   let touch=model==='first'?first:model==='conversion'?conversion:last??conversion;
   if(touch?.at&&Date.parse(row.lead_created)-Date.parse(touch.at)>Number(window)*86400000)touch=null;
   const target=group(touch);target.real_leads++;(target.lead_ids??=[]).push(row.crm_lead_id);if(row.notification_status==='delivered')target.confirmed_leads++;if(row.status==='won')target.won++;if(cohort.get(row.visit_id)===target.key)target.convertingVisits.add(row.visit_id);const day=dayGroup(row.lead_created);day.real_leads++;if(row.status==='won')day.won++;
  }
  for(const row of db.prepare('SELECT r.*,l.source,l.channel FROM link_requests r JOIN tracking_links l ON l.id=r.link_id WHERE day BETWEEN ? AND ?').all(from,to)){const target=group(row);if(row.suspected_bot)target.suspected_bot_requests+=row.requests;else target.technical_requests+=row.requests;}
  const traffic=entryReport({from,to});
  for(const row of traffic.rows){const target=group({...row,link_id:row.link_id||null});target.site_entries+=row.entries;if(row.link_id)target.linked_entries+=row.entries;}
  const rows=[...groups.values()].map(({browsers,convertingVisits,...r})=>({...r,label:r.link_id?link(r.link_id)?.label:null,lead_ids:(r.lead_ids??[]).filter(Boolean).slice(0,500),unique_browsers:browsers.size,converting_visits:convertingVisits.size,avg_active_seconds:r.verified_visits?Math.round(r.active_seconds/r.verified_visits):null,lead_conversion:r.verified_visits?convertingVisits.size/r.verified_visits:null}));
  const totals={unique_browsers:new Set([...groups.values()].flatMap(r=>[...r.browsers])).size};for(const key of ['site_entries','linked_entries','technical_requests','suspected_bot_requests','verified_visits','real_leads','confirmed_leads','won'])totals[key]=rows.reduce((n,r)=>n+r[key],0);
  const result={from,to,time_zone:'Europe/Moscow',model,window_days:Number(window),source:'CRM',partial:true,updated_at:now(),traffic:{total:traffic.total,linked:traffic.linked,started_at:traffic.started_at},totals,limitations:'Входы на сайт считаются по внешним переходам и прямым открытиям. По вашим ссылкам — часть общего числа, не дополнительный трафик. Сотрудники с отметкой исключения не учитываются. Подробные действия и уникальные браузеры доступны по согласившимся посетителям. Браузер не равен человеку. Конверсия: доля визитов периода с реальной заявкой и совпадающим источником. Продажи — заявки со статусом «Продано»; выручка не рассчитывается.',rows};
  if(details){const count=Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000)+1;result.daily=Array.from({length:count},(_,i)=>{const day=new Date(Date.parse(from+'T12:00:00Z')+i*86400000).toISOString().slice(0,10),r=daily.get(day)??{day,verified_visits:0,real_leads:0,won:0,browsers:new Set()};const {browsers,...values}=r;return {...values,unique_browsers:browsers.size};});const previousTo=new Date(Date.parse(from+'T12:00:00Z')-86400000).toISOString().slice(0,10),previousFrom=new Date(Date.parse(from+'T12:00:00Z')-count*86400000).toISOString().slice(0,10);result.previous={from:previousFrom,to:previousTo,totals:report({from:previousFrom,to:previousTo,model,window,details:false}).totals};}
  return result;
 }
 function visitorDetail(id){
  if(!UUID.test(id??''))throw Error('NOT_FOUND');const row=db.prepare('SELECT visitor_id,first_seen,last_seen,consent_at,consent_until FROM visitors WHERE visitor_id=?').get(id);if(!row)throw Error('NOT_FOUND');
  return {...row,visits:db.prepare('SELECT * FROM visits WHERE visitor_id=? ORDER BY started_at DESC LIMIT 100').all(id).map(v=>({...v,touch:JSON.parse(v.touch_json),touch_json:undefined})),events:db.prepare('SELECT e.* FROM visitor_events e JOIN visits v ON v.visit_id=e.visit_id WHERE v.visitor_id=? ORDER BY e.at DESC,e.rowid DESC LIMIT 1000').all(id).map(e=>({...e,metadata:JSON.parse(e.metadata_json),metadata_json:undefined}))};
 }
 function actions(query){
  const base=report({...query,details:false}),lo=new Date(base.from+'T00:00:00+03:00').toISOString(),hi=new Date(base.to+'T23:59:59.999+03:00').toISOString();const selected=new Set(),browsers=new Set();
  for(const v of db.prepare('SELECT * FROM visits WHERE started_at BETWEEN ? AND ?').all(lo,hi)){const t=JSON.parse(v.touch_json);if(query.link&&query.link!==t.link_id||query.source&&query.source!==t.source||query.page&&query.page!==v.landing_path)continue;selected.add(v.visit_id);browsers.add(v.visitor_id);}
  const quiz={invite_views:0,completions:0,known_combinations:0,combinations:[]};
  const combinations=new Map();
  const groups=new Map(),reached=new Map();for(const e of db.prepare('SELECT e.* FROM visitor_events e WHERE e.at BETWEEN ? AND ? ORDER BY e.at').all(lo,hi)){
   if(!selected.has(e.visit_id)||e.event_code==='active_time_ping')continue;const metadata=JSON.parse(e.metadata_json);if(query.bath&&metadata.model_id!==query.bath)continue;
   if(e.event_code==='dp_lead_confirmed'&&db.prepare("SELECT 1 FROM lead_classification WHERE lead_id=? AND classification='test'").get(metadata.lead_id??''))continue;
   if(e.event_code==='dp_quiz_invite_view')quiz.invite_views++;
   if(e.event_code==='dp_quiz_result'){
    quiz.completions++;
    if(typeof metadata.variant==='string'&&QUIZ_VARIANT.test(metadata.variant)){
     quiz.known_combinations++;
     combinations.set(metadata.variant,(combinations.get(metadata.variant)??0)+1);
    }
   }
   const key=[e.event_code,metadata.cta_id??'',metadata.model_id??'',metadata.plan_id??''].join('|');if(!groups.has(key))groups.set(key,{event_code:e.event_code,...metadata,count:0,visits:new Set()});const g=groups.get(key);g.count++;g.visits.add(e.visit_id);if(!reached.has(e.event_code))reached.set(e.event_code,new Set());reached.get(e.event_code).add(e.visit_id);
  }
  quiz.combinations=[...combinations].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([variant,count])=>({variant,count}));
  return {quiz,traffic:entryReport({from:base.from,to:base.to,page:query.page,source:query.source,link:query.link}),from:base.from,to:base.to,verified_visits:selected.size,unique_browsers:browsers.size,rows:[...groups.values()].map(({visits,...g})=>({...g,unique_visits:visits.size})),stages:['page_view','dp_model_select','dp_plan_view','dp_cta_click','dp_form_open','dp_form_submit_attempt','dp_lead_confirmed'].map(event_code=>({event_code,visits:reached.get(event_code)?.size??0})),limitations:'Охват событий в визитах с согласием; этапы могут проходить в разном порядке. Тестовые заявки исключены из подтверждений. События до внедрения не восстанавливаются.'};
 }
 async function managerApi(req,res,{user,crm,url}){
  if(url.pathname==='/api/manager/tracking-links'){
   crm.requirePermission(user.id,'manage_tracking_links');
    if(req.method==='GET'){crmAnswer(res,200,{ok:true,links:db.prepare('SELECT id FROM tracking_links ORDER BY created_at DESC').all().map(r=>link(r.id)),sources:db.prepare('SELECT * FROM tracking_sources ORDER BY system DESC,key').all(),channels:CHANNELS});return true;}
   if(req.method==='POST'){crmAnswer(res,201,{ok:true,link:createLink(user.id,await crmJson(req))});return true;}
  }
  const item=/^\/api\/manager\/tracking-links\/([a-f\d-]{36})$/.exec(url.pathname);
  if(item&&req.method==='PATCH'){
   crm.requirePermission(user.id,'manage_tracking_links');const data=await crmJson(req),row=link(item[1]);if(!row)throw Error('NOT_FOUND');if(!['active','paused','archived'].includes(data.status))throw Error('INVALID_TEXT');
   db.prepare('UPDATE tracking_links SET label=?,status=? WHERE id=?').run(label(data.label),data.status,row.id);log(user.id,'tracking_link_update',row.id,{status:row.status},{status:data.status});crmAnswer(res,200,{ok:true,link:link(row.id)});return true;
  }
  if(url.pathname==='/api/manager/tracking-sources'&&req.method==='POST'){
   crm.requirePermission(user.id,'manage_tracking_links');const data=await crmJson(req);
   if(typeof data.key!=='string'||!/^custom_[a-z][a-z0-9_-]{0,32}$/.test(data.key))throw Error('INVALID_SOURCE');
   db.prepare('INSERT INTO tracking_sources VALUES(?,?,0)').run(data.key,label(data.label,80));crmAnswer(res,201,{ok:true,source:{key:data.key,label:data.label}});return true;
  }
  if(url.pathname==='/api/manager/source-reports'&&req.method==='GET'){crm.requirePermission(user.id,'view_source_reports');crmAnswer(res,200,{ok:true,report:report(Object.fromEntries(url.searchParams))});return true;}
  if(url.pathname==='/api/manager/action-reports'&&req.method==='GET'){crm.requirePermission(user.id,'view_analytics');crmAnswer(res,200,{ok:true,report:actions(Object.fromEntries(url.searchParams))});return true;}
  if(url.pathname==='/api/manager/visitors'&&req.method==='GET'){crm.requirePermission(user.id,'view_analytics');crm.requirePermission(user.id,'view_visitor_timeline');crmAnswer(res,200,{ok:true,visitors:db.prepare('SELECT visitor_id,first_seen,last_seen FROM visitors ORDER BY last_seen DESC LIMIT 100').all()});return true;}
  const visitorMatch=/^\/api\/manager\/visitors\/([a-f\d-]{36})$/.exec(url.pathname);if(visitorMatch&&req.method==='GET'){crm.requirePermission(user.id,'view_analytics');crm.requirePermission(user.id,'view_visitor_timeline');crmAnswer(res,200,{ok:true,visitor:visitorDetail(visitorMatch[1])});return true;}
  return false;
 }
 function purge(){const cutoff=new Date(Date.parse(now())-180*86400000).toISOString();db.prepare('DELETE FROM visitor_events WHERE at<?').run(cutoff);db.prepare('DELETE FROM visits WHERE last_active_at<?').run(cutoff);db.prepare('DELETE FROM visitors WHERE consent_until<=? OR last_seen<?').run(now(),cutoff);}
 return {migrate,countEntry,createLink,link,source,consent,events,bindLead,confirmed,leadAttribution,leadTimeline,report,actions,visitorDetail,managerApi,purge,visitor,
  signedSource(data){return signed({kind:'source',touch:source(data),exp:Math.floor(Date.parse(now())/1800000)*1800000+7200000});},
  redirect(slug,userAgent='',{staff=false}={}){const row=link(slug);if(!row)return null;if(staff)return row.full_url;const bot=/bot|crawler|spider|preview|facebookexternalhit|telegrambot/i.test(userAgent);const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now()));db.prepare('INSERT INTO link_requests VALUES(?,?,?,1) ON CONFLICT(day,link_id,suspected_bot) DO UPDATE SET requests=requests+1').run(day,row.id,bot?1:0);return row.full_url;},
  close(){db.close();},enabled
 };
}

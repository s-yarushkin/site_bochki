import {DatabaseSync} from 'node:sqlite';
export const AGGREGATE_EVENTS=new Set(['dp_model_view','dp_model_select','dp_size_select','dp_plan_view','dp_plan_select','dp_cta_click','dp_form_open','dp_form_close','dp_form_submit_attempt','dp_quiz_start','dp_quiz_answer','dp_quiz_result','dp_3d_open','dp_3d_close','dp_gallery_open','dp_plan_mirror','dp_plan_compare','dp_package_select','dp_compare_view','dp_faq_open','dp_phone_click','dp_delivery_start','dp_base_kit_open','consent_shown','consent_accept','consent_decline']);
const MODELS=new Set(['','kvadro','parus','viking','kvadro-house']);
const CTAS=new Set(['','header_quote','hero_help','catalog_quote','layout_quote','footer_quote','quiz_catalog','production','foundation','contact','unknown']);
const PLACES=new Set(['','header','hero','catalog','model','plans','gallery','quiz','footer','final','unknown','cookie_banner','cookie_settings']);
const SOURCES=new Set(['unknown','direct','yandex','google','vk','youtube','telegram','max','partner','offline','other']);
const CHANNELS=new Set(['unknown','direct','paid','search_organic','social_organic','messenger','partner_referral','other_referral']);
const PAGES=new Set(['/','/bani/','/planirovki/','/novyy-god/','/novyy-god-2027/','/bani/kvadro/','/bani/parus/','/bani/viking/','/bani/kvadro-haus/','/other/']);
export const moscowDay=time=>new Date(Date.parse(time)+10800000).toISOString().slice(0,10);
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
function exact(value,keys){return object(value)&&Object.keys(value).every(k=>keys.includes(k));}
function normalize(data){
 if(!exact(data,['events','source','channel','page'])||!Array.isArray(data.events)||data.events.length>30||!SOURCES.has(data.source??'unknown')||!CHANNELS.has(data.channel??'unknown')||!PAGES.has(data.page??'/other/'))throw Error('INVALID_AGGREGATE');
 return data.events.map(e=>{
  if(!exact(e,['event_code','model_id','cta_id','placement','step'])||!AGGREGATE_EVENTS.has(e.event_code)||!MODELS.has(e.model_id??'')||!CTAS.has(e.cta_id??'')||!PLACES.has(e.placement??'')||(e.step!==undefined&&(!Number.isInteger(e.step)||e.step<1||e.step>7)))throw Error('INVALID_AGGREGATE');
  return {event_code:e.event_code,model_id:e.model_id??'',cta_id:e.cta_id??'',placement:e.placement??'',step:e.step??0,page:data.page??'/other/',source:data.source??'unknown',channel:data.channel??'unknown'};
 });
}
export function openAggregateCounters(path,{enabled=false,now=()=>new Date().toISOString()}={}){
 const db=new DatabaseSync(path);db.exec('PRAGMA busy_timeout=5000;');
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
 function migrate(){return tx(()=>{
  db.exec(`CREATE TABLE IF NOT EXISTS aggregate_counters(day TEXT NOT NULL,event_code TEXT NOT NULL,model_id TEXT NOT NULL,cta_id TEXT NOT NULL,placement TEXT NOT NULL,step INTEGER NOT NULL,page TEXT NOT NULL,source TEXT NOT NULL,channel TEXT NOT NULL,count INTEGER NOT NULL CHECK(count>0),PRIMARY KEY(day,event_code,model_id,cta_id,placement,step,page,source,channel)) WITHOUT ROWID;CREATE TABLE IF NOT EXISTS aggregate_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  db.prepare("INSERT OR IGNORE INTO aggregate_settings VALUES('started_at',?)").run(now());
 });}
 function count(data){const events=normalize(data);if(!enabled)return {accepted:0,disabled:true};return tx(()=>{
  const insert=db.prepare('INSERT INTO aggregate_counters VALUES(?,?,?,?,?,?,?,?,?,1) ON CONFLICT(day,event_code,model_id,cta_id,placement,step,page,source,channel) DO UPDATE SET count=count+1'),day=moscowDay(now());
  for(const e of events)insert.run(day,e.event_code,e.model_id,e.cta_id,e.placement,e.step,e.page,e.source,e.channel);
  return {accepted:events.length};
 });}
 function report(q={}){
  const today=moscowDay(now()),from=q.from||today,to=q.to||today;
  if(!date(from)||!date(to)||from>to||Date.parse(to)-Date.parse(from)>366*86400000||q.bath&&!MODELS.has(q.bath)||q.source&&!SOURCES.has(q.source)||q.page&&!PAGES.has(q.page))throw Error('INVALID_REPORT');
  const conditions=['day BETWEEN ? AND ?'],args=[from,to];for(const [key,col]of [['bath','model_id'],['source','source'],['page','page']])if(q[key]){conditions.push(col+'=?');args.push(q[key]);}
  const rows=db.prepare(`SELECT event_code,model_id,cta_id,placement,step,page,source,channel,SUM(count) count FROM aggregate_counters WHERE ${conditions.join(' AND ')} GROUP BY event_code,model_id,cta_id,placement,step,page,source,channel ORDER BY count DESC,event_code`).all(...args);
  // Banner counts intentionally ignore product/page/source filters: global UI coverage,
  // not person-level conversion or a funnel attributed to a visit.
  const consent={shown:0,accepted:0,declined:0};for(const r of db.prepare("SELECT event_code,SUM(count) n FROM aggregate_counters WHERE day BETWEEN ? AND ? AND placement='cookie_banner' AND event_code IN ('consent_shown','consent_accept','consent_decline') GROUP BY event_code").all(from,to))consent[({consent_shown:'shown',consent_accept:'accepted',consent_decline:'declined'})[r.event_code]]=r.n;
  const choices=consent.accepted+consent.declined;
  return {enabled,from,to,started_at:db.prepare("SELECT value FROM aggregate_settings WHERE key='started_at'").get()?.value??null,rows:rows.filter(r=>!r.event_code.startsWith('consent_')),consent:{...consent,choices,acceptance_among_choices:choices?consent.accepted/choices:null},limitations:'Общие количества событий, а не люди и не уникальные визиты. Без ID браузера, cookies, истории переходов и привязки к заявке. Показатели баннера — общие за выбранные даты; повторные показы возможны. События до запуска не восстанавливаются.'};
 }
 return {enabled,migrate,count,report,ready(){return ['aggregate_counters','aggregate_settings'].every(name=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)));},purge(){db.prepare('DELETE FROM aggregate_counters WHERE day<?').run(moscowDay(new Date(Date.parse(now())-180*86400000).toISOString()));},close(){db.close();}};
}

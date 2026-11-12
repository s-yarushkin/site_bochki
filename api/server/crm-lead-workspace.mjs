import {randomUUID} from 'node:crypto';

export function staffDisplayName(row){
 return String(row?.name??'').trim();
}
const models=new Set(['kvadro','parus','viking','kvadro-house']);
export const ACTIVITY_KINDS=Object.freeze(['note','message_in','message_out','call','meeting']);
const channels=new Set(['none','phone','max','telegram','whatsapp','other']);
export const fold=v=>String(v??'').normalize('NFKC').toLocaleLowerCase('ru-RU').replaceAll('ё','е').replace(/\s+/g,' ').trim();
const text=(v,max)=>{if(typeof v!=='string')throw Error('INVALID_TEXT');const s=v.replace(/[\u0000-\u001f\u007f]/g,' ').trim();if(s.length>max)throw Error('TEXT_TOO_LONG');return s;};
const bodyText=(v,max)=>{if(typeof v!=='string')throw Error('INVALID_TEXT');const s=v.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim();if(s.length>max)throw Error('TEXT_TOO_LONG');return s;};
const like=v=>'%'+fold(v).replace(/[\\%_]/g,'\\$&')+'%';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
function dateBound(value,next=false){
 if(!value)return null;
 const date=new Date(value+'T00:00:00Z');
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw Error('INVALID_FILTER');
 return new Date(Date.parse(value+'T00:00:00+03:00')+(next?86400000:0)).toISOString();
}
function metadata(lead,profile,attribution){
 const d=lead.detail??{},touch=attribution?.conversion_touch??{},selected={...d.journeyContext?.variant?.configuration?.selection,...d.intentContext?.selection,...d.configuration?.selection};
 const rawModel=selected.model??d.estimate?.modelId??d.planRequest?.model;
 const city=[d.district,d.settlement,d.journeyContext?.settlement,/Город установки:\s*([^.!?]+)[.!?]/i.exec(d.comment??'')?.[1]].find(v=>typeof v==='string'&&v.trim())??'';
 const first=d.attribution?.last??d.attribution?.first??{},source=touch.source??first.utm_source??d.crmContext?.utm_source??'unknown';
 return {name:profile?.contact_name??d.name??'',settlement:profile?.settlement??city,region:profile?.region??d.region??'',model:models.has(rawModel)?rawModel:'',modelSource:d.intentContext?.sources?.model??(d.estimate?'request':'unknown'),size:selected.size??d.estimate?.sizeId??'',package:selected.package??'',plan:selected.plan??d.planRequest?.layoutId??'',source,channel:touch.channel??'',campaign:touch.campaign??first.utm_campaign??'',landing:d.intentContext?.pagePath??d.crmContext?.page_path??first.landing??'',entry:d.intentContext?.entry??'unknown'};
}
export function createLeadWorkspace(db,{clock,statuses,toLead}){
 db.function('crm_fold',{deterministic:true},fold);
 db.function('crm_lead_field',{deterministic:true},(value,key)=>String(metadata({detail:JSON.parse(value)},null,null)[key]??''));
 db.exec(`
 CREATE TABLE IF NOT EXISTS crm_lead_profiles(lead_id TEXT PRIMARY KEY REFERENCES leads(id),contact_name TEXT,settlement TEXT,region TEXT,assignee_user_id TEXT REFERENCES staff_users(id),follow_up_at TEXT,version INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS crm_profile_assignee ON crm_lead_profiles(assignee_user_id,follow_up_at);
 CREATE INDEX IF NOT EXISTS crm_profile_geography ON crm_lead_profiles(region,settlement);
 CREATE TABLE IF NOT EXISTS crm_lead_activity(id TEXT PRIMARY KEY,lead_id TEXT NOT NULL REFERENCES leads(id),client_id TEXT NOT NULL,kind TEXT NOT NULL,channel TEXT NOT NULL DEFAULT 'none',body TEXT NOT NULL,occurred_at TEXT NOT NULL,created_at TEXT NOT NULL,actor_id TEXT NOT NULL,UNIQUE(lead_id,client_id));
 CREATE INDEX IF NOT EXISTS crm_activity_lead ON crm_lead_activity(lead_id,occurred_at,created_at);
 `);
 const has=table=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
 function staffRows(){return has('staff_users')?db.prepare("SELECT DISTINCT u.id,u.name,u.phone_e164,u.active FROM staff_users u JOIN user_roles ur ON ur.user_id=u.id JOIN role_permissions p ON p.role_id=ur.role_id WHERE p.permission='edit_leads' ORDER BY u.name,u.id").all():[];}
 function assignees(){return staffRows().map(u=>({id:u.id,name:staffDisplayName(u),active:Boolean(u.active)}));}
 function profile(id){return db.prepare('SELECT * FROM crm_lead_profiles WHERE lead_id=?').get(id)??null;}
 function attribution(id){if(!has('lead_attribution'))return null;const a=db.prepare('SELECT conversion_touch FROM lead_attribution WHERE lead_id=?').get(id);return a?{conversion_touch:JSON.parse(a.conversion_touch)}:null;}
 function decorate(lead){
  if(!lead)return null;const p=profile(lead.id),m=metadata(lead,p,attribution(lead.id)),staff=staffRows();
  const assigned=staff.find(u=>u.id===p?.assignee_user_id);
  const actorNames=lead.events&&has('staff_users')?new Map(db.prepare('SELECT id,name,phone_e164 FROM staff_users').all().map(u=>[u.id,staffDisplayName(u)])):null;
  return {...lead,...(lead.events?{events:lead.events.map(e=>({...e,actorName:e.actor==='system'?'Система':actorNames?.get(e.actor)??'Сотрудник'}))}:{}),customer:{name:m.name,settlement:m.settlement,region:m.region},metadata:m,assigneeUserId:p?.assignee_user_id??null,assigneeName:assigned?staffDisplayName(assigned):lead.assignee??'',assigneeActive:assigned?Boolean(assigned.active):null,followUpAt:p?.follow_up_at??null,version:p?.version??0};
 }
 function checkEditable(id){
  const row=db.prepare('SELECT * FROM leads WHERE id=?').get(id);if(!row)throw Error('NOT_FOUND');
  if(has('lead_classification')&&db.prepare("SELECT 1 FROM lead_classification WHERE lead_id=? AND classification='test'").get(id))throw Error('TEST_LEAD_READ_ONLY');
  return row;
 }
 function event(id,actor,action,detail){db.prepare('INSERT INTO lead_events(lead_id,happened_at,actor,action,detail) VALUES(?,?,?,?,?)').run(id,clock(),actor,action,detail);}
 function update(id,data,actor){return transaction(()=>{
  const original=checkEditable(id),before=decorate(toLead(original)),p=profile(id);
  if(data.expectedVersion!==undefined&&(!Number.isInteger(data.expectedVersion)||data.expectedVersion!==before.version))throw Error('LEAD_CONFLICT');
  const status=data.status??before.status;if(!statuses.includes(status))throw Error('INVALID_STATUS');
  let assigneeId=p?.assignee_user_id??null,assigneeName=original.assignee;
  if(Object.hasOwn(data,'assigneeUserId')){
   if(data.assigneeUserId!==null&&data.assigneeUserId!==''&&!uuid(data.assigneeUserId))throw Error('INVALID_ASSIGNEE');
   const chosen=data.assigneeUserId?staffRows().find(u=>u.id===data.assigneeUserId&&u.active):null;
   if(data.assigneeUserId&&!chosen)throw Error('INVALID_ASSIGNEE');
   assigneeId=chosen?.id??null;assigneeName=chosen?staffDisplayName(chosen):'';
  }else if(data.assignee!==undefined&&data.assignee!==original.assignee){
   const matches=staffRows().filter(u=>u.active&&(fold(staffDisplayName(u))===fold(data.assignee)||fold(u.name)===fold(data.assignee)));
   if(data.assignee==='' ){assigneeId=null;assigneeName='';}else if(matches.length===1){assigneeId=matches[0].id;assigneeName=staffDisplayName(matches[0]);}else throw Error('INVALID_ASSIGNEE');
  }
  const values={contact_name:Object.hasOwn(data,'contactName')?text(data.contactName,80):p?.contact_name??null,settlement:Object.hasOwn(data,'settlement')?text(data.settlement,140):p?.settlement??null,region:Object.hasOwn(data,'region')?text(data.region,100):p?.region??null};
  let followUp=p?.follow_up_at??null;
  if(Object.hasOwn(data,'followUpAt')){if(!data.followUpAt)followUp=null;else{const parsed=Date.parse(data.followUpAt);if(!Number.isFinite(parsed)||!/^20\d{2}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(data.followUpAt))throw Error('INVALID_DATE');followUp=new Date(parsed).toISOString();}}
  const note=data.managerNote===undefined?original.manager_note:bodyText(data.managerNote,2000),changes=[];
  if(status!==original.status)changes.push(['status',original.status+' → '+status]);
  if(assigneeId!==(p?.assignee_user_id??null)||assigneeName!==original.assignee)changes.push(['assignee',assigneeName||'Не назначен']);
  for(const [key,field,label]of [['contact_name','name','Имя клиента обновлено'],['settlement','settlement','Населённый пункт обновлён'],['region','region','Регион обновлён']])if((values[key]??before.customer[field])!==before.customer[field])changes.push(['customer',label]);
  if(followUp!==(p?.follow_up_at??null))changes.push(['follow_up',followUp?'Назначен следующий контакт':'Следующий контакт снят']);
  if(note!==original.manager_note)changes.push(['note','Рабочая заметка обновлена']);
  if(!changes.length)return decorate({...toLead(original),events:[]});
  const at=clock();db.prepare('UPDATE leads SET status=?,assignee=?,manager_note=?,updated_at=? WHERE id=?').run(status,assigneeName,note,at,id);
  db.prepare('INSERT INTO crm_lead_profiles VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(lead_id) DO UPDATE SET contact_name=excluded.contact_name,settlement=excluded.settlement,region=excluded.region,assignee_user_id=excluded.assignee_user_id,follow_up_at=excluded.follow_up_at,version=excluded.version,updated_at=excluded.updated_at,updated_by=excluded.updated_by').run(id,values.contact_name,values.settlement,values.region,assigneeId,followUp,before.version+1,at,actor);
  for(const [action,detail]of changes)event(id,actor,action,detail);
  return decorate(toLead(db.prepare('SELECT * FROM leads WHERE id=?').get(id)));
 });}
 function activity(id,{limit=50,offset=0}={}){
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0)throw Error('INVALID_PAGINATION');
  const names=new Map((has('staff_users')?db.prepare('SELECT id,name,phone_e164 FROM staff_users').all():[]).map(u=>[u.id,staffDisplayName(u)]));
  const entries=db.prepare('SELECT * FROM crm_lead_activity WHERE lead_id=? ORDER BY occurred_at DESC,created_at DESC,id DESC LIMIT ? OFFSET ?').all(id,limit,offset).map(r=>({...r,actorName:names.get(r.actor_id)??'Сотрудник'}));
  return {entries,total:db.prepare('SELECT count(*) n FROM crm_lead_activity WHERE lead_id=?').get(id).n,limit,offset};
 }
 function append(id,data,actor){return transaction(()=>{
  checkEditable(id);
  if(!uuid(data.clientId)||!ACTIVITY_KINDS.includes(data.kind)||!channels.has(data.channel??'none'))throw Error('INVALID_ACTIVITY');
  const body=bodyText(data.body,6000);if(!body)throw Error('INVALID_ACTIVITY');
  const at=clock(),parsed=data.occurredAt?Date.parse(data.occurredAt):Date.parse(at);
  if(!Number.isFinite(parsed))throw Error('INVALID_DATE');
  const occurred=new Date(parsed).toISOString();
  if(Date.parse(occurred)>Date.parse(at)+300000||Date.parse(occurred)<Date.parse('2000-01-01'))throw Error('INVALID_DATE');
  const old=db.prepare('SELECT * FROM crm_lead_activity WHERE lead_id=? AND client_id=?').get(id,data.clientId);
  if(old){if(old.body!==body||old.kind!==data.kind||old.channel!==(data.channel??'none')||old.actor_id!==actor||data.occurredAt&&old.occurred_at!==occurred)throw Error('ACTIVITY_CONFLICT');return {duplicate:true,activity:activity(id)};}
  db.prepare('INSERT INTO crm_lead_activity VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),id,data.clientId,data.kind,data.channel??'none',body,occurred,at,actor);
  db.prepare('UPDATE leads SET updated_at=? WHERE id=?').run(at,id);
  event(id,actor,'contact_recorded','Добавлена запись в журнал контактов');
  return {duplicate:false,activity:activity(id)};
 });}
 function list(filters={}){
  const {status='all',q='',classification='real',limit=30,offset=0}=filters;
  if(status!=='all'&&!statuses.includes(status)||!['real','test','all'].includes(classification))throw Error('INVALID_FILTER');
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>100000)throw Error('INVALID_PAGINATION');
  const staff=staffRows(),where=[],args=[],join=has('lead_attribution')?'LEFT JOIN lead_attribution a ON a.lead_id=l.id':'';
  const touch=has('lead_attribution')?"json_extract(a.conversion_touch,'$.source')":'NULL',touchChannel=has('lead_attribution')?"json_extract(a.conversion_touch,'$.channel')":'NULL',touchCampaign=has('lead_attribution')?"json_extract(a.conversion_touch,'$.campaign')":'NULL';
  const model="COALESCE(json_extract(l.snapshot_json,'$.configuration.selection.model'),json_extract(l.snapshot_json,'$.journeyContext.variant.configuration.selection.model'),json_extract(l.snapshot_json,'$.intentContext.selection.model'),json_extract(l.snapshot_json,'$.estimate.modelId'),'')";
  const region="COALESCE(p.region,json_extract(l.snapshot_json,'$.region'),'')",settlement="COALESCE(p.settlement,crm_lead_field(l.snapshot_json,'settlement'))";
  const source="COALESCE("+touch+",json_extract(l.snapshot_json,'$.attribution.last.utm_source'),json_extract(l.snapshot_json,'$.attribution.first.utm_source'),json_extract(l.snapshot_json,'$.crmContext.utm_source'),'unknown')";
  const campaign="COALESCE("+touchCampaign+",json_extract(l.snapshot_json,'$.attribution.last.utm_campaign'),json_extract(l.snapshot_json,'$.attribution.first.utm_campaign'),'')";
  if(status!=='all'){where.push('l.status=?');args.push(status);}
  if(classification!=='all')where.push(has('lead_classification')?(classification==='real'?"l.id NOT IN (SELECT lead_id FROM lead_classification WHERE classification='test')":"l.id IN (SELECT lead_id FROM lead_classification WHERE classification='test')"):(classification==='test'?'0':'1'));
  const add=(expression,value,partial=false)=>{if(value!==undefined&&value!==''){where.push('crm_fold('+expression+') '+(partial?"LIKE ? ESCAPE '\\'":'=?'));args.push(partial?like(text(value,200)):fold(text(value,200)));}};
  if(filters.assignee==='none')where.push("p.assignee_user_id IS NULL AND l.assignee=''");
  else if(filters.assignee){const u=staff.find(u=>u.id===filters.assignee);if(!u)throw Error('INVALID_ASSIGNEE');where.push('(p.assignee_user_id=? OR (p.assignee_user_id IS NULL AND crm_fold(l.assignee) IN (?,?)))');args.push(u.id,fold(u.name),fold(staffDisplayName(u)));}
  if(filters.model){if(!models.has(filters.model))throw Error('INVALID_FILTER');add(model,filters.model);}
  add(region,filters.region);add(settlement,filters.settlement,true);add(source,filters.source);add(touchChannel,filters.channel);add(campaign,filters.campaign,true);add("COALESCE(json_extract(l.snapshot_json,'$.intentContext.pagePath'),json_extract(l.snapshot_json,'$.crmContext.page_path'),'')",filters.landing,true);add("COALESCE(json_extract(l.snapshot_json,'$.intentContext.entry'),'unknown')",filters.entry);
  const from=dateBound(filters.from),to=dateBound(filters.to,true);if(from&&to&&from>=to)throw Error('INVALID_FILTER');
  if(from){where.push('l.created_at>=?');args.push(from);}if(to){where.push('l.created_at<?');args.push(to);}
  if(filters.overdue==='1'){where.push("p.follow_up_at IS NOT NULL AND p.follow_up_at<? AND l.status NOT IN ('won','lost')");args.push(clock());}
  let query=text(q,200);if(/^[+()\d\s-]+$/.test(query)&&query.replace(/\D/g,'').length>=3)query=query.replace(/\D/g,'');
  const searchable="l.id||' '||l.assignee||' '||l.manager_note||' '||l.snapshot_json||' '||COALESCE(p.contact_name,'')||' '||COALESCE(p.settlement,'')||' '||COALESCE(p.region,'')";
  for(const token of fold(query).split(' ').filter(Boolean).slice(0,12)){
   where.push("(crm_fold("+searchable+") LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM crm_lead_activity j WHERE j.lead_id=l.id AND crm_fold(j.body) LIKE ? ESCAPE '\\'))");args.push(like(token),like(token));
  }
  const base=' FROM leads l LEFT JOIN crm_lead_profiles p ON p.lead_id=l.id '+join+(where.length?' WHERE '+where.join(' AND '):'');
  const total=db.prepare('SELECT count(*) n'+base).get(...args).n;
  const rows=db.prepare('SELECT l.*'+base+' ORDER BY l.created_at DESC,l.id DESC LIMIT ? OFFSET ?').all(...args,limit,offset).map(r=>decorate(toLead(r)));
  return {leads:rows,total,limit,offset};
 }
 function options(){
  const attributed=has('lead_attribution');
  const rows=db.prepare('SELECT l.snapshot_json,p.contact_name,p.region,p.settlement,'+(attributed?'a.conversion_touch':'NULL AS conversion_touch')+' FROM leads l LEFT JOIN crm_lead_profiles p ON p.lead_id=l.id '+(attributed?'LEFT JOIN lead_attribution a ON a.lead_id=l.id ':'')+(has('lead_classification')?"WHERE l.id NOT IN (SELECT lead_id FROM lead_classification WHERE classification='test') ":'')+'ORDER BY l.created_at DESC LIMIT 10000').all().map(r=>metadata({detail:JSON.parse(r.snapshot_json)},r,r.conversion_touch?{conversion_touch:JSON.parse(r.conversion_touch)}:null));
  const distinct=key=>[...new Set(rows.map(r=>r[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru')).slice(0,300);
  return {assignees:assignees(),regions:distinct('region'),settlements:distinct('settlement'),sources:distinct('source'),campaigns:distinct('campaign'),landings:distinct('landing')};
 }
 return {decorate,update,activity,append,list,options,assignees};
}

import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

export const LEAD_STATUSES = Object.freeze([
  'new','in_progress','awaiting_customer','quote_sent','won','lost'
]);
const allowed = new Set(LEAD_STATUSES);

function safeText(value,limit=200) {
  if(typeof value!=='string')throw new Error('INVALID_TEXT');
  const cleaned=value.replace(/[\u0000-\u001f\u007f]+/g,' ').trim();
  if(cleaned.length>limit)throw new Error('TEXT_TOO_LONG');
  return cleaned;
}
function asLead(row) {
  return row?{
    id:row.id,createdAt:row.created_at,updatedAt:row.updated_at,
    flow:row.flow,status:row.status,assignee:row.assignee,
    managerNote:row.manager_note,notificationStatus:row.notification_status,
    notifiedAt:row.notified_at,detail:JSON.parse(row.snapshot_json)
  }:null;
}
export function openLeadStore(path,{clock=()=>new Date().toISOString()}={}) {
  if(typeof path!=='string'||!path||(!path.startsWith('/')&&path!==':memory:'))throw new Error('INVALID_DATABASE_PATH');
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const db=new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      flow TEXT NOT NULL CHECK(flow IN ('quote','callback')),
      status TEXT NOT NULL DEFAULT 'new',
      assignee TEXT NOT NULL DEFAULT '',
      manager_note TEXT NOT NULL DEFAULT '',
      notification_status TEXT NOT NULL DEFAULT 'pending',
      notified_at TEXT,
      snapshot_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS leads_created_idx ON leads(created_at DESC);
    CREATE INDEX IF NOT EXISTS leads_status_created_idx ON leads(status,created_at DESC);
    CREATE TABLE IF NOT EXISTS lead_events(
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL REFERENCES leads(id),
      happened_at TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS lead_events_idx ON lead_events(lead_id,seq);
  `);
  const getByRequest=db.prepare('SELECT * FROM leads WHERE request_id=?');
  const getById=db.prepare('SELECT * FROM leads WHERE id=?');
  const insert=db.prepare('INSERT INTO leads (id,request_id,created_at,updated_at,flow,snapshot_json) VALUES (?,?,?,?,?,?)');
  const insertEvent=db.prepare('INSERT INTO lead_events (lead_id,happened_at,actor,action,detail) VALUES (?,?,?,?,?)');
  const setDelivered=db.prepare("UPDATE leads SET notification_status='delivered',notified_at=?,updated_at=? WHERE id=?");
  const setFailed=db.prepare("UPDATE leads SET notification_status='failed',updated_at=? WHERE id=?");
  const setEdited=db.prepare('UPDATE leads SET status=?,assignee=?,manager_note=?,updated_at=? WHERE id=?');
  const getEvents=db.prepare('SELECT seq,happened_at,actor,action,detail FROM lead_events WHERE lead_id=? ORDER BY seq ASC');
  const total=db.prepare('SELECT count(*) AS n FROM leads');
  const counts=db.prepare('SELECT status,count(*) AS n FROM leads GROUP BY status');
  return {
    close(){db.close();},
    create(lead,requestId){
      if(!/^[a-f0-9-]{16,80}$/i.test(requestId))throw new Error('INVALID_REQUEST_ID');
      const existing=getByRequest.get(requestId);
      if(existing)return {lead:asLead(existing),created:false};
      const time=clock();
      for(let i=0;i<5;i++){
        const id='GB-'+time.slice(0,10).replaceAll('-','')+'-'+randomBytes(4).toString('hex').toUpperCase();
        try{
          db.exec('BEGIN IMMEDIATE');
          insert.run(id,requestId,time,time,lead.flow,JSON.stringify(lead));
          insertEvent.run(id,time,'system','created','Заявка получена с сайта');
          db.exec('COMMIT');
          return {lead:asLead(getById.get(id)),created:true};
        } catch(err) {
          try{db.exec('ROLLBACK');}catch{}
          const concurrent=getByRequest.get(requestId);
          if(concurrent)return {lead:asLead(concurrent),created:false};
          if(err.code!=='ERR_SQLITE_ERROR'||!String(err.message).includes('UNIQUE constraint failed: leads.id'))throw err;
        }
      }
      throw new Error('LEAD_ID_COLLISION');
    },
    get(id){return asLead(getById.get(id));},
    byRequest(requestId){return asLead(getByRequest.get(requestId));},
    delivery(id,state){
      if(!['delivered','failed'].includes(state))throw new Error('BAD_DELIVERY_STATE');
      const time=clock();
      db.exec('BEGIN IMMEDIATE');
      try{
        const before=getById.get(id);
        if(!before)throw new Error('NOT_FOUND');
        if(before.notification_status==='delivered'){db.exec('COMMIT');return asLead(before);}
        if(state==='delivered')setDelivered.run(time,time,id);
        else setFailed.run(time,id);
        insertEvent.run(id,time,'system',state==='delivered'?'max_delivered':'max_delivery_failed',
          state==='delivered'?'Уведомление доставлено в MAX':'Ошибка уведомления MAX; заявка сохранена');
        db.exec('COMMIT');
      }catch(err){try{db.exec('ROLLBACK');}catch{}throw err;}
      return asLead(getById.get(id));
    },
    list({status='all',q='',limit=50,offset=0}={}){
      if(status!=='all'&&!allowed.has(status))throw new Error('INVALID_STATUS');
      if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>100000)throw new Error('INVALID_PAGINATION');
      q=safeText(q,80);
      const where=[],args=[];
      if(status!=='all'){where.push('status=?');args.push(status);}
      if(q){
        where.push("(id LIKE ? OR assignee LIKE ? OR snapshot_json LIKE ?)");
        const match='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
        args.push(match,match,match);
      }
      const condition=where.length?'WHERE '+where.join(' AND '):'';
      const rows=db.prepare('SELECT * FROM leads '+condition+' ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?')
        .all(...args,limit,offset).map(asLead);
      const n=db.prepare('SELECT count(*) AS n FROM leads '+condition).get(...args).n;
      return {leads:rows,total:n,offset,limit};
    },
    stats(){
      const values=Object.fromEntries(LEAD_STATUSES.map(s=>[s,0]));
      for(const row of counts.all())values[row.status]=row.n;
      return {total:total.get().n,byStatus:values};
    },
    detail(id){
      const lead=asLead(getById.get(id));
      if(!lead)return null;
      return {...lead,events:getEvents.all(id).map(e=>({
        seq:e.seq,at:e.happened_at,actor:e.actor,action:e.action,detail:e.detail
      }))};
    },
    update(id,{status,assignee,managerNote},actor='manager'){
      if(!allowed.has(status))throw new Error('INVALID_STATUS');
      assignee=safeText(assignee,100);
      managerNote=safeText(managerNote,2000);
      const before=getById.get(id);
      if(!before)return null;
      const time=clock(),changes=[];
      if(before.status!==status)changes.push(['status',before.status+' → '+status]);
      if(before.assignee!==assignee)changes.push(['assignee',assignee||'Не назначен']);
      if(before.manager_note!==managerNote)changes.push(['note','Комментарий менеджера обновлён']);
      if(!changes.length)return this.detail(id);
      db.exec('BEGIN IMMEDIATE');
      try{
        setEdited.run(status,assignee,managerNote,time,id);
        for(const [action,detail] of changes)insertEvent.run(id,time,actor,action,detail);
        db.exec('COMMIT');
      }catch(err){try{db.exec('ROLLBACK');}catch{}throw err;}
      return this.detail(id);
    }
  };
}

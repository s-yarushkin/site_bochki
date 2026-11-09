"""Summarize all saved leads on server. Emits no contacts, comments, IDs or addresses."""
import argparse,collections,json,sqlite3
from contextlib import closing
from pathlib import Path
def audit(database):
 counts=collections.Counter();flows=collections.Counter();purposes=collections.Counter();entries=collections.Counter();sources=collections.Counter()
 with closing(sqlite3.connect(Path(database).as_uri()+'?mode=ro',uri=True)) as db:
  db.execute('PRAGMA query_only=ON')
  tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
  tests={r[0] for r in db.execute("SELECT lead_id FROM lead_classification WHERE classification='test'")} if 'lead_classification' in tables else set()
  attributed={r[0] for r in db.execute('SELECT lead_id FROM lead_attribution WHERE visitor_id IS NOT NULL')} if 'lead_attribution' in tables else set()
  for id,flow,status,payload in db.execute('SELECT id,flow,notification_status,snapshot_json FROM leads'):
   counts['all']+=1;counts['test' if id in tests else 'real']+=1
   if id in tests:continue
   try:d=json.loads(payload)
   except (TypeError,ValueError):counts['unreadable_snapshot']+=1;continue
   flows[flow]+=1;purposes[d.get('purpose') if d.get('purpose') in ['plan_info','quiz_catalog'] else 'ordinary_request']+=1;counts['delivered_to_max' if status=='delivered' else 'not_confirmed_in_max']+=1
   if d.get('estimate'):counts['with_calculation']+=1
   if d.get('journeyContext',{}).get('variant'):counts['callback_with_screen_variant']+=1
   if id in attributed:counts['with_consent_history_link']+=1
   if d.get('purpose')=='quiz_catalog' and str(d.get('comment','')).startswith('Источник: карточка модели.'):counts['model_form_using_quiz_contract']+=1
   c=d.get('intentContext')
   if not isinstance(c,dict):counts['without_explicit_provenance']+=1;continue
   counts['with_provenance']+=1;entry=c.get('entry');entries[entry if entry in ['model_offer','plan_request','site_capture','header_callback','footer_capture','capture_bar','quiz','calculator','production','foundation','delivery','unknown'] else 'unknown']+=1
   if c.get('recentActions'):counts['with_recent_actions']+=1
   for origin in c.get('sources',{}).values():sources[origin if origin in ['explicit','default','link','restored','request','unknown'] else 'unknown']+=1
 return {'scope':'all stored leads; business statistics exclude marked tests','counts':dict(counts),'flows':dict(flows),'purposes':dict(purposes),'entry_kinds':dict(entries),'field_sources':dict(sources),'historical_choice_inference':'Not inferred from populated/default values','records_changed':0,'messages_resent':0,'personal_data_exported':False}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--database',required=True);args=p.parse_args();print(json.dumps(audit(args.database)))

import hashlib,importlib.util,json,sqlite3,sys,tempfile,unittest
from contextlib import closing
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from caddy_public_cache import patch_config
spec=importlib.util.spec_from_file_location('lead_audit',ROOT/'scripts/audit-lead-intent.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class ReleaseChecks(unittest.TestCase):
 def test_narrow_cache_patch_and_ambiguous_config_rejection(self):
  text='example.org {\n  root * /srv/sites/dachapar-preview/current\n  header Cache-Control "no-store"\n  file_server\n}\nother.org {\n  header Cache-Control "no-store"\n}\n'
  result=patch_config(text)
  self.assertEqual(result.split('other.org')[1],text.split('other.org')[1])
  self.assertIn('method GET HEAD',result);self.assertIn('not path /api/* /go/* /crm/* /manager.html',result)
  self.assertIn('>Cache-Control "public, max-age=0, must-revalidate"',result)
  self.assertNotIn('immutable',result)
  for bad in ['',text+text,result]:
   with self.assertRaises(RuntimeError):patch_config(bad)
 def test_audit_is_read_only_and_exports_counts_only(self):
  with tempfile.TemporaryDirectory() as temp:
   path=Path(temp)/'fixture.sqlite'
   with closing(sqlite3.connect(path)) as db:
    db.executescript('CREATE TABLE leads(id TEXT,flow TEXT,notification_status TEXT,snapshot_json TEXT);CREATE TABLE lead_classification(lead_id TEXT,classification TEXT);CREATE TABLE lead_attribution(lead_id TEXT,visitor_id TEXT);')
    payload={'phone':'+79990000009','comment':'private-contact','purpose':'quiz_catalog','estimate':{'total':999},'journeyContext':{'variant':{'private':'secret'}}}
    db.executemany('INSERT INTO leads VALUES(?,?,?,?)',[('private-id-1','callback','delivered',json.dumps(payload)),('test-id','callback','failed',json.dumps(payload))]);db.execute("INSERT INTO lead_classification VALUES('test-id','test')");db.execute("INSERT INTO lead_attribution VALUES('private-id-1','private-browser')");db.commit()
   before=hashlib.sha256(path.read_bytes()).digest();result=module.audit(path);encoded=json.dumps(result)
   self.assertEqual(result['counts']['all'],2);self.assertEqual(result['counts']['real'],1);self.assertEqual(result['counts']['test'],1)
   self.assertEqual(result['counts']['without_explicit_provenance'],1);self.assertEqual(result['counts']['with_consent_history_link'],1)
   for forbidden in ['7999','private-contact','private-id','private-browser','secret']:self.assertNotIn(forbidden,encoded)
   self.assertEqual(hashlib.sha256(path.read_bytes()).digest(),before);self.assertEqual(result['records_changed'],0)

if __name__=='__main__':unittest.main()

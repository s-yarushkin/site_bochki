"""Isolated deployment and rollback; no system service or production DB access."""
import hashlib,importlib.util,json,os,shutil,sqlite3,subprocess,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('release',ROOT/'ops/conversion-release-install.py');release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
class ConversionRelease(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.source=self.root/'source';self.source.mkdir()
  self.api=self.root/'api';self.web=self.root/'web';self.api.mkdir();self.web.mkdir()
  self.old_api=self.api/'old';self.old_web=self.web/'old';self.old_api.mkdir();self.old_web.mkdir()
  self.m=json.loads((ROOT/'ops/conversion-release-manifest.json').read_text())
  names=set(self.m['apiGuards'])|set(self.m['apiFiles'])|set(self.m['webFiles'])|{'ops/v72-domain-install.py','ops/price-release-probe.mjs','ops/conversion-release-probe.mjs','seo/pages.json'}
  # Stage source from candidate. Historic API files are exact shipped fixtures.
  for n in names:
   p=self.source/n;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/n,p)
  for n in self.m['apiGuards']:
   p=self.old_api/n;p.parent.mkdir(parents=True,exist_ok=True)
   if n=='server/garant-bani-relay.mjs':shutil.copyfile(ROOT/'tests/fixtures/v72-relay-56bf8a1a.mjs',p)
   elif n=='data/catalog-pricebook.json':shutil.copyfile(ROOT/'data/legacy-v72-catalog.json',p)
   else:shutil.copyfile(ROOT/n,p)
  for n in self.m['webFiles']:
   p=self.old_web/n;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/n,p)
  # Local fixtures explicitly own their baseline; production manifest hashes are separately checked.
  self.m['staticBaselines']={str(self.old_web):{n:release.sha(self.old_web/n) for n in self.m['webFiles']}}
  self.m['expectedApi']=str(self.old_api)
  self.m['apiBaselines']={str(self.old_api):self.m['apiGuards']}
  (self.source/'ops/conversion-release-manifest.json').write_text(json.dumps(self.m))
  manifest={p.relative_to(self.source).as_posix():release.sha(p) for p in self.source.rglob('*') if p.is_file()}
  (self.source/'V72-INSTALL-MANIFEST.json').write_text(json.dumps({'sourceSha':'a'*40,'files':manifest}))
  self.saved={name:getattr(release,name) for name in ['API','WEB','CADDY','DB','BASE','run','response','wait_ready']}
  release.API=self.api/'current';release.WEB=self.web/'current';release.API.symlink_to(self.old_api);release.WEB.symlink_to(self.old_web)
  release.CADDY=self.root/'Caddyfile';release.CADDY.write_bytes(b'neighbor and unchanged own site')
  release.DB=self.root/'leads.sqlite'
  with sqlite3.connect(release.DB) as db:db.execute('CREATE TABLE leads(id TEXT)');db.execute("INSERT INTO leads VALUES ('existing-real-lead')")
  self.db_hash=release.sha(release.DB);release.BASE=self.root/'backups';release.BASE.mkdir();self.events=[]
  self.real_run=release.run
  def run(*args):
   self.events.append(args)
   if args[:2]==('systemctl','cat'):return 'ExecStart=/usr/bin/node /srv/services/garant-bani-relay/current/server/garant-bani-relay.mjs\nEnvironment=LEADS_DB_PATH=/var/lib/garant-bani-relay/leads.sqlite'
   if args[:2]==('systemctl','is-active'):return 'active'
   if args[0]=='/usr/bin/node':return self.real_run(shutil.which('node'),*args[1:])
   return ''
  release.run=run;release.wait_ready=lambda:self.events.append(('ready',))
  release.response=self.response
 def response(self,url,code=200,host=None):
  if code==401:return b'',{'X-Robots-Tag':'noindex'}
  if '/health' in url or 'bani-preview' in url:return b'',{}
  path=url.removeprefix(release.ORIGIN).lstrip('/')
  if path in ['manager.html','privacy.html','requisites.html']:return b'noindex',{'X-Robots-Tag':'noindex'}
  path=(path+'index.html') if not path or path.endswith('/') else path
  return (release.WEB.resolve()/path).read_bytes(),{}
 def tearDown(self):
  for name,val in self.saved.items():setattr(release,name,val)
  self.tmp.cleanup()
 def test_install_then_rollback_keeps_database_and_caddy(self):
  release.install(self.source,'a'*40)
  state=json.loads(next(release.BASE.glob('*/state.json')).read_text())
  self.assertEqual(str(release.API.resolve()),state['newApi']);self.assertEqual(str(release.WEB.resolve()),state['newWeb'])
  self.assertEqual(release.sha(release.DB),self.db_hash)
  release.rollback(state)
  self.assertEqual(release.API.resolve(),self.old_api);self.assertEqual(release.WEB.resolve(),self.old_web)
  self.assertEqual(release.sha(release.DB),self.db_hash);self.assertEqual(release.CADDY.read_bytes(),b'neighbor and unchanged own site')
  self.assertTrue(any(cmd[:2]==('systemctl','restart') for cmd in self.events))
 def test_changed_live_backend_stops_before_activation(self):
  (self.old_api/'server/garant-bani-relay.mjs').write_text('// external edit')
  with self.assertRaisesRegex(RuntimeError,'ACTIVE_FILE_CHANGED'):release.install(self.source,'a'*40)
  self.assertEqual(release.API.resolve(),self.old_api);self.assertEqual(release.WEB.resolve(),self.old_web)
  self.assertEqual(list(release.BASE.iterdir()),[])
 def test_http_failure_restores_both_releases_without_database_restore(self):
  real=self.response
  def fail(url,code=200,host=None):
   if url==release.ORIGIN+'/':raise RuntimeError('INJECTED_HTTPS_FAILURE')
   return real(url,code,host)
  release.response=fail
  with self.assertRaisesRegex(RuntimeError,'INJECTED_HTTPS_FAILURE'):release.install(self.source,'a'*40)
  self.assertEqual(release.API.resolve(),self.old_api);self.assertEqual(release.WEB.resolve(),self.old_web);self.assertEqual(release.sha(release.DB),self.db_hash)
 def test_rollback_refuses_competing_release(self):
  other=self.web/'external';other.mkdir();release.WEB.unlink();release.WEB.symlink_to(other)
  state={'oldApi':str(self.old_api),'newApi':str(self.api/'new'),'oldWeb':str(self.old_web),'newWeb':str(self.web/'new')}
  with self.assertRaisesRegex(RuntimeError,'ROLLBACK_WEB_CONCURRENT_CHANGE'):release.rollback(state)
if __name__=='__main__':unittest.main()

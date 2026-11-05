from pathlib import Path
import importlib.util,json,tempfile,unittest,sys,io,urllib.parse
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('seo_install',Path(__file__).with_name('install.py'));mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
FILES=['index.html','choice/app.mjs','choice/comparison.mjs','choice/packages.mjs','data/catalog-pricebook.json','data/r85-public-pricebook.json','choice/catalog-pricebook.json','sitemap.xml','robots.txt','llms.txt']
class Tests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='dp-seo-fixture-');self.addCleanup(self.temp.cleanup)
  self.r=Path(self.temp.name);self.site=self.r/'site';self.old=self.site/'releases/OLD';self.pkg=self.r/'package'
  self.old.mkdir(parents=True);(self.site/'current').symlink_to(self.old)
  before={};files={};self.pricefiles=[p for p in FILES if p.endswith('.json')]
  for p in FILES:
   old=self.old/p;new=self.pkg/'site'/p;old.parent.mkdir(parents=True,exist_ok=True);new.parent.mkdir(parents=True,exist_ok=True)
   old.write_text(json.dumps({'priceRub':410000,'preFinalComfortPriceRub':390000}) if p in self.pricefiles else 'old')
   new.write_text(json.dumps({'priceRub':410000}) if p in self.pricefiles else 'new')
   before[p]=mod.sha(old);files[p]=mod.sha(new)
  self.m={'baseline':str(self.old),'before':before,'files':files,'metadataOnlyPriceFiles':self.pricefiles};self.save()
 def save(self):(self.pkg/'manifest.json').write_text(json.dumps(self.m))
 def response(self,url,**kwargs):
  if '/health' in str(url):return io.BytesIO(b'{"ok":true}')
  p=urllib.parse.urlparse(str(url)).path.lstrip('/') or 'index.html'
  return io.BytesIO((self.pkg/'site'/p).read_bytes())
 def runmode(self,mode,fail=False):
  with patch.object(mod,'B',self.pkg),patch.object(mod,'SITE',self.site),patch.object(sys,'argv',['install.py',mode]),patch.object(mod.os,'geteuid',return_value=0),patch.object(mod.urllib.request,'urlopen',side_effect=RuntimeError('test failure') if fail else self.response):mod.main()
 def test_publish_and_rollback(self):
  before=mod.inventory(self.old);self.runmode('--apply');self.assertNotEqual((self.site/'current').resolve(),self.old)
  self.assertEqual(mod.inventory(self.old),before);self.runmode('--rollback');self.assertEqual((self.site/'current').resolve(),self.old)
 def test_automatic_rollback(self):
  with self.assertRaises(RuntimeError):self.runmode('--apply',True)
  self.assertEqual((self.site/'current').resolve(),self.old)
 def test_active_prices_cannot_change(self):
  p=self.pricefiles[0];(self.pkg/'site'/p).write_text('{"priceRub":390000}');self.m['files'][p]=mod.sha(self.pkg/'site'/p);self.save()
  with self.assertRaises(AssertionError):self.runmode('--check')
 def test_baseline_cannot_change(self):
  (self.old/'index.html').write_text('different')
  with self.assertRaises(AssertionError):self.runmode('--check')
 def test_scope_cannot_expand(self):
  self.m['files']['api/server.mjs']='bad';self.save()
  with self.assertRaises(AssertionError):self.runmode('--check')
if __name__=='__main__':unittest.main(verbosity=2)

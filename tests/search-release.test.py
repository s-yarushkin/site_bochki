"""Scoped Caddy/rollback checks, temporary files only. No server commands."""
import importlib.util,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
m=load('search_installer',ROOT/'ops/search-release-install.py')
old=load('domain_installer',ROOT/'ops/v72-domain-install.py')
class ScopedRelease(unittest.TestCase):
 def test_only_dacha_par_block_changes_and_robots_falls_through_to_static(self):
  block=old.caddy_block(m.WEB);before=b'# existing Caddy preamble\nother.example { respond "neighbor" }\n';after=b'\nanother.example { respond "second neighbor" }\n'
  result=m.candidate_config(before+block+after,block)
  self.assertTrue(result.startswith(before));self.assertTrue(result.endswith(after))
  self.assertNotIn(b'handle /robots.txt',result)
  self.assertIn(b'@noindex path /manager.html /api/* /health /privacy.html /consent.html /requisites.html',result)
  self.assertNotIn(b'    header X-Robots-Tag',result)
 def test_changed_or_duplicate_own_block_is_rejected(self):
  block=old.caddy_block(m.WEB)
  for data in [block.replace(b'3301',b'9999'),block+block,b'no marker']:
   with self.assertRaises(RuntimeError):m.candidate_config(data,block)
 def test_rollback_restores_old_indexing_controls_and_rejects_concurrent_route_edit(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);web=root/'current';oldweb=root/'old';new=root/'new';oldweb.mkdir();new.mkdir();web.symlink_to(new)
   config=root/'Caddyfile';config.write_bytes(b'candidate');backup=root/'backup';backup.mkdir();(backup/'Caddyfile').write_bytes(b'old-noindex')
   state={'baselineHash':m.sha(b'old-noindex'),'candidateHash':m.sha(b'candidate'),'backup':str(backup),'oldWeb':str(oldweb),'newWeb':str(new),'mode':0o644,'uid':config.stat().st_uid,'gid':config.stat().st_gid}
   with patch.multiple(m,WEB=web,CADDY=config),patch.object(m,'run',return_value=''):
    config.write_bytes(b'concurrent-change')
    with self.assertRaisesRegex(RuntimeError,'CONCURRENT_CHANGE'):m.rollback(state)
    self.assertEqual(web.resolve(),new);self.assertEqual(config.read_bytes(),b'concurrent-change')
    config.write_bytes(b'candidate');m.rollback(state)
    self.assertEqual(web.resolve(),oldweb);self.assertEqual(config.read_bytes(),b'old-noindex')
if __name__=='__main__':unittest.main()

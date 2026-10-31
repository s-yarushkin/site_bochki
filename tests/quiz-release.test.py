"""Offline test: reverse the repository's quiz changes, apply the release patch, compare byte-for-byte."""
import importlib.util,unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('quiz_remote',ROOT/'scripts/quiz-v1-remote.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class TestGuardedQuizRelease(unittest.TestCase):
 def test_web_patch_from_old_home(self):
  new=(ROOT/'web/index.html').read_text('utf8')
  self.assertEqual(new.count(module.CSS_INSERT),1)
  self.assertEqual(new.count(module.JS_INSERT),1)
  old=new.replace(module.CSS_INSERT,'').replace(module.JS_INSERT+'\n','')
  self.assertEqual(module.patch_site(old),new)
  with self.assertRaisesRegex(RuntimeError,'quiz already installed'):
   module.patch_site(new)
 def test_api_patch_matches_repository_with_no_unknown_rewrites(self):
  new=(ROOT/'api/server/garant-bani-relay.mjs').read_text('utf8')
  self.assertTrue(new.startswith(module.API_IMPORT+'\n'))
  old=new.removeprefix(module.API_IMPORT+'\n')
  for before,after in reversed(module.API_PATCHES):
   self.assertEqual(old.count(after),1,'expected exact patch anchor')
   old=old.replace(after,before)
  self.assertEqual(module.patch_api(old),new)
  with self.assertRaisesRegex(RuntimeError,'quiz API already present'):
   module.patch_api(new)
  with self.assertRaisesRegex(RuntimeError,'API contract drift'):
   module.patch_api(old.replace("if(value.purpose!==undefined&&!planInfo)","if(value.purpose!==undefined&&!planInfo&&!other)"))
 def test_no_path_traversal(self):
  for name in ['../secret','../../etc/passwd','/etc/passwd','foo/../secrets','C:/windows','foo\\bar']:
   with self.subTest(name=name),self.assertRaises(RuntimeError):
    module.guarded(Path('/tmp/quiz'),name)
 def test_protected_files_do_not_enter_overlay(self):
  b=(ROOT/'scripts/build-quiz-v1-release.py').read_text('utf8')
  self.assertIn("'web/data/quiz-v1.json'",b)
  self.assertIn("'api/server/quiz-channel-policy.mjs'",b)
  self.assertNotIn("'web/data/catalog-pricebook.json','",b)
  self.assertIn("'noPriceChange':True",b)
  self.assertIn("'noDatabaseMigration':True",b)
 def test_rollback_preserves_lead_database(self):
  code=(ROOT/'scripts/quiz-v1-remote.py').read_text('utf8')
  self.assertIn('QUIZ_ROLLED_BACK=PASS; lead database unchanged',code)
  self.assertNotIn('DB.unlink(',code)
  self.assertNotIn('shutil.copy2(backup',code)
if __name__=='__main__':unittest.main()

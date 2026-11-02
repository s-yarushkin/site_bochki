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
 def test_api_smoke_cannot_start_another_server(self):
  source=(ROOT/'scripts/quiz-v1-remote.py').read_text('utf8')
  self.assertIn("subprocess.run(['node','--input-type=module','-e',source],check=True)",source)
  self.assertNotIn("str(newapi/'server/garant-bani-relay.mjs')],check=True)",source)
  self.assertIn("module_url=(newapi/'server/garant-bani-relay.mjs').as_uri()",source)
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

class TestR109InviteRelease(unittest.TestCase):
 def test_mount_detection_accepts_real_release_versions(self):
  spec=importlib.util.spec_from_file_location('r109_remote',ROOT/'scripts/r109-quiz-invite-remote.py')
  r109=importlib.util.module_from_spec(spec);spec.loader.exec_module(r109)
  for css_version,js_version in [
    ('dpq-20261031','dpq-20261031'),
    ('r106','r107-invite35'),
    ('r108-ranges','r108-ranges'),
    ('r109-preview','r109-preview'),
  ]:
   with self.subTest(css=css_version,js=js_version):
    html='<html><head><link href="/quiz.css?v='+css_version+'" rel="stylesheet"></head><body><script type="module" src="/quiz.mjs?v='+js_version+'"></script></body></html>'
    refs=r109.locate_quiz_assets(html)
    self.assertEqual(refs,{'quiz.css':'/quiz.css?v='+css_version,'quiz.mjs':'/quiz.mjs?v='+js_version})
    updated=r109.prepare_html(html,refs)
    self.assertEqual(updated.count('quiz.css?v='+r109.VERSION),1)
    self.assertEqual(updated.count('quiz.mjs?v='+r109.VERSION),1)
    self.assertIn('<html><head>',updated)
 def test_mount_detection_refuses_ambiguous_or_missing_quiz_links(self):
  spec=importlib.util.spec_from_file_location('r109_remote',ROOT/'scripts/r109-quiz-invite-remote.py')
  r109=importlib.util.module_from_spec(spec);spec.loader.exec_module(r109)
  html='<link href="/quiz.css?v=r106"><script src="/quiz.mjs?v=r107-invite35"></script>'
  for damaged in [html.replace('<link','<link href="/quiz.css?v=r105" rel="stylesheet"><link',1),
                  html.replace('<script src="/quiz.mjs?v=r107-invite35"></script>',''),
                  html.replace('/quiz.css?v=r106','/unrelated.css')]:
   with self.subTest(damaged=damaged),self.assertRaisesRegex(RuntimeError,'R109_INVITE_STOP'):
    r109.locate_quiz_assets(damaged)


class TestR110ResultsRelease(unittest.TestCase):
 def test_r110_pins_current_r109_web_and_preserves_api(self):
  spec=importlib.util.spec_from_file_location('r110_remote',ROOT/'scripts/r110-quiz-results-remote.py')
  r110=importlib.util.module_from_spec(spec);spec.loader.exec_module(r110)
  self.assertEqual(r110.EXPECTED_ACTIVE,'DPQUIZ-r109-invite-a01e6016ce53')
  self.assertTrue(r110.NEW_NAME.startswith('DPQUIZ-r110-leads-'))
  self.assertEqual(set(r110.NEW_BLOBS),{'quiz.mjs','quiz.css'})
  self.assertEqual(r110.OLD_BLOBS['quiz.mjs'],'a01e6016ca0feabf763f3b8443b7dfa358077d84')
  self.assertEqual(r110.OLD_BLOBS['quiz.css'],'ce5309287a86123b672d8f552d41939c146bc18b')
  self.assertNotEqual(r110.NEW_BLOBS['quiz.mjs'],r110.OLD_BLOBS['quiz.mjs'])
  self.assertNotEqual(r110.NEW_BLOBS['quiz.css'],r110.OLD_BLOBS['quiz.css'])
  # R110 is already deployed; the current working tree intentionally contains R111 JS.
  self.assertEqual(r110.NEW_BLOBS['quiz.mjs'],'ce74814ab0f64921438def055ba518d70818d9a9')
  self.assertEqual(r110.git_sha((ROOT/'web/quiz.css').read_bytes()),r110.NEW_BLOBS['quiz.css'])
  self.assertEqual(r110.locate_quiz_assets('<link href="/quiz.css?v=r109-invite-a01e6016"><script src="/quiz.mjs?v=r109-invite-a01e6016"></script>'),{
    'quiz.css':'/quiz.css?v=r109-invite-a01e6016','quiz.mjs':'/quiz.mjs?v=r109-invite-a01e6016'})
  patched=r110.prepare_html('<link href="/quiz.css?v=r109-invite-a01e6016"><script src="/quiz.mjs?v=r109-invite-a01e6016"></script>',{
    'quiz.css':'/quiz.css?v=r109-invite-a01e6016','quiz.mjs':'/quiz.mjs?v=r109-invite-a01e6016'})
  self.assertIn('/quiz.css?v='+r110.VERSION,patched)
  self.assertIn('/quiz.mjs?v='+r110.VERSION,patched)
  source=(ROOT/'scripts/r110-quiz-results-remote.py').read_text('utf8')
  self.assertNotIn('published quiz plan image missing',source)
  self.assertNotIn('asset = active / picture.lstrip',source)
  self.assertIn('API_SQLITE=UNTOUCHED',source)
  self.assertNotIn('sqlite3.connect',source)
  self.assertNotIn('systemctl',source)


class TestR111TwoTriggers(unittest.TestCase):
 def test_r111_script_pins_deployed_r110_and_updates_only_js(self):
  spec=importlib.util.spec_from_file_location('r111_remote',ROOT/'scripts/r111-quiz-invite-remote.py')
  r111=importlib.util.module_from_spec(spec);spec.loader.exec_module(r111)
  self.assertEqual(r111.EXPECTED_ACTIVE,'DPQUIZ-r110-leads-ce74814af648068e')
  self.assertTrue(r111.NEW_NAME.startswith('DPQUIZ-r111-trigger-'))
  self.assertEqual(r111.OLD_BLOBS['quiz.mjs'],'ce74814ab0f64921438def055ba518d70818d9a9')
  self.assertEqual(r111.OLD_BLOBS['quiz.css'],'f648068eb247dedf25310e39625c51f080b41663')
  self.assertEqual(set(r111.NEW_BLOBS),{'quiz.mjs'})
  self.assertEqual(set(r111.HTML_ASSETS),{'quiz.mjs'})
  # R111 is live; the working tree now holds the R112 correction.
  self.assertEqual(r111.NEW_BLOBS['quiz.mjs'],'66bfa02ba88eb299cc676375d2e51da369cebb4c')
  page='<link href="/quiz.css?v=r110-leads-ce74814a"><script type="module" src="/quiz.mjs?v=r110-leads-ce74814a"></script>'
  refs=r111.locate_quiz_assets(page)
  changed=r111.prepare_html(page,refs)
  self.assertIn('/quiz.css?v=r110-leads-ce74814a',changed,'CSS version must remain unchanged')
  self.assertIn('/quiz.mjs?v='+r111.VERSION,changed)
  self.assertNotIn('/quiz.mjs?v=r110-leads-ce74814a',changed)
  source=(ROOT/'scripts/r111-quiz-invite-remote.py').read_text('utf8')
  for key in ['R111_TRIGGER_PREFLIGHT','R111_TRIGGER_DEPLOY','API_SQLITE=UNTOUCHED','modelsIdleMs=18000','models-idle','your-bath']:
   self.assertIn(key,source)
  self.assertNotIn('sqlite3.connect',source)
  self.assertNotIn('systemctl',source)


class TestR112CalculatorTrigger(unittest.TestCase):
 def test_r112_is_guarded_single_file_update_over_live_r111(self):
  spec=importlib.util.spec_from_file_location('r112_remote',ROOT/'scripts/r112-quiz-trigger-remote.py')
  r112=importlib.util.module_from_spec(spec);spec.loader.exec_module(r112)
  self.assertEqual(r112.EXPECTED_ACTIVE,'DPQUIZ-r111-trigger-66bfa02b')
  self.assertTrue(r112.NEW_NAME.startswith('DPQUIZ-r112-trigger-'))
  self.assertEqual(r112.OLD_BLOBS['quiz.mjs'],'66bfa02ba88eb299cc676375d2e51da369cebb4c')
  self.assertEqual(r112.OLD_BLOBS['quiz.css'],'f648068eb247dedf25310e39625c51f080b41663')
  self.assertEqual(set(r112.NEW_BLOBS),{'quiz.mjs'})
  self.assertEqual(set(r112.HTML_ASSETS),{'quiz.mjs'})
  content=(ROOT/'web/quiz.mjs').read_bytes()
  self.assertEqual(r112.git_sha(content),r112.NEW_BLOBS['quiz.mjs'])
  source=content.decode('utf8')
  self.assertIn('const ritualInView=()=>',source)
  self.assertIn('const canInvite=(reason)=>',source)
  self.assertNotIn('!location.hash',source)
  self.assertNotIn('r.bottom>0;',source)
  self.assertIn('handleScroll();',source)
  home='<link href="/quiz.css?v=r110-leads-ce74814a"><script type="module" src="/quiz.mjs?v=r111-trigger-66bfa02b"></script>'
  changed=r112.prepare_html(home,r112.locate_quiz_assets(home))
  self.assertIn('/quiz.css?v=r110-leads-ce74814a',changed)
  self.assertIn('/quiz.mjs?v='+r112.VERSION,changed)
  self.assertNotIn('/quiz.mjs?v=r111-trigger-66bfa02b',changed)
  installer=(ROOT/'scripts/r112-quiz-trigger-remote.py').read_text('utf8')
  for key in ['R112_TRIGGER_PREFLIGHT','R112_TRIGGER_DEPLOY','API_SQLITE=UNTOUCHED','models-idle','your-bath']:
   self.assertIn(key,installer)
  self.assertNotIn('sqlite3.connect',installer)
  self.assertNotIn('systemctl',installer)

if __name__=='__main__':unittest.main()

"""ADS01 installer tests, local-only: no sudo, no network, no MAX, no production."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('ads01_fast',ROOT/'ops/ads01-fast-install.py')
r=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

class Ads01FastReleaseTests(unittest.TestCase):
    def test_new_source_is_j_not_h_and_webvisor_off(self):
        data=json.loads((ROOT/'data/catalog-pricebook.json').read_text(encoding='utf8'))
        self.assertEqual(data['priceSource']['column'],'J')
        cfg=(ROOT/'assets/js/analytics-config.js').read_text(encoding='utf8')
        self.assertIn('113675581',cfg)
        self.assertIn('ADS01_WEBVISOR_ENABLED = false',cfg)
        app=(ROOT/'assets/js/analytics.js').read_text(encoding='utf8')
        self.assertNotIn('displayConsent',app)
        self.assertNotIn('consentSettings',app)
        self.assertNotIn('dp_analytics_consent_v1',app)
        self.assertEqual(len(r.PAGES),8)
        self.assertTrue((ROOT/'ops/ads01-fast-release.ps1').exists())
        self.assertEqual(len(r.ACTIVE_HASHES),4)

    def test_overlay_is_exact_and_does_not_mutate_active_hardlinks(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            old=root/'old'
            src=root/'source'
            new=root/'new'
            old.mkdir();src.mkdir()
            for target in (old,src):
                (target/'nested').mkdir()
            (old/'nested'/'updated.txt').write_text('OLD')
            (old/'nested'/'preserved.txt').write_text('KEEP')
            (src/'nested'/'updated.txt').write_text('NEW')
            r.stage(old,new,src,('nested/updated.txt',))
            self.assertEqual((new/'nested'/'updated.txt').read_text(),'NEW')
            self.assertEqual((old/'nested'/'updated.txt').read_text(),'OLD')
            self.assertEqual((new/'nested'/'preserved.txt').read_text(),'KEEP')
            self.assertEqual((old/'nested'/'preserved.txt').read_text(),'KEEP')

    def test_stage_rejects_symlink_in_existing_release(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);old=root/'old';src=root/'source';new=root/'new'
            old.mkdir();src.mkdir()
            (old/'real.txt').write_text('old')
            (old/'link.txt').symlink_to('real.txt')
            (src/'real.txt').write_text('new')
            with self.assertRaisesRegex(RuntimeError,'SYMLINK'):
                r.stage(old,new,src,('real.txt',))
            self.assertFalse(new.exists())

    def test_rollback_switches_only_web_and_api_and_preserves_db(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            web_parent=root/'web';api_parent=root/'api'
            for base in [web_parent,api_parent]:
                (base/'releases').mkdir(parents=True)
            old_web,new_web=[web_parent/'releases'/x for x in ('old','new')]
            old_api,new_api=[api_parent/'releases'/x for x in ('old','new')]
            for p in (old_web,new_web,old_api,new_api):p.mkdir()
            w=web_parent/'current';a=api_parent/'current'
            w.symlink_to(new_web);a.symlink_to(new_api)
            db=root/'leads.sqlite';db.write_bytes(b'UNCHANGED')
            state={'oldWeb':str(old_web),'newWeb':str(new_web),'oldApi':str(old_api),'newApi':str(new_api)}
            with patch.object(r,'WEB',w),patch.object(r,'API',a),patch.object(r,'DB',db),patch.object(r,'run',return_value=''),patch.object(r,'health'):
                r.rollback(state)
            self.assertEqual(w.resolve(),old_web)
            self.assertEqual(a.resolve(),old_api)
            self.assertEqual(db.read_bytes(),b'UNCHANGED')

    def test_safety_contract_is_intentionally_no_sqlite_snapshot(self):
        code=(ROOT/'ops/ads01-fast-install.py').read_text('utf8')
        self.assertNotIn('sqlite3.connect',code)
        self.assertNotIn('shutil.copyfile(DB',code)
        self.assertNotIn('unlink(DB',code)
        self.assertIn('DB.is_file()',code)
        self.assertIn('ACTIVE_HASHES',code)
        self.assertIn('ADS01_ROLLBACK=PASS',code)

if __name__=='__main__':
    unittest.main()

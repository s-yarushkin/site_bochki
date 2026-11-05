"""Linux fixtures only; exercises the installer without touching the live site."""
from pathlib import Path
import importlib.util,json,tempfile,unittest
from unittest.mock import patch

installer=Path(__file__).with_name('install_release.py')
if not installer.exists():installer=Path(__file__).with_name('install.py')
spec=importlib.util.spec_from_file_location('bc_installer',installer)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

class InstallTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='dachapar-bc-fixture-');self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.site=self.root/'site';self.old=self.site/'releases/OLD';self.old.mkdir(parents=True)
        (self.old/'data').mkdir();(self.old/'index.html').write_text('old')
        (self.old/'quiz.mjs').write_text('protected quiz')
        (self.old/'data/site-settings.json').write_text(json.dumps({'lead':{'enabled':True,'endpoint':'/api/lead','allowedOrigins':[mod.ORIGIN]}}))
        (self.site/'current').symlink_to(self.old)
        self.package=self.root/'package';(self.package/'site/choice').mkdir(parents=True)
        (self.package/'site/index.html').write_text('new')
        for n in range(19):(self.package/f'site/choice/{n}.glb').write_bytes(b'glTF fixture')
        self.manifest={'baseline':str(self.old),'geometryCount':19,'overlay':mod.inventory(self.package/'site'),
          'prerequisites':{'index.html':mod.sha(self.old/'index.html'),'quiz.mjs':mod.sha(self.old/'quiz.mjs')}}
        self.save();self.before=mod.inventory(self.old)
    def save(self):(self.package/'manifest.json').write_text(json.dumps(self.manifest))
    def app(self):return mod.Installer(self.package,self.site)
    def test_publish_and_full_rollback(self):
        app=self.app()
        with patch.object(app,'public_verify'):app.apply()
        self.assertEqual(app.current(),app.target);self.assertEqual(mod.inventory(self.old),self.before)
        self.assertEqual((app.target/'quiz.mjs').read_text(),'protected quiz')
        app.rollback();self.assertEqual(app.current(),self.old)
    def test_failed_postcheck_restores_old_release(self):
        app=self.app()
        with patch.object(app,'public_verify',side_effect=RuntimeError('fixture failure')):
            with self.assertRaises(RuntimeError):app.apply()
        self.assertEqual(app.current(),self.old);self.assertEqual(mod.inventory(self.old),self.before)
        self.assertEqual(json.loads(app.state.read_text())['phase'],'automatic_rollback')
    def test_changed_baseline_is_rejected(self):
        (self.old/'quiz.mjs').write_text('changed')
        with self.assertRaises(AssertionError):self.app().apply()
        self.assertEqual((self.site/'current').resolve(),self.old)
    def test_changed_overlay_is_rejected(self):
        (self.package/'site/index.html').write_text('different')
        with self.assertRaises(AssertionError):self.app().apply()
        self.assertEqual((self.site/'current').resolve(),self.old)
    def test_unsafe_scope_is_rejected(self):
        self.manifest['overlay']['data/site-settings.json']='bad';self.save()
        with self.assertRaises(AssertionError):self.app()
    def test_changed_previous_cannot_be_rolled_back(self):
        app=self.app()
        with patch.object(app,'public_verify'):app.apply()
        (self.old/'quiz.mjs').write_text('changed')
        with self.assertRaises(AssertionError):app.rollback()
        self.assertEqual(app.current(),app.target)

if __name__=='__main__':unittest.main(verbosity=2)

"""Exercise installer on disposable releases, without SSH, sudo or network."""
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('new_year_remote', ROOT / 'scripts/new-year-remote.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class ReleaseTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.releases = root / 'releases'
        self.old = self.releases / 'R105-existing'
        self.old.mkdir(parents=True)
        self.current = self.old
        self.here = root / 'handoff'
        self.here.mkdir()
        self.backups = root / 'backups'
        for name in [*deploy.SHARED, 'index.html', 'manager.html', 'journal/index.html']:
            target = self.old / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('existing: ' + name, encoding='utf-8')
        self.files = {'novyy-god/' + name: ('new: ' + name).encode() for name in deploy.ROUTE_FILES}
        self.pack()
        for name, value in {'HERE': self.here, 'RELEASES': self.releases, 'BACKUPS': self.backups,
                            'active': lambda: self.current, 'switch': self.switch}.items():
            mock = patch.object(deploy, name, value)
            mock.start()
            self.addCleanup(mock.stop)
        for target in ['health', 'public_check']:
            mock = patch.object(deploy, target)
            mock.start()
            self.addCleanup(mock.stop)
        for name, options in [('geteuid', {'return_value': 0}), ('chown', {})]:
            mock = patch.object(deploy.os, name, create=True, **options)
            mock.start()
            self.addCleanup(mock.stop)

    def switch(self, target):
        self.assertEqual(target.parent, self.releases)
        self.current = target

    def pack(self):
        with zipfile.ZipFile(self.here / 'payload.zip', 'w') as archive:
            for name, data in self.files.items():
                archive.writestr(name, data)
        manifest = {'route': '/novyy-god/', 'apiChanged': False,
                    'sharedProductionModules': ['/' + name for name in deploy.SHARED],
                    'payloadSha256': deploy.sha((self.here / 'payload.zip').read_bytes()),
                    'files': [{'path': name, 'bytes': len(data), 'sha256': deploy.sha(data)}
                              for name, data in self.files.items()]}
        (self.here / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')

    def test_check_does_not_change_current_or_original_files(self):
        before = deploy.inventory(self.old)
        deploy.check()
        self.assertEqual(self.current, self.old)
        self.assertEqual(deploy.inventory(self.old), before)
        self.assertTrue((self.here / 'check-state.json').is_file())

    def test_apply_keeps_every_existing_file_and_rollback_returns_original(self):
        before = deploy.inventory(self.old)
        deploy.check()
        deploy.apply()
        new = self.current
        self.assertNotEqual(new, self.old)
        self.assertEqual(deploy.inventory(self.old), before)
        expected = {**before, **{name: deploy.sha(data) for name, data in self.files.items()}}
        self.assertEqual(deploy.inventory(new), expected)
        deploy.rollback(self.backups / new.name / 'state.json')
        self.assertEqual(self.current, self.old)
        self.assertEqual(deploy.inventory(self.old), before)

    def test_changed_baseline_stops_apply_before_switch(self):
        deploy.check()
        (self.old / 'index.html').write_text('another release', encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'baseline changed'):
            deploy.apply()
        self.assertEqual(self.current, self.old)
        self.assertEqual(len(list(self.releases.iterdir())), 1)

    def test_existing_route_is_never_overwritten(self):
        (self.old / 'novyy-god').mkdir()
        with self.assertRaisesRegex(RuntimeError, 'route already exists'):
            deploy.check()

    def test_missing_shared_module_stops_check(self):
        (self.old / 'lead-client.mjs').unlink()
        with self.assertRaisesRegex(RuntimeError, 'shared modules missing'):
            deploy.check()

    def test_payload_cannot_write_outside_fixed_route_allowlist(self):
        self.files['../index.html'] = b'overwrite'
        self.pack()
        with self.assertRaisesRegex(RuntimeError, 'unexpected route files'):
            deploy.check()
        self.assertEqual((self.old / 'index.html').read_text(), 'existing: index.html')

    def test_corrupted_zip_is_rejected_before_changes(self):
        with (self.here / 'payload.zip').open('ab') as archive:
            archive.write(b'changed')
        with self.assertRaisesRegex(RuntimeError, 'payload hash'):
            deploy.check()

    def test_public_failure_automatically_restores_previous_release(self):
        deploy.check()
        with patch.object(deploy, 'public_check', side_effect=RuntimeError('network failure')):
            with self.assertRaisesRegex(RuntimeError, 'network failure'):
                deploy.apply()
        self.assertEqual(self.current, self.old)
        self.assertFalse((self.old / 'novyy-god').exists())

    def test_rollback_stops_if_another_release_is_active(self):
        deploy.check()
        deploy.apply()
        state = self.backups / self.current.name / 'state.json'
        self.current = self.releases / 'another-release'
        self.current.mkdir()
        with self.assertRaisesRegex(RuntimeError, 'another release is active'):
            deploy.rollback(state)


if __name__ == '__main__':
    unittest.main()

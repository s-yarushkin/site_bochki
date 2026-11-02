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
        for name in [*deploy.SHARED, 'quiz.mjs', 'quiz.css', 'index.html', 'manager.html', 'journal/index.html']:
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

    def test_overlay_preserves_latest_live_quiz_and_metrika_files(self):
        # The current public site is R117; main lacks these newer quiz events.
        # Overlay installation must retain active bytes, never restore main copies.
        self.old.joinpath('quiz.mjs').write_text('LIVE R117 QUIZ', encoding='utf-8')
        self.old.joinpath('analytics-core.mjs').write_text('LIVE R117 METRIKA', encoding='utf-8')
        before = {name: (self.old / name).read_bytes() for name in
                  ['quiz.mjs', 'quiz.css', 'analytics-core.mjs', 'index.html',
                   'data/catalog-pricebook.json', 'lead-client.mjs']}
        self.assertFalse((self.old / 'novyy-god').exists())
        deploy.check()
        deploy.apply()
        current = self.current
        for name, data in before.items():
            self.assertEqual((current / name).read_bytes(), data, name)
        self.assertTrue((current / 'novyy-god/index.html').exists())
        self.assertEqual(deploy.active(), current)

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

    def install_r5_fixture(self):
        approved = self.releases / deploy.R51_OLD_RELEASE
        self.old.rename(approved)
        self.old = approved
        self.current = approved
        # R5 is already live: all 28 holiday files, including frozen quiz assets.
        for name, data in self.files.items():
            p = self.old / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
        (self.old / 'novyy-god/index.html').write_text(
            '<html><link href="style.css?v=ny2027-r5">'
            '<link href="holiday-quiz.css?v=ny2027-r5">'
            '<a href="/consent.html">Согласие</a>'
            '<div class="dialog-story"></div>'
            '<script src="holiday-quiz.mjs?v=ny2027-r5"></script></html>',
            encoding='utf-8')
        (self.old / 'novyy-god/style.css').write_text(
            '/* NY2027 R5 — winter quiz */'
            '.dp-ny-quiz-invite .dp-quiz-invite-stages{color:#f8e1bd}',
            encoding='utf-8')
        self.files['novyy-god/index.html'] = (
            '<html><link href="style.css?v=ny2027-r51-contrast">'
            '<link href="holiday-quiz.css?v=ny2027-r5">'
            '<a href="/consent.html">Согласие</a>'
            '<div class="dialog-story"></div>'
            '<script src="holiday-quiz.mjs?v=ny2027-r5"></script></html>'
        ).encode('utf-8')
        self.files['novyy-god/style.css'] = (
            '/* NY2027 R5 — winter quiz */'
            '.dp-ny-quiz-invite .dp-quiz-invite-stages{color:#f8e1bd}'
            '/* NY2027 R5.1 CONTRAST */'
            'dialog.dp-ny-quiz-invite .dp-quiz-invite-stages span{color:#fff5e4;background:#234b3e}'
            'dialog.dp-ny-quiz-invite .dp-quiz-invite-close{color:#193a2e;background:#fff8ea}'
        ).encode('utf-8')
        for name in deploy.R117_GIT_BLOBS:
            self.files[name] = (ROOT / 'concepts/new-year-2027'
                                / name.removeprefix('novyy-god/')).read_bytes()
            (self.old / name).write_bytes(self.files[name])
        # The holiday quiz itself and its attribution remain unchanged.
        self.files['novyy-god/holiday-quiz.mjs'] = (
            b'/* original R5 */ Source: ' + 'Источник: квиз новый год'.encode('utf-8')
        )
        (self.old / 'novyy-god/holiday-quiz.mjs').write_bytes(
            self.files['novyy-god/holiday-quiz.mjs'])
        self.pack()

    def test_r51_upgrades_only_html_css_without_touching_r117_or_quiz(self):
        self.install_r5_fixture()
        (self.old / 'quiz.mjs').write_text('R117 unchanged')
        (self.old / 'analytics-core.mjs').write_text('R117 Metrika unchanged')
        before = deploy.inventory(self.old)
        deploy.check()
        self.assertEqual(self.current, self.old)
        deploy.apply()
        after = deploy.inventory(self.current)
        changed = {name for name in after if before.get(name) != after[name]}
        self.assertEqual(changed, deploy.R51_EDITABLE)
        for name in ['quiz.mjs', 'analytics-core.mjs',
                     'novyy-god/holiday-quiz.mjs', 'novyy-god/holiday-quiz-engine.mjs',
                     'novyy-god/holiday-quiz-data.json','novyy-god/holiday-quiz.css',
                     'index.html','data/catalog-pricebook.json']:
            self.assertEqual(after[name],before[name],name)
        state = self.backups / self.current.name / 'state.json'
        deploy.rollback(state)
        self.assertEqual(deploy.inventory(self.current),before)

    def test_r51_rejects_unknown_release_or_changed_route_asset(self):
        self.install_r5_fixture()
        (self.old / 'novyy-god/holiday-quiz.css').write_bytes(b'altered')
        with self.assertRaisesRegex(RuntimeError, 'immutable holiday asset drift'):
            deploy.check()
        self.old.rename(self.releases / 'NY2027-unapproved-release')
        self.old = self.releases / 'NY2027-unapproved-release'
        self.current = self.old
        with self.assertRaisesRegex(RuntimeError, 'route already exists outside approved'):
            deploy.check()

    def test_r51_rejects_drifted_previous_css_or_unknown_files(self):
        self.install_r5_fixture()
        (self.old / 'novyy-god/style.css').write_text('unrecognized CSS')
        with self.assertRaisesRegex(RuntimeError, 'unexpected previous R5 quiz colors'):
            deploy.check()
        (self.old / 'novyy-god/style.css').write_text(
            '/* NY2027 R5 — winter quiz */'
            '.dp-ny-quiz-invite .dp-quiz-invite-stages{color:#f8e1bd}')
        (self.old / 'novyy-god/extra.js').write_text('unexpected')
        with self.assertRaisesRegex(RuntimeError, 'unexpected files inside existing'):
            deploy.check()

    def test_r51_rejects_missing_color_contrast_or_stale_css_version(self):
        self.install_r5_fixture()
        self.files['novyy-god/style.css'] = self.files['novyy-god/style.css'].replace(
            b'background:#234b3e',b'background:#fafafa')
        self.pack()
        with self.assertRaisesRegex(RuntimeError, 'R5.1 high-contrast'):
            deploy.check()
        self.files['novyy-god/style.css'] = self.files['novyy-god/style.css'].replace(
            b'background:#fafafa',b'background:#234b3e')
        self.files['novyy-god/index.html'] = self.files['novyy-god/index.html'].replace(
            b'style.css?v=ny2027-r51-contrast',b'style.css?v=ny2027-r5')
        self.pack()
        with self.assertRaisesRegex(RuntimeError, 'R5.1 CSS cache'):
            deploy.check()

    def test_r51_auto_rolls_back_after_public_mismatch(self):
        self.install_r5_fixture()
        before = deploy.inventory(self.old)
        deploy.check()
        with patch.object(deploy,'public_check',side_effect=RuntimeError('public CSS mismatch')):
            with self.assertRaisesRegex(RuntimeError,'public CSS mismatch'):
                deploy.apply()
        self.assertEqual(self.current,self.old)
        self.assertEqual(deploy.inventory(self.current),before)

    def test_r51_stops_if_r117_changes_after_check(self):
        self.install_r5_fixture()
        deploy.check()
        (self.old/'analytics-core.mjs').write_text('another release')
        with self.assertRaisesRegex(RuntimeError,'baseline changed'):
            deploy.apply()
        self.assertEqual(self.current,self.old)

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

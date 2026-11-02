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

    def install_r4_route_fixture(self):
        approved = self.releases / deploy.R5_OLD_RELEASE
        self.old.rename(approved)
        self.old = approved
        self.current = approved
        for name, data in self.files.items():
            if name in deploy.R5_NEW:
                continue
            p = self.old / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
        (self.old / 'novyy-god/index.html').write_text(
            '<html><link href="style.css?v=ny2027-r4"><h2>Пришлём подходящие варианты, цены и комплектации</h2>'
            '<p id="delivery-geography-title">География</p><div class="dialog-story"></div></html>', encoding='utf-8')
        (self.old / 'novyy-god/style.css').write_text(
            '/* NY2027 R4 */ #lead-dialog{max-width:1280px;}', encoding='utf-8')
        self.files['novyy-god/index.html'] = (
            '<html><link href="style.css?v=ny2027-r5"><link href="holiday-quiz.css?v=ny2027-r5">'
            '<h2>Пришлём подходящие варианты, цены и комплектации</h2>'
            '<a href="/consent.html">Согласие на обработку</a>'
            '<a href="/privacy.html">Политика обработки данных</a>'
            '<p id="delivery-geography-title">Регионы</p>'
            '<div class="dialog-story"></div><script src="holiday-quiz.mjs?v=ny2027-r5"></script></html>'
        ).encode('utf-8')
        self.files['novyy-god/style.css'] = b'/* NY2027 R5 */ #lead-dialog{max-width:1280px;}'
        self.files['novyy-god/lead.mjs'] = b"import {callbackAvailable} from '/lead-client.mjs'; campaignInquiry(values,crypto.randomUUID());"
        self.files['novyy-god/holiday-quiz.mjs'] = (
            "const question=[['p2','1–2 человека'],['p4','До 4 человек'],"
            "['p6','5–6 человек'],['p8','До 8 человек'],"
            "title:'Нужна отдельная помывочная?',"
            "title:'Нужно место, чтобы остаться на ночь?'];"
            "let visibleRemainingMs=8000; const source='Источник: квиз новый год';"
            "const context={pagePath:'/novyy-god/'};"
            "const answer=()=>recommendModelRanges();"
            "const key='dp_ny2027_quiz_invite_seen_session';"
        ).encode('utf-8')
        for rel in ['holiday-quiz.mjs','holiday-quiz-engine.mjs','holiday-quiz-data.json','holiday-quiz.css']:
            self.files['novyy-god/'+rel] = (ROOT/'concepts/new-year-2027'/rel).read_bytes()
        self.pack()

    def test_r5_upgrade_preserves_live_r117_and_old_route_assets(self):
        self.install_r4_route_fixture()
        for name, data in [('quiz.mjs', 'R117 live quiz'),
                           ('analytics-core.mjs', 'R117 live Metrika')]:
            (self.old / name).write_text(data, encoding='utf-8')
        before = deploy.inventory(self.old)
        deploy.check()
        self.assertEqual(self.current, self.old)
        deploy.apply()
        after = deploy.inventory(self.current)
        diff = {name for name, hashed in after.items() if before.get(name) != hashed}
        self.assertEqual(diff, deploy.R5_EDITABLE)
        self.assertEqual((self.current / 'quiz.mjs').read_text(), 'R117 live quiz')
        self.assertEqual((self.current / 'analytics-core.mjs').read_text(), 'R117 live Metrika')
        for unchanged in ['index.html','data/catalog-pricebook.json',
                          'novyy-god/assets/winter-sauna-640.webp','novyy-god/lead-contract.mjs']:
            self.assertEqual(after[unchanged],before[unchanged])
        state = self.backups / self.current.name / 'state.json'
        deploy.rollback(state)
        self.assertEqual(deploy.inventory(self.current), before)

    def test_r5_upgrade_rejects_other_active_release_or_route_asset_drift(self):
        self.install_r4_route_fixture()
        (self.old / 'novyy-god/assets/winter-sauna-640.webp').write_bytes(b'altered')
        with self.assertRaisesRegex(RuntimeError, 'immutable holiday asset drift'):
            deploy.check()
        self.old.rename(self.releases / 'NY2027-unapproved-release')
        self.old = self.releases / 'NY2027-unapproved-release'
        self.current = self.old
        with self.assertRaisesRegex(RuntimeError, 'route already exists outside approved'):
            deploy.check()

    def test_r5_upgrade_rejects_unapproved_route_changes_and_unexpected_files(self):
        self.install_r4_route_fixture()
        (self.old / 'novyy-god/index.html').write_text('unrecognized page',encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'unexpected previous R4 holiday page'):
            deploy.check()
        (self.old / 'novyy-god/index.html').write_text(
            '<link href="style.css?v=ny2027-r4"><p id="delivery-geography-title">Футер</p>'
            '<div class="dialog-story"></div>',encoding='utf-8')
        (self.old / 'novyy-god/extra.js').write_text('unexpected',encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'unexpected files inside existing'):
            deploy.check()

    def test_r5_upgrade_rejects_missing_consent_or_wrong_quiz_source(self):
        self.install_r4_route_fixture()
        self.files['novyy-god/index.html'] = self.files['novyy-god/index.html'].replace(b'/consent.html',b'/lost.html')
        self.pack()
        with self.assertRaisesRegex(RuntimeError, 'missing consent'):
            deploy.check()
        self.files['novyy-god/index.html'] = self.files['novyy-god/index.html'].replace(b'/lost.html',b'/consent.html')
        self.files['novyy-god/holiday-quiz.mjs'] = self.files['novyy-god/holiday-quiz.mjs'].replace(
            b'8000',b'9000'
        )
        self.pack()
        with self.assertRaisesRegex(RuntimeError, 'eight-second NY quiz'):
            deploy.check()

    def test_r5_upgrade_rolls_back_after_public_failure(self):
        self.install_r4_route_fixture()
        before=deploy.inventory(self.old)
        deploy.check()
        with patch.object(deploy,'public_check',side_effect=RuntimeError('public JS mismatch')):
            with self.assertRaisesRegex(RuntimeError,'public JS mismatch'):
                deploy.apply()
        self.assertEqual(self.current,self.old)
        self.assertEqual(deploy.inventory(self.current),before)

    def test_r5_upgrade_check_invalidated_when_r117_changes(self):
        self.install_r4_route_fixture()
        deploy.check()
        (self.old/'analytics-core.mjs').write_text('another deployment',encoding='utf-8')
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

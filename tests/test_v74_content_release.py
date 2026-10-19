"""Release safety: preserve live content, image scope, rollback and real backup restore."""
import importlib.util
import contextlib
import os
import json
import sqlite3
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('v74_install', ROOT/'ops/v74-content-install.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ContentRelease(unittest.TestCase):
    def test_home_preserves_live_builder_social_legal_and_contact(self):
        source = (ROOT/'index.html').read_text('utf-8')
        builder = '<section class="builder-section section" id="builder"><input data-existing="live-control"><strong id="quoteTotal">500 955 ₽</strong></section>'
        active = '<html><head><meta property="og:image" content="LIVE_SOCIAL"></head><body><main><p>OLD_COPY</p>'+builder+'</main><footer>LIVE_LEGAL</footer><dialog class="contact-dialog" id="contactDialog">LIVE_CONTACT</dialog></body></html>'
        result = release.patch_home(active, source)
        self.assertEqual(release.section(result, 'builder-section section'), builder.replace('500 955', '505 000'))
        self.assertIn('content="LIVE_SOCIAL"', result)
        self.assertIn('<footer>LIVE_LEGAL</footer>', result)
        self.assertIn('>LIVE_CONTACT</dialog>', result)
        self.assertEqual(result.count('id="baseDialog"'), 1)
        self.assertIn('href="assets/css/v74-hero.css"', result)
        self.assertIn('href="assets/css/v74-content.css"', result)
        self.assertNotIn('OLD_COPY', result)

    def test_home_rejects_unrecognized_or_already_changed_builder(self):
        source = (ROOT/'index.html').read_text('utf-8')
        with self.assertRaisesRegex(RuntimeError, 'BUILDER_BASELINE_CHANGED'):
            release.patch_home(source, source)

    def test_media_changes_only_two_house_slot_lines(self):
        original = "KEEP_BEFORE\n  'catalog-kvadro-house':catalogV68('kvadro-house-outside-v68.webp','Квадро Хаус: наружный вид'),\nKEEP_MIDDLE\n  'catalog-kvadro-house-rain':catalogV68('kvadro-house-outside-v68.webp','Квадро Хаус: вид снаружи'),\nKEEP_AFTER"
        result = release.patch_media(original)
        for line in ['KEEP_BEFORE', 'KEEP_MIDDLE', 'KEEP_AFTER']:
            self.assertIn(line, result)
        self.assertEqual(result.count("path:'assets/media-v5/hero-sun.webp'"), 2)
        self.assertNotIn('kvadro-house-outside-v68.webp', result)
        with self.assertRaisesRegex(RuntimeError, 'MEDIA_BASELINE_CHANGED'):
            release.patch_media(result)

    def test_gallery_preserves_unrelated_models(self):
        original = "'kvadro-outside.webp':'KEEP',\n'kvadro-house-outside.webp':'assets/catalog-v68-ai/kvadro-house-outside-v68.webp'\nVIKING_REAL_KEEP"
        result = release.patch_gallery(original)
        self.assertIn("'kvadro-outside.webp':'KEEP'", result)
        self.assertTrue(result.endswith('VIKING_REAL_KEEP'))
        self.assertIn(release.SUN, result)

    def test_relay_patch_adds_only_previous_version_selection(self):
        current = (ROOT/'server/garant-bani-relay.mjs').read_text(encoding='utf-8')
        previous = current.replace("import {PRICEBOOK as LEGACY_V73_PRICEBOOK} from '../data/legacy-v73-pricebook.js';\n", '').replace('      pricebookVersion===LEGACY_V73_PRICEBOOK.version?LEGACY_V73_PRICEBOOK:\n', '')
        self.assertEqual(release.patch_relay(previous), current)
        with self.assertRaisesRegex(RuntimeError, 'RELAY_BASELINE_CHANGED'):
            release.patch_relay(current)

    def test_backup_restore_real_sqlite_keeps_live_database_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            live = root/'live.sqlite'
            with contextlib.closing(sqlite3.connect(live)) as db:
                db.execute('CREATE TABLE leads(id INTEGER PRIMARY KEY, state TEXT)')
                db.executemany('INSERT INTO leads VALUES(?,?)', [(1, 'new'), (2, 'processed')])
                db.commit()
            before = live.read_bytes()
            backup = root/'backup'
            backup.mkdir()
            with patch.object(release, 'DB', live):
                release.backup_restore(backup)
            self.assertEqual(live.read_bytes(), before)
            for filename in ['leads.sqlite', 'restore-rehearsal.sqlite']:
                with contextlib.closing(sqlite3.connect(backup/filename)) as db:
                    self.assertEqual(db.execute('SELECT * FROM leads ORDER BY id').fetchall(), [(1, 'new'), (2, 'processed')])

    @unittest.skipIf(os.name == 'nt', 'Server symlink semantics verified on Linux; Windows does not require symlink privileges')
    def test_rollback_restores_links_and_never_restores_database(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            old_web, old_api, new_web, new_api = [root/x for x in ['old-web', 'old-api', 'new-web', 'new-api']]
            for path in [old_web, old_api, new_web, new_api]:
                path.mkdir()
            web, api = root/'web-current', root/'api-current'
            web.symlink_to(new_web)
            api.symlink_to(new_api)
            state = dict(zip(['oldWeb', 'oldApi', 'newWeb', 'newApi'], map(str, [old_web, old_api, new_web, new_api])))
            with patch.object(release, 'WEB', web), patch.object(release, 'API', api), patch.object(release, 'run') as run, patch.object(release, 'ready'):
                release.rollback(state)
            self.assertEqual(web.resolve(), old_web)
            self.assertEqual(api.resolve(), old_api)
            run.assert_called_once_with('systemctl', 'restart', release.SERVICE, timeout=50)

    def test_archive_rejects_wrong_commit_and_traversal(self):
        import io
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root/'bad.tar.gz'
            with tarfile.open(archive, 'w:gz', format=tarfile.PAX_FORMAT, pax_headers={'comment':'a'*40}) as package:
                entry = tarfile.TarInfo('../escape')
                entry.size = 3
                package.addfile(entry, io.BytesIO(b'bad'))
            target = root/'extract'
            target.mkdir()
            with self.assertRaisesRegex(RuntimeError, 'ARCHIVE_GIT_COMMIT_MISMATCH'):
                release.extract(archive, target, 'b'*40)
            with self.assertRaisesRegex(RuntimeError, 'UNSAFE_ARCHIVE_PATH'):
                release.extract(archive, target, 'a'*40)
            self.assertFalse((root/'escape').exists())


if __name__ == '__main__':
    unittest.main()

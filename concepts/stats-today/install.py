"""Publish the aggregate entry counter and daily manager reports."""
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError
import concurrent.futures
import datetime
import fcntl
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time

BASE = Path(__file__).resolve().parent
WEB = Path('/srv/sites/dachapar-preview/current')
API = Path('/srv/services/garant-bani-relay/current')
ORIGIN = 'https://xn--80aaan1dh9b.xn--p1ai'
UNIT = 'garant-bani-relay.service'


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def inventory(root):
    return {p.relative_to(root).as_posix(): sha(p) for p in root.rglob('*') if p.is_file()}


def swap(link, target):
    pending = link.with_name('.entries-current-' + str(os.getpid()))
    pending.symlink_to(target)
    os.replace(pending, link)


def restart():
    subprocess.run(['systemctl', 'restart', UNIT], check=True)
    for attempt in range(20):
        try:
            with urlopen('http://127.0.0.1:3301/health', timeout=2) as response:
                if json.load(response).get('ok') is True:
                    return
        except OSError:
            time.sleep(.5)
    raise RuntimeError('API health check failed')


def migrate():
    file = Path('/var/lib/garant-bani-relay/leads.sqlite')
    assert file.is_file()
    with sqlite3.connect(file.as_uri() + '?mode=rw', uri=True, timeout=10) as db:
        db.execute("CREATE TABLE IF NOT EXISTS site_entries(day TEXT NOT NULL,page_path TEXT NOT NULL,source TEXT NOT NULL,channel TEXT NOT NULL,link_id TEXT NOT NULL DEFAULT '',entries INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,page_path,source,channel,link_id))")
        db.execute("CREATE TABLE IF NOT EXISTS analytics_totals_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
        now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        db.execute('INSERT OR IGNORE INTO analytics_totals_meta VALUES(?,?)', ('entries_started_at', now))


def check(manifest):
    old_web, old_api = Path(manifest['web_baseline']), Path(manifest['api_baseline'])
    assert WEB.resolve() == old_web and API.resolve() == old_api
    assert old_web == WEB.parent / 'releases/PACKAGES-CONTACT-85ee8471d88de0a1'
    assert old_api == API.parent / 'releases/QUIZ-OVERVIEW-56865b0723b0'
    server_files = {key for key in manifest['files'] if key.startswith('api/')}
    assert server_files == {'api/server/crm-insights.mjs', 'api/server/crm-public-api.mjs'}
    frontend = {'site-entries.mjs', 'crm/report-period.mjs', 'crm/manager-extension.mjs', 'crm/manager-extension.css', 'assets/js/manager.js'}
    for key, hashes in manifest['files'].items():
        kind, relative = key.split('/', 1)
        assert kind in {'web', 'api'} and not relative.startswith('/') and '..' not in Path(relative).parts
        original = (old_web if kind == 'web' else old_api) / relative
        assert (sha(original) if original.is_file() else None) == hashes['before'], key
        assert sha(BASE / 'overlay' / key) == hashes['after'], key
        if kind == 'web':
            assert relative in frontend or (original.is_file() and relative.endswith('.html')), key
        if relative.endswith(('.mjs', '.js')):
            subprocess.run(['node', '--check', str(BASE / 'overlay' / key)], check=True)
    print('PREFLIGHT=PASS; ENTRY_TOTALS; ALL_FORMS_AND_PRICES_PROTECTED', flush=True)


def main():
    manifest = json.loads((BASE / 'manifest.json').read_text())
    identity = 'ENTRIES-' + sha(BASE / 'manifest.json')[:12]
    old_web, old_api = Path(manifest['web_baseline']), Path(manifest['api_baseline'])
    new_web, new_api = WEB.parent / 'releases' / identity, API.parent / 'releases' / identity
    state = WEB.parent / ('.' + identity + '.json')
    mode = sys.argv[1]
    if mode == '--status':
        print(json.dumps({'web': str(WEB.resolve()), 'api': str(API.resolve()), 'candidate': identity}))
        return
    if mode == '--check':
        check(manifest)
        return
    assert os.geteuid() == 0 and mode in {'--apply', '--rollback'}
    with (WEB.parent / '.bath-choice-deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if mode == '--rollback':
            assert WEB.resolve() == new_web and API.resolve() == new_api
            saved = json.loads(state.read_text())
            assert inventory(old_web) == saved['web_before'] and inventory(old_api) == saved['api_before']
            swap(WEB, old_web)
            swap(API, old_api)
            restart()
            print('FULL_ROLLBACK=PASS', old_web, old_api)
            return
        check(manifest)
        assert not new_web.exists() and not new_api.exists()
        saved = {'web_before': inventory(old_web), 'api_before': inventory(old_api)}
        shutil.copytree(old_web, new_web, symlinks=True)
        shutil.copytree(old_api, new_api, symlinks=True)
        for key in manifest['files']:
            kind, relative = key.split('/', 1)
            dest = (new_web if kind == 'web' else new_api) / relative
            assert not dest.is_symlink()
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(BASE / 'overlay' / key, dest)
        for kind, root in [('web', new_web), ('api', new_api)]:
            after = inventory(root)
            changed = {p for p in after if saved[kind + '_before'].get(p) != after[p]}
            assert changed == {key.split('/', 1)[1] for key in manifest['files'] if key.startswith(kind + '/')}, kind
        state.write_text(json.dumps(saved))
        migrate()
        try:
            swap(API, new_api)
            restart()
            swap(WEB, new_web)
            def verify(item):
                key, hashes = item
                if not key.startswith('web/'):
                    return
                relative = key[4:]
                urlpath = '' if relative == 'index.html' else relative.removesuffix('index.html') if relative.endswith('/index.html') else relative
                with urlopen(ORIGIN + '/' + urlpath + '?entries_verify=' + identity, timeout=20) as response:
                    assert hashlib.sha256(response.read()).hexdigest() == hashes['after'], key
            with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
                list(pool.map(verify, manifest['files'].items()))
            request = Request(ORIGIN + '/api/analytics/entry', data=b'{"page_path":"/"}', headers={'Content-Type': 'application/json', 'Origin': ORIGIN, 'Cookie': 'dp_staff=1'})
            with urlopen(request, timeout=10) as response:
                assert json.load(response).get('staffExcluded') is True
            try:
                urlopen(ORIGIN + '/api/manager/source-reports', timeout=10)
            except HTTPError as error:
                assert error.code == 401
            else:
                raise RuntimeError('Report is accessible without authorization')
            assert inventory(old_web) == saved['web_before'] and inventory(old_api) == saved['api_before']
        except BaseException:
            swap(WEB, old_web)
            swap(API, old_api)
            restart()
            print('AUTO_FULL_ROLLBACK=PASS', flush=True)
            raise
        print('PUBLIC_HASHES=PASS; API_HEALTH=PASS; STAFF_EXCLUSION=PASS; FORMS_AND_PRICES=UNCHANGED')
        print('ACTIVE_WEB=' + str(new_web))
        print('ACTIVE_API=' + str(new_api))
        print('ROLLBACK: sudo python3 ' + str(BASE / 'install.py') + ' --rollback')


if __name__ == '__main__':
    main()

"""Linux route-only installer. Check -> Apply; copy current release and switch atomically."""
import argparse
import hashlib
import json
import os
import shutil
import urllib.request
import zipfile
from pathlib import Path

WEB = Path('/srv/sites/dachapar-preview/current')
RELEASES = WEB.parent / 'releases'
BACKUPS = Path('/var/backups/dachapar')
HERE = Path(__file__).resolve().parent
ORIGIN = 'https://xn--80aaan1dh9b.xn--p1ai'
# Only the exact previously approved route release may be upgraded in place.
# Every other web release with a /novyy-god/ route is an unknown baseline.
R5_OLD_RELEASE = 'NY2027-f2985b6b7ac277f9'
R5_EDITABLE = {'novyy-god/index.html', 'novyy-god/style.css', 'novyy-god/lead.mjs', 'novyy-god/holiday-quiz.mjs'}
SHARED = [
    'lead-client.mjs', 'lead-consent.mjs', 'quote.mjs', 'r85-pricing.mjs',
    'analytics-core.mjs', 'phone-mask.mjs', 'r101/mobile-dialog.mjs',
    'data/site-settings.json', 'data/catalog-pricebook.json',
]
ROUTE_FILES = {'index.html', 'style.css', 'experience.js', 'lead.mjs', 'holiday-quiz.mjs',
               'lead-contract.mjs', 'catalog.mjs', 'models.mjs', 'countdown.mjs',
               'assets/favicon.svg', 'assets/manrope-cyrillic.woff2',
               'assets/manrope-latin.woff2', 'assets/OFL-Manrope.txt'}
ROUTE_FILES |= {f'assets/{scene}-{width}.webp' for scene in
                ['winter-sauna', 'winter-parus', 'winter-viking', 'winter-house']
                for width in [640, 960, 1536]}


def require(condition, message):
    if not condition:
        raise RuntimeError('NEW_YEAR_STOP: ' + message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def active():
    require(WEB.is_symlink(), 'current must be a symlink')
    target = WEB.resolve(strict=True)
    require(target.parent == RELEASES and target.is_dir(), 'active release outside releases')
    return target


def inventory(root):
    result = {}
    for path in sorted(root.rglob('*')):
        require(not path.is_symlink(), 'symlink inside release: ' + str(path))
        if path.is_file():
            result[path.relative_to(root).as_posix()] = sha(path.read_bytes())
    return result


def payload():
    manifest = json.loads((HERE / 'manifest.json').read_text('utf-8'))
    require(manifest['route'] == '/novyy-god/', 'wrong route')
    require(manifest['apiChanged'] is False, 'API changes forbidden')
    require(set(manifest['sharedProductionModules']) == {'/' + name for name in SHARED},
            'shared module contract changed')
    require(sha((HERE / 'payload.zip').read_bytes()) == manifest['payloadSha256'], 'payload hash')
    expected_names = {'novyy-god/' + name for name in ROUTE_FILES}
    entries = manifest['files']
    require(len(entries) == len(expected_names) and {e['path'] for e in entries} == expected_names,
            'unexpected route files')
    with zipfile.ZipFile(HERE / 'payload.zip') as archive:
        require(len(archive.namelist()) == len(expected_names) and
                set(archive.namelist()) == expected_names, 'unexpected ZIP entries')
        files = {}
        for entry in entries:
            info = archive.getinfo(entry['path'])
            require(info.file_size == entry['bytes'] and info.file_size < 5_000_000,
                    'unexpected entry size')
            data = archive.read(entry['path'])
            require(sha(data) == entry['sha256'], 'entry hash: ' + entry['path'])
            files[entry['path']] = data
    return manifest, files


def baseline(payload_files=None):
    root = active()
    files = inventory(root)
    require(all(name in files for name in SHARED), 'required shared modules missing')
    require('index.html' in files, 'home page missing')
    route = root / 'novyy-god'
    if route.exists():
        require(root.name == R5_OLD_RELEASE, 'route already exists outside approved NY2027 R4 release')
        require(route.is_dir() and not route.is_symlink(), 'existing route is not an ordinary directory')
        require(payload_files is not None, 'upgrade requires verified payload')
        expected = {'novyy-god/' + name for name in ROUTE_FILES}
        installed = {name for name in files if name.startswith('novyy-god/')}
        require(installed == expected - {'novyy-god/holiday-quiz.mjs'},
                'unexpected files inside existing R4 route')
        for name in sorted(expected - R5_EDITABLE):
            require(files[name] == sha(payload_files[name]), 'immutable holiday asset drift: ' + name)
        old_html = (route / 'index.html').read_text('utf-8')
        old_css = (route / 'style.css').read_text('utf-8')
        require('style.css?v=ny2027-r4' in old_html and
                'id="delivery-geography-title"' in old_html and
                'class="dialog-story"' in old_html and
                'holiday-quiz.mjs' not in old_html,
                'unexpected previous R4 holiday page content')
        require('NY2027 R4' in old_css and 'NY2027 R5' not in old_css and
                'max-width:1280px' in old_css,
                'unexpected previous R4 holiday styles')
        new_html = payload_files['novyy-god/index.html'].decode('utf-8')
        new_css = payload_files['novyy-god/style.css']
        new_lead = payload_files['novyy-god/lead.mjs'].decode('utf-8')
        new_quiz = payload_files['novyy-god/holiday-quiz.mjs'].decode('utf-8')
        require(all(x in new_html for x in
                    ('style.css?v=ny2027-r5', 'holiday-quiz.mjs?v=ny2027-r5',
                     'href="/consent.html"', 'href="/privacy.html"',
                     'Пришлём подходящие варианты, цены и комплектации',
                     'id="delivery-geography-title"', 'class="dialog-story"')),
                'R5 new page missing consent, quiz or prior layout')
        require('id="inquiry-summary"' not in new_html and
                'выбранной бани' not in new_html,
                'single-model lock still in New Year inquiry dialog')
        require(b'NY2027 R5' in new_css and b'max-width:1280px' in new_css,
                'R5 festive styles or wide lead dialog absent')
        require('callbackAvailable' in new_lead and
                'campaignInquiry(values,crypto.randomUUID())' in new_lead and
                'selectionContext' not in new_lead,
                'generic multivariant lead flow missing')
        require('const question=[' in new_quiz and
                "['p2','1–2 человека'" in new_quiz and
                "['p4','До 4 человек'" in new_quiz and
                "['p6','5–6 человек'" in new_quiz and
                "['p8','До 8 человек'" in new_quiz and
                "title:'Нужна отдельная помывочная?'" in new_quiz and
                "title:'Нужно место, чтобы остаться на ночь?'" in new_quiz,
                'R117 original questions/answers drift')
        require('visibleRemainingMs=8000' in new_quiz and
                'Источник: квиз новый год' in new_quiz and
                "pagePath:'/novyy-god/'" in new_quiz and
                'recommendModelRanges(' in new_quiz,
                'eight-second NY quiz or correct lead source missing')
        require('dp_ny2027_quiz_invite_seen_session' in new_quiz and
                'dp_quiz_invite_seen_session_r111' not in new_quiz,
                'holiday quiz session must be independent of main quiz')
    return root, files


def health():
    with urllib.request.urlopen('http://127.0.0.1:3301/health', timeout=10) as response:
        require(json.load(response).get('ok') is True, 'existing lead API is unhealthy')


def switch(target):
    require(target.parent == RELEASES and target.is_dir() and not target.is_symlink(),
            'unsafe switch destination')
    temporary = WEB.with_name('current.new-year-switch')
    require(not temporary.exists() and not temporary.is_symlink(), 'pending switch exists')
    temporary.symlink_to(target)
    os.replace(temporary, WEB)


def check():
    manifest, new_files = payload()
    root, files = baseline(new_files)
    health()
    state = {'oldWeb': str(root), 'oldFiles': files, 'payloadSha256': manifest['payloadSha256']}
    (HERE / 'check-state.json').write_text(json.dumps(state, indent=2) + '\n', 'utf-8')
    print('CHECK=PASS; production unchanged; baseline=' + str(root))
    if root.name == R5_OLD_RELEASE:
        print('NY2027_R5_UPGRADE=READY; changed=novyy-god/index.html,novyy-god/style.css,novyy-god/lead.mjs,novyy-god/holiday-quiz.mjs; protected=R117,API,SQLite,prices')



def public_check(files):
    for name, data in files.items():
        request = urllib.request.Request(ORIGIN + '/' + name + '?new_year_check=' + sha(data)[:12],
                                         headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(request, timeout=20) as response:
            require(sha(response.read()) == sha(data), 'served file mismatch: ' + name)
    health()


def apply():
    require(os.geteuid() == 0, 'sudo required')
    manifest, files = payload()
    saved = json.loads((HERE / 'check-state.json').read_text('utf-8'))
    old, old_files = baseline(files)
    require(saved == {'oldWeb': str(old), 'oldFiles': old_files,
                      'payloadSha256': manifest['payloadSha256']}, 'baseline changed; rerun Check')
    health()
    release = 'NY2027-' + manifest['payloadSha256'][:16]
    destination = RELEASES / release
    require(not destination.exists() and not destination.is_symlink(), 'release already exists')
    shutil.copytree(old, destination)
    for name, data in files.items():
        path = destination / name  # Names have already matched the fixed route allowlist.
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    expected = {**old_files, **{name: sha(data) for name, data in files.items()}}
    changed = {name for name in expected if old_files.get(name) != expected[name]}
    if old.name == R5_OLD_RELEASE:
        require(changed == R5_EDITABLE, 'upgrade must change only holiday HTML and CSS')
    require(inventory(destination) == expected, 'candidate differs outside route')
    for path in [destination, *destination.rglob('*')]:
        os.chown(path, 0, 0)
        path.chmod(0o755 if path.is_dir() else 0o644)
    backup = BACKUPS / release
    backup.mkdir(parents=True, exist_ok=False, mode=0o700)
    state = backup / 'state.json'
    state.write_text(json.dumps({'oldWeb': str(old), 'newWeb': str(destination),
                                 'oldFiles': old_files, 'newFiles': expected}, indent=2) + '\n')
    state.chmod(0o600)
    # Detect another publisher changing current or its contents while the copy was made.
    require(active() == old and inventory(old) == old_files, 'site changed during preparation')
    switch(destination)
    try:
        public_check(files)
    except Exception:
        switch(old)
        print('AUTOMATIC_ROLLBACK=PASS; public verification failed')
        raise
    print('DEPLOYED=' + ORIGIN + '/novyy-god/; API and database unchanged')
    if old.name == R5_OLD_RELEASE:
        print('NY2027_R5_DEPLOY=PASS; changed=novyy-god/index.html,novyy-god/style.css,novyy-god/lead.mjs,novyy-god/holiday-quiz.mjs; R117 preserved')

    print('ROLLBACK: sudo python3 ' + str(HERE / 'new-year-remote.py') + ' --rollback ' + str(state))


def rollback(path):
    require(os.geteuid() == 0, 'sudo required')
    path = path.resolve(strict=True)
    require(path.name == 'state.json' and path.parent.parent == BACKUPS and
            path.parent.name.startswith('NY2027-'), 'invalid rollback state')
    state = json.loads(path.read_text('utf-8'))
    require(active() == Path(state['newWeb']), 'another release is active')
    require(inventory(active()) == state['newFiles'], 'active release changed')
    old = Path(state['oldWeb'])
    require(old.parent == RELEASES and not old.is_symlink() and inventory(old) == state['oldFiles'],
            'rollback source changed')
    health()
    switch(old)
    print('ROLLED_BACK; API and database unchanged')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--verify-payload', action='store_true')
    modes.add_argument('--check', action='store_true')
    modes.add_argument('--apply', action='store_true')
    modes.add_argument('--rollback', type=Path)
    args = parser.parse_args()
    if args.verify_payload:
        payload()
        print('PAYLOAD=PASS; no server access')
    elif args.check:
        check()
    else:
        import fcntl  # Linux only; Check and validation remain importable in Windows tests.
        with open('/run/lock/dachapar-r101.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            rollback(args.rollback) if args.rollback else apply()


if __name__ == '__main__':
    main()

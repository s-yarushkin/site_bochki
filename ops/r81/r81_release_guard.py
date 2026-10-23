#!/usr/bin/env python3
"""R8.1 FIX2 additional WEB-only pre/post/rollback guard.
Do not use for staging. The versioned installer's --activate owns deployment and
its own automatic rollback. This guard provides read-only verification and
an independently callable, exact-pointer emergency rollback.
"""
import argparse
import fcntl
import hashlib
import json
import os
import pathlib
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

SITE = pathlib.Path('/srv/sites/dachapar-preview')
WEB = SITE / 'current'
API = pathlib.Path('/srv/services/garant-bani-relay/current')
OLD = SITE / 'releases/CJM-R80-20261022-1792731611547801280'
NEW = SITE / 'releases/CJM-R81-20261023-1792748144511530110'
ORIGIN = 'https://xn--80aaan1dh9b.xn--p1ai'
LOCK = SITE / '.gallery-r80.lock'
AUDIT = pathlib.Path(str(NEW) + '.r81-audit.json')
ALLOWED_PROTECTED = (
    'data/catalog-pricebook.json', 'data/pricebook.js', 'lead-client.mjs',
    'analytics-runtime.mjs', 'privacy.html', 'consent.html', 'requisites.html',
    'manager.html', 'robots.txt'
)

def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024*1024), b''):
            h.update(chunk)
    return h.hexdigest()

def target(link):
    require(link.is_symlink(), 'NOT_SYMLINK_' + str(link))
    path = link.resolve(strict=True)
    require(path.is_dir(), 'BROKEN_LINK_' + str(link))
    return path

def inventory(folder):
    out = {}
    for p in folder.rglob('*'):
        require(not p.is_symlink(), 'NESTED_SYMLINK_' + str(p))
        if p.is_file():
            out[p.relative_to(folder).as_posix()] = sha(p)
    return out

def load(files):
    data = json.loads(AUDIT.read_text(encoding='utf-8'))
    m = json.loads((files / 'manifest.json').read_text(encoding='utf-8'))
    require(data.get('status') == 'STAGED_NOT_LIVE', 'AUDIT_STATUS_NOT_STAGED')
    require(data.get('stage') == str(NEW), 'AUDIT_STAGE_MISMATCH')
    require(data.get('before_release') == str(OLD), 'AUDIT_PREVIOUS_MISMATCH')
    require(data.get('manifest_sha256') == sha(files / 'manifest.json'), 'AUDIT_MANIFEST_SHA_MISMATCH')
    require(m.get('source_release') == OLD.name, 'MANIFEST_SOURCE_MISMATCH')
    require(len(m.get('modified_files', {})) == 64, 'MANIFEST_EXPECT_64')
    return data, m

def check_source_stage(files, expected_current):
    live = target(WEB)
    require(live == expected_current, 'LIVE_POINTER_DRIFT=' + str(live))
    current_api = target(API)
    data, manifest = load(files)
    require(str(current_api) == data['before_api'], 'API_POINTER_CHANGED=' + str(current_api))
    require(OLD.parent == NEW.parent == SITE / 'releases', 'BAD_RELEASE_DIRECTORY')
    require(OLD.is_dir() and NEW.is_dir(), 'MISSING_RELEASE_DIRECTORY')
    require(inventory(OLD) == data['before'], 'R80_SOURCE_DRIFT')
    after = inventory(NEW)
    require(after == data['after'], 'R81_STAGE_DRIFT')
    modified = manifest['modified_files']
    require(sorted(data['changed']) == sorted(modified), 'CHANGED_FILE_SET_MISMATCH')
    for name, detail in modified.items():
        require(after.get(name) == detail['sha256'], 'MODIFIED_HASH_MISMATCH=' + name)
        source = detail.get('source_sha256')
        require(data['before'].get(name) == source, 'BASELINE_FILE_HASH_MISMATCH=' + name)
    for name in ALLOWED_PROTECTED:
        require(data['before'].get(name) and data['before'][name] == after.get(name),
                'PROTECTED_CHANGED=' + name)
    # Do not turn the approved QA08 waiver into a fabricated 80% assertion.
    for name in modified:
        if name.endswith(('.html', '.js', '.mjs', '.json', '.css')):
            payload = (NEW / name).read_text(encoding='utf-8', errors='replace')
            require(not re.search(r'80\s*%\s*клиент', payload, re.I), 'UNVERIFIED_80_CLAIM=' + name)
    return data, manifest

def public_check(hashes):
    # All GETs are read-only and carry identity Accept-Encoding for byte-accurate hash match.
    def check(name):
        expected = hashes.get(name)
        require(bool(expected), 'PUBLIC_HASH_NOT_IN_AUDIT=' + name)
        url = ORIGIN + '/' + (name[:-10] if name.endswith('index.html') else name)
        req = urllib.request.Request(url + '?r81_guard=' + str(time.time_ns()),
            headers={'User-Agent':'DachaPar-R81-Guard-GET', 'Accept-Encoding':'identity', 'Cache-Control':'no-cache'})
        with urllib.request.urlopen(req, timeout=25) as response:
            require(response.status == 200, 'PUBLIC_HTTP_' + name + '_' + str(response.status))
            actual = hashlib.sha256(response.read()).hexdigest()
            require(actual == expected, 'PUBLIC_SHA_DRIFT=' + name)
        return name
    paths = ('index.html', 'app.mjs', 'bani/kvadro/index.html',
             'bani/viking/index.html', 'bani/parus/index.html',
             'bani/kvadro-haus/index.html', 'raboty/index.html',
             'data/catalog-pricebook.json',
             'lead-client.mjs', 'privacy.html', 'consent.html')
    with ThreadPoolExecutor(max_workers=3) as pool:
        for path in pool.map(check, paths):
            print('R81_GUARD_PUBLIC=PASS; PATH=' + path, flush=True)

def preflight(files):
    data, manifest = check_source_stage(files, OLD)
    print('R81_CUTOVER_SERVER_PREFLIGHT=PASS; 64_SHA=PASS; R80_SOURCE=LOCKED; R81_STAGE=EXACT; API=UNCHANGED; NO_80_CLAIM=YES; PUBLIC_SWITCH=NO', flush=True)

def post(files):
    data, manifest = check_source_stage(files, NEW)
    public_check(data['after'])
    print('R81_CUTOVER_POSTCHECK=PASS; WEB=R81_FIX2; API=UNCHANGED; PUBLIC_HASH=PASS', flush=True)

def status():
    t = target(WEB)
    api = target(API)
    state = 'R80' if t == OLD else 'R81_FIX2' if t == NEW else 'UNEXPECTED'
    print('R81_PUBLIC_POINTER=' + state + '; WEB=' + str(t), flush=True)
    print('R81_API_POINTER=' + str(api), flush=True)
    require(state != 'UNEXPECTED', 'UNRECOGNIZED_CURRENT_RELEASE')

def rollback():
    require(NEW.is_dir() and OLD.is_dir(), 'ROLLBACK_RELEASE_MISSING')
    require(AUDIT.is_file(), 'ROLLBACK_AUDIT_MISSING')
    data = json.loads(AUDIT.read_text(encoding='utf-8'))
    require(data.get('before_release') == str(OLD) and data.get('stage') == str(NEW), 'ROLLBACK_AUDIT_MISMATCH')
    # Same release lock used by the original installer. The API/DB are never written.
    with LOCK.open('a') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        current = target(WEB)
        if current == OLD:
            print('R81_MANUAL_ROLLBACK=ALREADY_R80; WEB=' + str(current), flush=True)
            return
        require(current == NEW, 'ROLLBACK_REFUSED_CURRENT=' + str(current))
        require(sha(OLD / 'index.html') == data['before'].get('index.html'), 'ROLLBACK_SOURCE_HTML_CHANGED')
        require(sha(OLD / 'app.mjs') == data['before'].get('app.mjs'), 'ROLLBACK_SOURCE_JS_CHANGED')
        temp = SITE / ('.current.r81-rollback.' + str(time.time_ns()))
        try:
            temp.symlink_to(OLD)
            os.replace(temp, WEB)
        finally:
            if temp.is_symlink():
                temp.unlink()
        require(target(WEB) == OLD, 'ROLLBACK_POINTER_NOT_R80')
        print('R81_MANUAL_ROLLBACK_SWITCH=PASS; PREVIOUS_WEB_RESTORED=YES; API_UNMODIFIED=YES', flush=True)
    public_check(data['before'])
    print('R81_MANUAL_ROLLBACK=PASS; WEB=R80; PUBLIC_HASH=PASS', flush=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=('preflight','post','rollback','status'), required=True)
    parser.add_argument('--kit-dir', default='')
    args = parser.parse_args()
    if args.mode in ('preflight','post'):
        kit = pathlib.Path(args.kit_dir).resolve(strict=True)
        require((kit / 'manifest.json').is_file(), 'KIT_MANIFEST_MISSING')
        globals()[args.mode](kit)
    elif args.mode == 'rollback':
        rollback()
    else:
        status()

if __name__ == '__main__':
    try:
        main()
    except BaseException as e:
        print('R81_RELEASE_GUARD_ABORT=' + str(e), file=sys.stderr, flush=True)
        sys.exit(2)

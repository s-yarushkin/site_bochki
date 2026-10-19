#!/usr/bin/env python3
"""Limited V74 release, run from the owner's PowerShell SSH session.

Only content/base-kit/hero/prices and one existing SUN image. No configurator
redesign, new images, Caddy/env/auth mutation, production lead POST or DB writes.
"""
import argparse
import contextlib
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

WEB = Path('/srv/sites/dachapar-preview/current')
API = Path('/srv/services/garant-bani-relay/current')
DB = Path('/var/lib/garant-bani-relay/leads.sqlite')
CADDY = Path('/etc/caddy/Caddyfile')
BACKUPS = Path('/var/backups/dachapar')
SERVICE = 'garant-bani-relay.service'
ORIGIN = 'https://xn--80aaan1dh9b.xn--p1ai'
OLD_VERSION = '2026-10-19-v73-customer-ready-r1'
VERSION = '2026-10-19-v74-sheet-round-up-5000-r1'
OLD_RELAY = '4b9bd1c2d379f10818c9b9f61eef95a03ef0305f'
OLD_APP = '02c79ec39145862514e3d04aff5a9d9c893eb4db'
SUN = 'assets/media-v5/hero-sun.webp'
API_OVERLAY = ['data/catalog-pricebook.json', 'data/pricebook.js',
               'data/legacy-v73-catalog.json', 'data/legacy-v73-pricebook.js']
WEB_OVERLAY = ['data/catalog-pricebook.json', 'data/pricebook.js', 'assets/js/app.js',
               'assets/css/v74-hero.css', 'assets/css/v74-base-kit.css', 'assets/css/v74-content.css']
PAGES = ['bani/index.html', 'bani/kvadro/index.html', 'bani/parus/index.html',
         'bani/viking/index.html', 'bani/kvadro-haus/index.html',
         'dostavka-i-ustanovka/index.html', 'voprosy/index.html', 'kontakty/index.html']


def require(value, message):
    if not value:
        raise RuntimeError(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def blob(path):
    data = path.read_bytes().replace(b'\r\n', b'\n')
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()


def run(*args, cwd=None, timeout=90):
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True, timeout=timeout)
    require(result.returncode == 0, 'COMMAND_FAILED: '+str(args[:3])+': '+(result.stderr or result.stdout)[-900:])
    return result.stdout.strip()


def write(path, data):
    require(not path.is_symlink(), 'OVERLAY_SYMLINK: '+str(path))
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name+'.v74-new')
    with open(temp, 'xb') as stream:
        stream.write(data if isinstance(data, bytes) else data.encode())
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(temp, 0o644)
    os.replace(temp, path)


def switch(current, target):
    temp = current.with_name('current.v74-new')
    require(not temp.exists() and not temp.is_symlink(), 'LINK_TEMP_EXISTS')
    temp.symlink_to(target)
    os.replace(temp, current)


def http(url, expected=200):
    request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache', 'User-Agent': 'DachaPar-LimitedV74/1'})
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            status, body = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, body = error.code, error.read()
    require(status == expected, 'HTTP_'+str(status)+'_EXPECTED_'+str(expected))
    return body


def ready():
    deadline = time.monotonic()+45
    consecutive = 0
    while time.monotonic() < deadline:
        try:
            http('http://127.0.0.1:3301/health')
            consecutive += 1
            if consecutive == 2:
                return
        except (urllib.error.URLError, TimeoutError, OSError):
            consecutive = 0
        except RuntimeError as error:
            if not re.match(r'^HTTP_(502|503|504)_EXPECTED_', str(error)):
                raise
            consecutive = 0
        time.sleep(0.5)
    raise RuntimeError('RELAY_NOT_READY')


def one(text, pattern, label):
    matches = list(re.finditer(pattern, text, re.S))
    require(len(matches) == 1, 'EXPECTED_UNIQUE_'+label)
    return matches[0].group()


def section(text, css):
    return one(text, r'<section class="'+re.escape(css)+r'".*?</section>', css)


def patch_home(active, source):
    old_main = one(active, r'<main>.*?</main>', 'ACTIVE_MAIN')
    new_main = one(source, r'<main>.*?</main>', 'SOURCE_MAIN')
    # Preserve the deployed configurator's entire markup except its shared base price.
    original_builder = section(active, 'builder-section section')
    require(original_builder.count('id="quoteTotal">500 955 ₽') == 1, 'BUILDER_BASELINE_CHANGED')
    preserved_builder = original_builder.replace('id="quoteTotal">500 955 ₽', 'id="quoteTotal">505 000 ₽')
    new_main = new_main.replace(section(source, 'builder-section section'), preserved_builder)
    result = active.replace(old_main, new_main)
    require('id="baseDialog"' not in active, 'BASE_DIALOG_ALREADY_EXISTS')
    dialog = one(source, r'<dialog\b[^>]*id="baseDialog".*?</dialog>', 'BASE_DIALOG')
    require(result.count('<dialog class="contact-dialog"') == 1, 'CONTACT_DIALOG_CHANGED')
    result = result.replace('<dialog class="contact-dialog"', dialog+'\n<dialog class="contact-dialog"', 1)
    for css in ['v74-hero.css', 'v74-base-kit.css', 'v74-content.css']:
        result = result.replace('</head>', '<link rel="stylesheet" href="assets/css/'+css+'">\n</head>', 1)
    require(section(result, 'builder-section section') == preserved_builder, 'CONFIGURATOR_MARKUP_CHANGED')
    return result


def patch_media(text):
    # Only replace the requested first Kvadro House image; all other registry text stays byte-for-byte.
    for key in ['catalog-kvadro-house', 'catalog-kvadro-house-rain']:
        pattern = r"(?m)^  '"+key+r"':catalogV68\('kvadro-house-outside-v68\.webp','[^']*'\),$"
        require(len(re.findall(pattern, text)) == 1, 'MEDIA_BASELINE_CHANGED_'+key)
        replacement = "  '"+key+"':{file:'hero-sun.webp',path:'"+SUN+"',alt:'Квадро Хаус: вид снаружи в солнечную погоду'},"
        text = re.sub(pattern, lambda _: replacement, text)
    return text


def patch_gallery(text):
    old = "'kvadro-house-outside.webp':'assets/catalog-v68-ai/kvadro-house-outside-v68.webp'"
    require(text.count(old) == 1, 'HOUSE_GALLERY_BASELINE_CHANGED')
    return text.replace(old, "'kvadro-house-outside.webp':'"+SUN+"'")


def patch_relay(text):
    anchor = "import {CATALOG,PRICEBOOK} from '../data/pricebook.js';"
    require(text.count(anchor) == 1 and 'LEGACY_V73_PRICEBOOK' not in text, 'RELAY_BASELINE_CHANGED')
    text = text.replace(anchor, anchor+"\nimport {PRICEBOOK as LEGACY_V73_PRICEBOOK} from '../data/legacy-v73-pricebook.js';")
    anchor = '      pricebookVersion===PRICEBOOK.version?PRICEBOOK:'
    require(text.count(anchor) == 1, 'RELAY_PRICE_SELECTION_CHANGED')
    return text.replace(anchor, anchor+'\n      pricebookVersion===LEGACY_V73_PRICEBOOK.version?LEGACY_V73_PRICEBOOK:')


def extract(archive, root, commit):
    require(archive.is_file() and not archive.is_symlink() and archive.stat().st_size < 150*1024**2, 'UNSAFE_ARCHIVE')
    with tarfile.open(archive, 'r:gz') as package:
        require(package.pax_headers.get('comment') == commit, 'ARCHIVE_GIT_COMMIT_MISMATCH')
        seen, total = set(), 0
        for member in package:
            parts = Path(member.name).parts
            require(member.name and not member.name.startswith('/') and '\\' not in member.name and '..' not in parts, 'UNSAFE_ARCHIVE_PATH')
            require(member.name not in seen and len(seen) < 12000, 'DUPLICATE_OR_TOO_MANY_ENTRIES')
            seen.add(member.name)
            total += member.size
            require(total < 500*1024**2 and (member.isfile() or member.isdir()), 'UNSAFE_ARCHIVE_ENTRY')
            path = root/member.name
            if member.isdir():
                path.mkdir(parents=True, exist_ok=True)
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                with package.extractfile(member) as reader, open(path, 'xb') as writer:
                    shutil.copyfileobj(reader, writer)
                os.chmod(path, 0o644)
    require((root/'data/catalog-pricebook.json').is_file(), 'SOURCE_INCOMPLETE')
    require(not (root/'data/config-visual-manifest.json').exists() and not (root/'assets/js/configurator').exists(), 'DEFERRED_CONFIGURATOR_INCLUDED')


def inventory(directory):
    return {p.relative_to(directory).as_posix(): digest(p) for p in directory.rglob('*') if p.is_file()}


def sql_signature(connection):
    tables = [row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    return [(name, connection.execute('SELECT COUNT(*) FROM "'+name.replace('"', '""')+'"').fetchone()[0]) for name in tables]


def backup_restore(backup):
    require(DB.is_file(), 'LEADS_DATABASE_MISSING')
    snapshot = backup/'leads.sqlite'
    with contextlib.closing(sqlite3.connect(DB.as_uri()+'?mode=ro', uri=True)) as live:
        with contextlib.closing(sqlite3.connect(snapshot)) as copy:
            live.backup(copy)
            require(copy.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'BACKUP_INTEGRITY_FAILED')
            signature = sql_signature(copy)
    os.chmod(snapshot, 0o600)
    restored = backup/'restore-rehearsal.sqlite'
    with contextlib.closing(sqlite3.connect(snapshot.as_uri()+'?mode=ro', uri=True)) as copy:
        with contextlib.closing(sqlite3.connect(restored)) as rehearsal:
            copy.backup(rehearsal)
            require(rehearsal.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'RESTORE_INTEGRITY_FAILED')
            require(sql_signature(rehearsal) == signature, 'RESTORE_ROW_COUNT_MISMATCH')
    os.chmod(restored, 0o600)
    print('BACKUP=PASS; RESTORE_REHEARSAL=PASS; PRODUCTION_SQLITE_WRITES=0', flush=True)


def check_active(source):
    require(WEB.is_symlink() and API.is_symlink(), 'CURRENT_LINKS_MISSING')
    web, api = WEB.resolve(strict=True), API.resolve(strict=True)
    require(web.parent == WEB.parent/'releases' and api.parent == API.parent/'releases', 'UNEXPECTED_RELEASE_ROOT')
    for root in [web, api]:
        require(json.loads((root/'data/catalog-pricebook.json').read_text(encoding='utf-8'))['version'] == OLD_VERSION, 'ACTIVE_PRICEBOOK_CHANGED')
    require(blob(api/'server/garant-bani-relay.mjs') == OLD_RELAY, 'ACTIVE_RELAY_CHANGED')
    require(blob(web/'assets/js/app.js') == OLD_APP, 'ACTIVE_APP_CHANGED')
    require(json.loads((web/'data/catalog-pricebook.json').read_text(encoding='utf-8'))['prices'] == json.loads((source/'data/legacy-v73-catalog.json').read_text(encoding='utf-8'))['prices'], 'ACTIVE_PRICES_CHANGED')
    require(CADDY.is_file() and run('systemctl', 'is-active', SERVICE) == 'active', 'RUNTIME_NOT_ACTIVE')
    unit = run('systemctl', 'cat', SERVICE)
    require('garant-bani-relay/current/server/garant-bani-relay.mjs' in unit, 'SERVICE_PATH_CHANGED')
    require(shutil.disk_usage(web.parent).free > 400*1024**2, 'INSUFFICIENT_DISK')
    http('http://127.0.0.1:3301/health')
    http(ORIGIN+'/api/manager/session', 401)
    return web, api, unit


def stage(source, old_web, old_api, new_web, new_api):
    for old, new, overlay in [(old_api, new_api, API_OVERLAY), (old_web, new_web, WEB_OVERLAY)]:
        require(not any(p.is_symlink() for p in old.rglob('*')), 'RELEASE_CONTAINS_SYMLINKS')
        shutil.copytree(old, new, copy_function=os.link)
        for rel in overlay:
            write(new/rel, (source/rel).read_bytes())
    write(new_api/'server/garant-bani-relay.mjs', patch_relay((old_api/'server/garant-bani-relay.mjs').read_text(encoding='utf-8')))
    write(new_web/'index.html', patch_home((old_web/'index.html').read_text(encoding='utf-8'), (source/'index.html').read_text(encoding='utf-8')))
    write(new_web/'assets/js/media-v5.js', patch_media((old_web/'assets/js/media-v5.js').read_text(encoding='utf-8')))
    write(new_web/'assets/js/catalog-gallery-v67.js', patch_gallery((old_web/'assets/js/catalog-gallery-v67.js').read_text(encoding='utf-8')))
    for rel in PAGES:
        active, fresh = (old_web/rel).read_text(encoding='utf-8'), (source/rel).read_text(encoding='utf-8')
        # Keep live OG, legal footer, contact navigation and every other model's image.
        old_main = one(active, r'<main>.*?</main>', 'SEO_ACTIVE_MAIN')
        new_main = one(fresh, r'<main>.*?</main>', 'SEO_SOURCE_MAIN')
        old_images = re.findall(r'<img\b[^>]*src="([^"]+)"', old_main)
        new_images = re.findall(r'<img\b[^>]*src="([^"]+)"', new_main)
        require(len(old_images) == len(new_images), 'SEO_IMAGE_COUNT_CHANGED')
        for old_image, new_image in zip(old_images, new_images):
            if new_image != '/'+SUN:
                new_main = new_main.replace('src="'+new_image+'"', 'src="'+old_image+'"')
        write(new_web/rel, active.replace(old_main, new_main))
    # Provenance and unrelated files must remain identical, including all image bytes.
    web_allowed = set(WEB_OVERLAY+PAGES+['index.html', 'assets/js/media-v5.js', 'assets/js/catalog-gallery-v67.js'])
    api_allowed = set(API_OVERLAY+['server/garant-bani-relay.mjs'])
    for old, new, allowed in [(old_web, new_web, web_allowed), (old_api, new_api, api_allowed)]:
        before, after = inventory(old), inventory(new)
        require(all(after.get(p) == sha for p, sha in before.items() if p not in allowed), 'UNRELATED_FILE_CHANGED')
        require(set(after)-set(before) <= allowed, 'UNEXPECTED_STAGED_FILE')
    run('/usr/bin/node', str(source/'ops/v74-price-probe.mjs'), str(new_api), timeout=45)
    print('STAGED=PASS; PRICEBOOKS_CURRENT_AND_V73=PASS; ALL_IMAGE_BYTES_PRESERVED=PASS', flush=True)


def verify_live(web, caddy_hash):
    for rel in ['index.html']+PAGES+WEB_OVERLAY+['assets/js/media-v5.js', 'assets/js/catalog-gallery-v67.js', SUN]:
        url = '/'+rel
        if rel.endswith('index.html'):
            url = '/'+rel[:-len('index.html')]
        require(hashlib.sha256(http(ORIGIN+url)).hexdigest() == digest(web/rel), 'LIVE_BYTES_MISMATCH_'+rel)
    http(ORIGIN+'/api/manager/session', 401)
    require(digest(CADDY) == caddy_hash, 'CADDY_CHANGED')


def rollback(state):
    old_web, old_api, new_web, new_api = [Path(state[k]) for k in ['oldWeb', 'oldApi', 'newWeb', 'newApi']]
    require(WEB.resolve() in [old_web, new_web] and API.resolve() in [old_api, new_api], 'ROLLBACK_CONCURRENT_CHANGE')
    if WEB.resolve() != old_web:
        switch(WEB, old_web)
    if API.resolve() != old_api:
        switch(API, old_api)
        run('systemctl', 'restart', SERVICE, timeout=50)
    ready()
    print('ROLLBACK=PASS; PREVIOUS_WEB_API_RESTORED; LIVE_DATABASE_NOT_RESTORED', flush=True)


def deploy(source, commit):
    run('/usr/bin/node', str(source/'scripts/verify-v74-public-prices.mjs'), cwd=source)
    book = json.loads((source/'data/catalog-pricebook.json').read_text(encoding='utf-8'))
    require(book['version'] == VERSION and book['checks']['bundleTotalRub'] == 618022, 'SOURCE_PRICEBOOK_UNEXPECTED')
    old_web, old_api, unit = check_active(source)
    caddy_hash = digest(CADDY)
    old_web_hashes, old_api_hashes = inventory(old_web), inventory(old_api)
    release = '20261019-v74-content-'+commit[:12]+'-'+str(time.time_ns())
    new_web, new_api, backup = old_web.parent/release, old_api.parent/release, BACKUPS/release
    state = dict(oldWeb=str(old_web), oldApi=str(old_api), newWeb=str(new_web), newApi=str(new_api), sourceSha=commit)
    switched = False
    try:
        stage(source, old_web, old_api, new_web, new_api)
        backup.mkdir(mode=0o700, parents=True)
        (backup/'state.json').write_text(json.dumps(state, indent=2))
        shutil.copyfile(__file__, backup/'installer.py')
        backup_restore(backup)
        require(WEB.resolve() == old_web and API.resolve() == old_api and digest(CADDY) == caddy_hash and run('systemctl', 'cat', SERVICE) == unit, 'PREACTIVATION_STATE_CHANGED')
        require(inventory(old_web) == old_web_hashes and inventory(old_api) == old_api_hashes, 'ACTIVE_RELEASE_CONTENT_CHANGED')
        switch(API, new_api)
        switched = True
        run('systemctl', 'restart', SERVICE, timeout=50)
        ready()
        http(ORIGIN+'/api/manager/session', 401)
        switch(WEB, new_web)
        verify_live(new_web, caddy_hash)
        (backup/'result.json').write_text(json.dumps(dict(installed=True, sourceSha=commit, leadsCreated=0, configuratorRedesign=False), indent=2))
        print('V74_CONTENT_DEPLOY=PASS; PUBLIC_BASES=20; COMFORT=618022; LEADS_CREATED=0', flush=True)
        print('ROLLBACK=sudo python3 '+str(backup/'installer.py')+' --rollback '+str(backup/'state.json'), flush=True)
    except Exception:
        if switched:
            rollback(state)
        raise


def main():
    import fcntl  # Linux server only; local safety tests also run on Windows.
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', type=Path)
    parser.add_argument('--archive-sha256')
    parser.add_argument('--source-sha')
    parser.add_argument('--rollback', type=Path)
    args = parser.parse_args()
    require(os.geteuid() == 0, 'SUDO_REQUIRED')
    # Coordinate with both previous deployment tools, without touching their data.
    with contextlib.ExitStack() as locks:
        for name in ['dachapar-v72.lock', 'dachapar-v73-unified.lock']:
            lock = locks.enter_context(open('/run/lock/'+name, 'a'))
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.rollback:
            rollback(json.loads(args.rollback.read_text(encoding='utf-8')))
            return
        require(args.source_sha and re.fullmatch('[a-f0-9]{40}', args.source_sha), 'PINNED_SOURCE_SHA_REQUIRED')
        require(args.archive and args.archive_sha256 and re.fullmatch('[a-f0-9]{64}', args.archive_sha256), 'ARCHIVE_HASH_REQUIRED')
        require(digest(args.archive) == args.archive_sha256, 'ARCHIVE_HASH_MISMATCH')
        with tempfile.TemporaryDirectory(prefix='dachapar-v74-content-') as directory:
            root = Path(directory)
            extract(args.archive, root, args.source_sha)
            deploy(root, args.source_sha)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('V74_CONTENT_STOPPED='+str(error), file=sys.stderr, flush=True)
        sys.exit(1)

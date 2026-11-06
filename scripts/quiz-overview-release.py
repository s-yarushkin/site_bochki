"""Publish the manager quiz overview over the active web and API releases."""
import fcntl
import hashlib
import json
import os
import posixpath
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen

BASE = Path(__file__).resolve().parent
WEB = Path('/srv/sites/dachapar-preview/current')
API = Path('/srv/services/garant-bani-relay/current')
OLD_WEB = WEB.parent / 'releases/ANALYTICS-COMPACT-3c9d9a28fa483495'
OLD_API = API.parent / 'releases/MFA-81c68cd72bf6'
UNIT = 'garant-bani-relay.service'
ORIGIN = 'https://xn--80aaan1dh9b.xn--p1ai'
TAG = 'quiz-overview-20261106'
CLIENT_FILES = {'quiz.mjs', 'journey-tracker.mjs', 'manager.html', 'assets/js/manager.js', 'crm/manager-extension.mjs'}
SERVER_FILE = 'server/crm-insights.mjs'
MANIFEST = BASE / 'manifest.json'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def patch_urls(relative, source, matcher, changed):
    def replace(match):
        url = match[2].split('?')[0]
        path = url.lstrip('/') if url.startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(relative), url))
        return match[1] + url + '?v=' + TAG + match[3] if path in changed else match[0]
    return matcher.sub(replace, source)

def prepare():
    assert WEB.resolve() == OLD_WEB and API.resolve() == OLD_API
    payload = BASE / 'payload'
    sources = {name: (payload/'web'/name).read_text('utf8') for name in CLIENT_FILES}
    modules = {p.relative_to(OLD_WEB).as_posix(): p.read_text('utf8') for p in OLD_WEB.rglob('*.mjs')
               if 'vendor' not in p.parts and 'novyy-god' not in p.parts}
    modules.update({name: text for name, text in sources.items() if name.endswith('.mjs')})
    imports = re.compile(r"""((?:from\s*|import\s*\(?\s*)['"])([^'"]+)(['"])""")
    html_links = re.compile(r"""((?:src|href)=['"])([^'"]+)(['"])""")
    changed = set(sources)
    while True:
        dependents = {name for name, text in modules.items() if patch_urls(name, text, imports, changed) != text}
        if dependents <= changed:
            break
        changed.update(dependents)
    for name in changed & modules.keys():
        sources[name] = patch_urls(name, modules[name], imports, changed)
    for p in OLD_WEB.rglob('*.html'):
        if 'novyy-god' in p.parts:
            continue
        name = p.relative_to(OLD_WEB).as_posix()
        original = p.read_text('utf8')
        updated = patch_urls(name, sources.get(name, original), html_links, changed)
        if updated != original:
            sources[name] = updated
    entries = {'web/'+name: text.encode('utf8') for name, text in sources.items()}
    entries['api/'+SERVER_FILE] = (payload/'api/crm-insights.mjs').read_bytes()
    manifest = {}
    for key, data in entries.items():
        kind, name = key.split('/', 1)
        old = OLD_WEB if kind == 'web' else OLD_API
        before = sha((old/name).read_bytes())
        if before == sha(data):
            continue
        output = BASE/'overlay'/key
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(data)
        manifest[key] = {'before': before, 'after': sha(data)}
    MANIFEST.write_text(json.dumps(manifest, sort_keys=True, indent=2)+'\n')
    print('PREPARED', len(manifest), sha(MANIFEST.read_bytes())[:12])

def check(manifest):
    assert WEB.resolve() == OLD_WEB and API.resolve() == OLD_API
    assert {key for key in manifest if key.startswith('api/')} == {'api/'+SERVER_FILE}
    for key, hashes in manifest.items():
        kind, name = key.split('/', 1)
        assert kind in {'web','api'} and not name.startswith('/') and '..' not in Path(name).parts
        assert Path(name).suffix in {'.mjs','.js','.html'}
        original = (OLD_WEB if kind == 'web' else OLD_API)/name
        assert sha(original.read_bytes()) == hashes['before'], key
        candidate = BASE/'overlay'/key
        assert sha(candidate.read_bytes()) == hashes['after'], key
        if candidate.suffix in {'.mjs','.js'}:
            subprocess.run(['node','--check',str(candidate)],check=True)
    print('PREFLIGHT=PASS', len(manifest), flush=True)

def swap(link, target):
    pending = link.with_name(f'.quiz-overview-{os.getpid()}')
    pending.symlink_to(target)
    os.replace(pending, link)

def restart():
    subprocess.run(['systemctl','daemon-reload'],check=True)
    subprocess.run(['systemctl','restart',UNIT],check=True)
    for _ in range(20):
        try:
            with urlopen('http://127.0.0.1:3301/health',timeout=3) as response:
                if json.load(response).get('ok') is True:
                    return
        except OSError:
            time.sleep(.5)
    raise RuntimeError('API health check failed')

def publish(manifest, web_release, api_release):
    check(manifest)
    assert not web_release.exists() and not api_release.exists()
    shutil.copytree(OLD_WEB, web_release, symlinks=True)
    shutil.copytree(OLD_API, api_release, symlinks=True)
    for key in manifest:
        kind, name = key.split('/', 1)
        dest = (web_release if kind == 'web' else api_release)/name
        assert not dest.is_symlink()
        shutil.copy2(BASE/'overlay'/key, dest)
    try:
        swap(API, api_release)
        restart()
        swap(WEB, web_release)
        for key, hashes in manifest.items():
            if key.startswith('web/'):
                path = key.removeprefix('web/')
                if path=='index.html':
                    path=''
                elif path.endswith('/index.html'):
                    path=path.removesuffix('index.html')
                with urlopen(f'{ORIGIN}/{path}?quiz_overview_verify={web_release.name}',timeout=10) as response:
                    assert sha(response.read()) == hashes['after'], key
        try:
            urlopen(ORIGIN+'/api/manager/action-reports',timeout=10)
        except HTTPError as error:
            assert error.code==401
        else:
            raise RuntimeError('Report accessible without a session')
    except BaseException:
        swap(WEB, OLD_WEB)
        swap(API, OLD_API)
        restart()
        print('ROLLBACK=PASS',flush=True)
        raise
    print('ACTIVE',web_release,api_release,flush=True)

def main():
    mode=sys.argv[1]
    if mode=='--prepare':
        prepare()
        return
    manifest=json.loads(MANIFEST.read_text())
    identity='QUIZ-OVERVIEW-'+sha(MANIFEST.read_bytes())[:12]
    web_release=WEB.parent/'releases'/identity
    api_release=API.parent/'releases'/identity
    if mode=='--status':
        print(json.dumps({'web':str(WEB.resolve()),'api':str(API.resolve()),'candidate':identity}))
        return
    if mode=='--check':
        check(manifest)
        return
    assert os.geteuid()==0 and mode in {'--apply','--rollback'}
    with (WEB.parent/'.bath-choice-deploy.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if mode=='--apply':
            publish(manifest,web_release,api_release)
        else:
            assert WEB.resolve()==web_release and API.resolve()==api_release
            swap(WEB,OLD_WEB)
            swap(API,OLD_API)
            restart()
            print('ROLLBACK=PASS')

if __name__=='__main__':
    main()

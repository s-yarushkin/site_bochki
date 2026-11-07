"""Build a small overlay over the two existing releases."""
from pathlib import Path
import hashlib
import json
import re

BASE = Path(__file__).resolve().parent
WEB = Path('/srv/sites/dachapar-preview/releases/PACKAGES-CONTACT-85ee8471d88de0a1')
API = Path('/srv/services/garant-bani-relay/releases/QUIZ-OVERVIEW-56865b0723b0')
TAG = 'entries-20261107'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    assert (WEB.parent.parent / 'current').resolve() == WEB
    assert (API.parent.parent / 'current').resolve() == API
    files = {}
    for kind in ['web', 'api']:
        for file in (BASE / 'payload' / kind).rglob('*'):
            if file.is_file():
                files[kind + '/' + file.relative_to(BASE / 'payload' / kind).as_posix()] = file.read_bytes()
    manager = (WEB / 'assets/js/manager.js').read_text('utf8')
    old = "../../crm/manager-extension.mjs?v=quiz-overview-20261106"
    assert manager.count(old) == 1
    files['web/assets/js/manager.js'] = manager.replace(old, '../../crm/manager-extension.mjs?v=' + TAG).encode()
    for file in WEB.rglob('*.html'):
        relative = file.relative_to(WEB).as_posix()
        page = file.read_text('utf8')
        if relative == 'manager.html':
            page, count = re.subn(r'(/assets/js/manager\.js|assets/js/manager\.js|\.\/assets/js/manager\.js)(?:\?[^"\s]*)?', lambda m: m[1] + '?v=' + TAG, page)
            assert count == 1
            page, count = re.subn(r'(/crm/manager-extension\.css|crm/manager-extension\.css|\.\/crm/manager-extension\.css)(?:\?[^"\s]*)?', lambda m: m[1] + '?v=' + TAG, page)
            assert count == 1
        elif relative not in {'404.html', 'yandex_b6454ce0d283ef63.html'}:
            script = '<script type="module" src="/site-entries.mjs?v=' + TAG + '"></script>'
            first_script = page.find('<script')
            if first_script >= 0:
                page = page[:first_script] + script + page[first_script:]
            else:
                anchor = '</head>' if '</head>' in page else '</html>'
                assert page.count(anchor) == 1, relative
                page = page.replace(anchor, script + anchor)
        else:
            continue
        files['web/' + relative] = page.encode()
    manifest = {'web_baseline': str(WEB), 'api_baseline': str(API), 'files': {}}
    for key, data in files.items():
        kind, relative = key.split('/', 1)
        original = (WEB if kind == 'web' else API) / relative
        target = BASE / 'overlay' / key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        manifest['files'][key] = {'before': sha(original.read_bytes()) if original.exists() else None, 'after': sha(data)}
    data = (json.dumps(manifest, sort_keys=True, indent=2) + '\n').encode()
    (BASE / 'manifest.json').write_bytes(data)
    print('PREPARED=PASS', len(files), sha(data)[:12])


if __name__ == '__main__':
    main()

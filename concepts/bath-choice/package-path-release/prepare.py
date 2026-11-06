"""Open the existing comparison from the lower package section."""
import hashlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
CURRENT = Path('/srv/sites/dachapar-preview/current')
OLD = CURRENT.parent / 'releases/HOME-TRUST-8aee8919ae163e70'
from compose_home import PACKAGE_PATH_COPY

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    assert CURRENT.resolve() == OLD
    html = (OLD/'index.html').read_text('utf8')
    for old, new in PACKAGE_PATH_COPY.items():
        assert html.count(old) == 1, old
        html = html.replace(old, new)
    version = '/choice/app.mjs?v=trust-20261106'
    assert html.count(version) == 1
    html = html.replace(version, '/choice/app.mjs?v=package-path-20261106')
    app = (OLD/'choice/app.mjs').read_text('utf8')
    listener = "$('[data-compare]').addEventListener('click',event=>openPackageComparison({"
    assert app.count(listener) == 1
    app = app.replace(listener, "for(const trigger of document.querySelectorAll('[data-compare],[data-compare-details]'))trigger.addEventListener('click',event=>openPackageComparison({")
    files = {'index.html': html.encode('utf8'), 'choice/app.mjs': app.encode('utf8')}
    manifest = {'baseline': str(OLD), 'before': {}, 'files': {}}
    for rel, data in files.items():
        target = BASE/'site'/rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        manifest['before'][rel] = sha((OLD/rel).read_bytes()) if (OLD/rel).is_file() else None
        manifest['files'][rel] = sha(data)
    data = (json.dumps(manifest, sort_keys=True, indent=2) + '\n').encode()
    (BASE/'manifest.json').write_bytes(data)
    print('PREPARED', len(files), sha(data)[:16])

if __name__ == '__main__':
    main()

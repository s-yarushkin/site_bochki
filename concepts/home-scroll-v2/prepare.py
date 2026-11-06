"""Prepare the homepage section scrolling over the active release."""
import hashlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
CURRENT = Path('/srv/sites/dachapar-preview/current')
OLD = CURRENT.parent/'releases/HOME-SCROLL-31427328684a61fc'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    assert CURRENT.resolve() == OLD
    html = (OLD/'index.html').read_text('utf8')
    module = 'home-section-scroll.mjs'
    previous = f'/{module}?v=20261106'
    assert html.count(previous) == 1
    files = {
        'index.html': html.replace(previous, f'/{module}?v=20261106-v2').encode('utf8'),
        module: (BASE/module).read_bytes(),
    }
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

if __name__=='__main__':
    main()

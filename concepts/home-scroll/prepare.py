"""Prepare the homepage section scrolling over the active release."""
import hashlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
CURRENT = Path('/srv/sites/dachapar-preview/current')
OLD = CURRENT.parent/'releases/HEADER-SHADE-fd3c261ec5550f6e'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    assert CURRENT.resolve() == OLD
    html = (OLD/'index.html').read_text('utf8')
    assert html.count('</body>') == 1
    assert 'class="hero hh-hero choice-hero"' in html and 'id="bath-model"' in html
    module = 'home-section-scroll.mjs'
    assert module not in html
    script = f'<script type="module" src="/{module}?v=20261106"></script>'
    files = {
        'index.html': html.replace('</body>', script + '</body>').encode('utf8'),
        module: (BASE/module).read_text('utf-8-sig').encode('utf8'),
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

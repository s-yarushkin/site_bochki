"""Prepare the homepage header gradient over the active contact release."""
import hashlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
CURRENT = Path('/srv/sites/dachapar-preview/current')
OLD = CURRENT.parent/'releases/CONTACT-MAX-2363d4536a570e5a'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    assert CURRENT.resolve() == OLD
    html = (OLD/'index.html').read_text('utf8')
    assert html.count('</head>') == 1
    assert '<body class="hh-page">' in html and '<header class="site-header">' in html
    assert 'home-header-shade.css' not in html
    css = 'home-header-shade.css'
    link = f'<link rel="stylesheet" href="/{css}?v=20261106">'
    files = {
        'index.html': html.replace('</head>', link + '</head>').encode('utf8'),
        css: (BASE/css).read_text('utf-8-sig').encode('utf8'),
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

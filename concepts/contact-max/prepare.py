"""Add the owner-supplied MAX contact to the existing contact buttons."""
import hashlib
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent
CURRENT = Path('/srv/sites/dachapar-preview/current')
OLD = CURRENT.parent / 'releases/CONTACTS-7f34deb06d070d21'
MAX_URL = 'https://max.ru/u/f9LHodD0cOIZJ6FRCFQ9wwKh5fxCwvF1zZelL5zC38JafUd_LUyWfjKQwwY'
GROUP = re.compile(r'(<span class="phone contact-actions">.*?)(</span>)', re.S)
MAX_LINK = f'<a class="contact-action" href="{MAX_URL}" target="_blank" rel="noopener noreferrer">Написать в MAX</a>'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    assert CURRENT.resolve() == OLD
    assert re.fullmatch(r'https://max\.ru/u/[A-Za-z0-9_-]+', MAX_URL)
    overlay = {'contact-actions.css': (BASE/'contact-actions.css').read_bytes()}
    for path in OLD.rglob('*.html'):
        source = path.read_text('utf8')
        if 'class="phone contact-actions"' not in source:
            continue
        updated, count = GROUP.subn(lambda match: match[1] + MAX_LINK + match[2], source)
        assert count == 1 and updated.count(MAX_URL) == 1
        updated = updated.replace('/contact-actions.css?v=20261106', '/contact-actions.css?v=max-20261106')
        overlay[path.relative_to(OLD).as_posix()] = updated.encode('utf8')
    assert {'index.html', 'novyy-god/index.html', 'kontakty/index.html'} <= overlay.keys()
    manifest = {'baseline': str(OLD), 'before': {}, 'files': {}}
    for rel, content in overlay.items():
        target = BASE/'site'/rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        manifest['before'][rel] = sha((OLD/rel).read_bytes())
        manifest['files'][rel] = sha(content)
    data = (json.dumps(manifest, sort_keys=True, indent=2) + '\n').encode()
    (BASE/'manifest.json').write_bytes(data)
    print('PREPARED', len(overlay), sha(data)[:16])

if __name__ == '__main__':
    main()

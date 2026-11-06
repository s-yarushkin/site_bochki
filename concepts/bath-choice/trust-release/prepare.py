"""Prepare the trust section and remove the redundant layout link."""
import hashlib
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent
CURRENT = Path('/srv/sites/dachapar-preview/current')
OLD = CURRENT.parent / 'releases/HOME-SCROLL-31427328684a61fc'
LINK = '<a class="textlink" href="/planirovki/">Посмотреть примеры планировок →</a>'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    assert CURRENT.resolve() == OLD
    html = (OLD/'index.html').read_text('utf8')
    section = re.compile(r'<section\b[^>]*\bid="care"[^>]*>.*?</section>', re.S)
    care = (BASE/'care.html').read_text('utf8').strip()
    html, count = section.subn(lambda _: care, html)
    assert count == 1
    individual = re.compile(r'<section\b[^>]*\bid="individual"[^>]*>.*?</section>', re.S)
    original, = individual.findall(html)
    assert original.count(LINK) == 1
    html = html.replace(original, original.replace(LINK, ''), 1)
    assert html.count('/choice/app.mjs?v=quiz-overview-20261106') == 1
    html = html.replace('/choice/app.mjs?v=quiz-overview-20261106', '/choice/app.mjs?v=trust-20261106')
    html = html.replace('</head>', '<link rel="stylesheet" href="/choice/care.css?v=20261106"></head>', 1)
    assert 'data-production' not in care
    for asset in re.findall(r'/viking-built-media/[^"\s]+\.webp', care):
        assert (OLD/asset.lstrip('/')).is_file(), asset
    app = (OLD/'choice/app.mjs').read_text('utf8')
    handler = "$('[data-production]').addEventListener"
    assert app.count(handler) == 1
    app = app.replace(handler, "$('[data-production]')?.addEventListener")
    files = {
        'index.html': html.encode('utf8'),
        'choice/app.mjs': app.encode('utf8'),
        'choice/care.css': (BASE/'care.css').read_bytes(),
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

if __name__ == '__main__':
    main()

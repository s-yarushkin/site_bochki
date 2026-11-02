"""Build an isolated hero overlay on the captured LIVE home. Does not publish."""
import hashlib
import json
import re
import shutil
import html
import zipfile
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / 'output/home-hero-site'
BASELINE = HERE / 'baseline/index.html'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def compose(original, hero):
    matches = list(re.finditer(r'<section class="hero"[^>]*>.*?</section>', original, re.S))
    if len(matches) != 1:
        raise RuntimeError('HOME_HERO_STOP: expected exactly one original hero')
    before, after = original[:matches[0].start()], original[matches[0].end():]
    if 'id="models"' not in after or 'r117-goals-' not in original:
        raise RuntimeError('HOME_HERO_STOP: captured live baseline is not the reviewed home')
    # Preserve every byte of the catalogue, other sections, dialog and original scripts.
    baseline_tail = after
    before = before.replace('</head>', '<link rel="stylesheet" href="/home-hero/hero.css">'
                            '<link rel="preload" as="image" href="/home-hero/assets/kvadro-1920.webp">'
                            '</head>')
    if 'class="hh-page"' in before:
        raise RuntimeError('HOME_HERO_STOP: already overlaid')
    before = re.sub(r'<body\b', '<body class="hh-page"', before, count=1)
    request = '<button class="btn hh-header-request" type="button" data-inquiry="quote" data-model="kvadro" data-size="400">Обсудить баню <span aria-hidden="true">↗</span></button>'
    before = before.replace('<button aria-controls="mobile-menu"', request + '<button aria-controls="mobile-menu"', 1)
    assert request in before, 'known mobile menu button missing'
    # Load after the original application scripts, without editing their contract.
    after = after.replace('</body>', '<script type="module" src="/home-hero/hero.mjs"></script></body>')
    assert after.replace('<script type="module" src="/home-hero/hero.mjs"></script>', '') == baseline_tail
    return before + hero + after, sha(baseline_tail.encode())


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    destination = OUT / 'home-hero'
    (destination / 'assets').mkdir(parents=True, exist_ok=True)
    for name in ['hero.css', 'hero.mjs', 'catalog.mjs']:
        shutil.copy2(HERE / name, destination / name)
    for name in ['kvadro', 'parus', 'viking', 'house']:
        original = Image.open(HERE / 'assets' / (name + '.png')).convert('RGB')
        for width in [640, 1280, 1920]:
            height = round(original.height * width / original.width)
            original.resize((width, height), Image.Resampling.LANCZOS).save(
                destination / 'assets' / f'{name}-{width}.webp', quality=85, method=6)
    book = json.loads((ROOT / 'web/data/catalog-pricebook.json').read_text('utf-8'))
    hero = (HERE / 'hero.html').read_text('utf-8')
    for model, prices in book['prices'].items():
        hero = hero.replace('{{' + model + '}}', f'{min(prices.values()):,}'.replace(',', ' '))
    original = BASELINE.read_text('utf-8')
    for model, prices in book['prices'].items():
        row = re.search(r'data-price="' + re.escape(model) + r'"[^>]*>([^<]+)', original)
        if not row or int(re.sub(r'\D', '', html.unescape(row[1]))) != min(prices.values()):
            raise RuntimeError('HOME_HERO_STOP: captured catalogue and current pricebook differ: ' + model)
    page, tail_hash = compose(original, hero)
    # Candidate is closed to indexing. Baseline canonical and all original SEO data stay intact.
    if re.search(r'<meta[^>]+name="robots"', page):
        page = re.sub(r'(<meta[^>]+name="robots"[^>]+content=")[^"]*', r'\g<1>noindex,nofollow', page)
    else:
        page = page.replace('</head>', '<meta name="robots" content="noindex,nofollow"></head>')
    (OUT / 'index.html').write_text(page, 'utf-8')
    manifest = {'published': False, 'scope': 'home hero + its header styling only',
                'liveOrigin': 'https://xn--80aaan1dh9b.xn--p1ai', 'capturedDate': '2026-11-02',
                'baselineHtmlSha256': sha(BASELINE.read_bytes()), 'originalTailSha256': tail_hash,
                'cataloguePreserved': True, 'sharedApplicationModulesChanged': False,
                'pricebookChanged': False, 'apiChanged': False,
                'files': [{'path': p.relative_to(OUT).as_posix(), 'sha256': sha(p.read_bytes()), 'bytes': p.stat().st_size}
                          for p in sorted(OUT.rglob('*')) if p.is_file()]}
    (ROOT / 'output/home-hero-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    with zipfile.ZipFile(ROOT / 'output/home-hero-review.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(OUT.rglob('*')):
            if path.is_file():
                archive.write(path, 'home-hero-preview/site/' + path.relative_to(OUT).as_posix())
        archive.write(HERE / 'preview.mjs', 'home-hero-preview/preview.mjs')
        archive.write(ROOT / 'output/home-hero-manifest.json', 'home-hero-preview/manifest.json')
        archive.writestr('home-hero-preview/README.txt',
                         'ДачаПар — кандидат нового первого экрана, не опубликован.\n\n'
                         'Нужен Node.js 24 и доступ к интернету для прежних ресурсов сайта.\n'
                         'Распакуйте архив, откройте терминал в этой папке и выполните:\n'
                         'node preview.mjs\n\nОткройте http://127.0.0.1:4188/ . Остановка — Ctrl+C.\n'
                         'Это локальный просмотр: аналитика выключена, POST и API заблокированы.\n'
                         'Папку site нельзя копировать вместо всего действующего сайта.\n')
    print(json.dumps({'output': str(OUT), 'files': len(manifest['files']), 'published': False}, ensure_ascii=True))


if __name__ == '__main__':
    main()

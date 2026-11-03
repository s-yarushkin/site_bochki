"""Build an isolated hero overlay on the captured LIVE home. Does not publish."""
import hashlib
import argparse
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
MODEL_PAGES = {'kvadro':'kvadro', 'parus':'parus', 'viking':'viking', 'kvadro-haus':'kvadro-house'}


def sha(data):
    return hashlib.sha256(data).hexdigest()

def copy_layouts(destination, book):
    source = HERE / 'layouts'
    registry = json.loads((source / 'index.json').read_text('utf-8'))
    ids = set()
    for plan in registry['plans']:
        number = f"{plan['number']:02}"
        if plan['id'] != 'dp3d-' + number or plan['id'] in ids:
            raise RuntimeError('Duplicate or invalid layout ID: ' + plan['id'])
        ids.add(plan['id'])
        spec = json.loads((source / plan['spec']).read_text('utf-8-sig'))
        if (spec['plan'] != plan['number'] or spec['dimension_sha256'] != plan['dimension_sha256']
                or sha((source / plan['model']).read_bytes()) != plan['sha256']):
            raise RuntimeError('Layout bundle mismatch: ' + plan['id'])
        for model in plan['models']:
            size = plan['size']
            if size not in book['prices'][model]:
                raise RuntimeError('Unknown layout size: ' + plan['id'])
            expected = ([int(part)*1000 for part in size.split('x')] if 'x' in size else
                        [int(size)*10,round(book['models'][model]['widthM']*1000)])
            if sorted(spec['outer_mm'][:2]) != sorted(expected):
                raise RuntimeError('Layout dimensions do not match catalog: ' + plan['id'])
        for key in ['drawing','model','spec','preview']:
            relative = Path(plan[key])
            output = destination / relative
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source / relative, output)
    shutil.copy2(source / 'index.json', destination / 'index.json')
    shutil.copytree(source / 'vendor', destination / 'vendor', dirs_exist_ok=True)


def compose(original, hero):
    matches = list(re.finditer(r'<section class="hero"[^>]*>.*?</section>', original, re.S))
    if len(matches) != 1:
        raise RuntimeError('HOME_HERO_STOP: expected exactly one original hero')
    before, after = original[:matches[0].start()], original[matches[0].end():]
    if 'id="models"' not in after or 'r117-goals-' not in original:
        raise RuntimeError('HOME_HERO_STOP: captured live baseline is not the reviewed home')
    # Preserve every byte of the catalogue, other sections, dialog and original scripts.
    baseline_tail = after
    before = before.replace('</head>', '<link rel="stylesheet" href="/home-hero/hero.css"></head>')
    before = before.replace('<a href="/bani/">Бани и цены</a>', '<a href="#models" data-bath-route="models">Бани и цены</a>')
    if 'class="hh-page"' in before:
        raise RuntimeError('HOME_HERO_STOP: already overlaid')
    before = re.sub(r'<body\b', '<body class="hh-page"', before, count=1)
    # Load after the original application scripts, without editing their contract.
    after = after.replace('</body>', '<script type="module" src="/home-hero/hero.mjs"></script></body>')
    assert after.replace('<script type="module" src="/home-hero/hero.mjs"></script>', '') == baseline_tail
    return before + hero + after, sha(baseline_tail.encode())

def compose_model(original, model):
    pattern = r'<section class="wrap section" id="plans">.*?</section>'
    replacement = (
        f'<section class="wrap section hh-model-examples" id="plans" data-model-examples="{model}">'
        '<h2>Примеры планировок</h2><label hidden>Пример <select></select></label>'
        '<div class="hh-layout-panel" hidden></div><p role="status"></p>'
        f'<p><a href="/?bath={model}#bath-model">Посмотреть размеры и цены →</a></p></section>'
    )
    result, count = re.subn(pattern, lambda _: replacement, original, flags=re.S)
    if count != 1 or '/assets/plans/' in result:
        raise RuntimeError('Unexpected layout section on model page: ' + model)
    return result.replace('</head>', '<link rel="stylesheet" href="/home-hero/hero.css"></head>').replace(
        '</body>', '<script type="module" src="/home-hero/model-examples.mjs"></script></body>')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--home-baseline', type=Path,
                        help='Homepage HTML from the current server release')
    parser.add_argument('--model-baseline', type=Path,
                        help='Directory containing bani/SLUG/index.html from the current server release')
    parser.add_argument('--pricebook', type=Path, default=ROOT / 'web/data/catalog-pricebook.json',
                        help='Pricebook from the same release as the homepage')
    parser.add_argument('--release', action='store_true', help='Build production overlay without preview settings')
    args = parser.parse_args()
    if args.release and not (args.home_baseline and args.model_baseline):
        parser.error('--release requires --home-baseline and --model-baseline from the target server release')
    baseline = args.home_baseline or BASELINE
    output = ROOT / 'output/home-hero-release' if args.release else OUT
    destination = output / 'home-hero'
    (destination / 'assets').mkdir(parents=True, exist_ok=True)
    for name in ['hero.css', 'hero.mjs', 'catalog.mjs', 'roof-points.mjs', 'plan-navigation.mjs',
                 'model-journey.mjs', 'model-request.mjs', 'layout-panel.mjs', 'layout-viewer.mjs',
                 'model-examples.mjs']:
        shutil.copy2(HERE / name, destination / name)
    for name in ['kvadro', 'parus', 'viking', 'house']:
        original = Image.open(HERE / 'assets' / (name + '.png')).convert('RGB')
        for width in [640, 1280, 1920]:
            height = round(original.height * width / original.width)
            original.resize((width, height), Image.Resampling.LANCZOS).save(
                destination / 'assets' / f'{name}-{width}.webp', quality=85, method=6)
    book = json.loads(args.pricebook.read_text('utf-8'))
    copy_layouts(destination / 'layouts', book)
    hero = (HERE / 'hero.html').read_text('utf-8')
    roof = (HERE / 'roof-points.mjs').read_text('utf-8')
    hero = hero.replace('{{roof}}', re.search(r"kvadro: '([^']+)'", roof)[1])
    original = baseline.read_text('utf-8')
    for model, prices in book['prices'].items():
        row = re.search(r'data-price="' + re.escape(model) + r'"[^>]*>([^<]+)', original)
        if not row or int(re.sub(r'\D', '', html.unescape(row[1]))) != min(prices.values()):
            raise RuntimeError('HOME_HERO_STOP: captured catalogue and current pricebook differ: ' + model)
    page, tail_hash = compose(original, hero)
    # Candidate is closed to indexing. Baseline canonical and all original SEO data stay intact.
    if not args.release:
        if re.search(r'<meta[^>]+name="robots"', page):
            page = re.sub(r'(<meta[^>]+name="robots"[^>]+content=")[^"]*', r'\g<1>noindex,nofollow', page)
        else:
            page = page.replace('</head>', '<meta name="robots" content="noindex,nofollow"></head>')
    (output / 'index.html').write_text(page, 'utf-8')
    (output / 'planirovki').mkdir(exist_ok=True)
    (output / 'planirovki/index.html').write_text((HERE / 'plans-entry.html').read_text('utf-8'), 'utf-8')
    model_hashes = {}
    for slug, model in MODEL_PAGES.items():
        relative = Path('bani') / slug / 'index.html'
        model_baseline = (args.model_baseline or HERE / 'baseline') / relative
        model_hashes[relative.as_posix()] = sha(model_baseline.read_bytes())
        model_page = compose_model(model_baseline.read_text('utf-8'),model)
        target = output / relative
        target.parent.mkdir(parents=True,exist_ok=True)
        if not args.release:
            model_page = model_page.replace('</head>', '<meta name="robots" content="noindex,nofollow"></head>')
        target.write_text(model_page,'utf-8')
    manifest = {'published': False, 'mode': 'release' if args.release else 'preview',
                'scope': 'home hero, inline model catalogue with 2D/3D and legacy plans redirect',
                'baselineHtmlSha256': sha(baseline.read_bytes()), 'originalTailSha256': tail_hash,
                'pricebookSha256': sha(args.pricebook.read_bytes()),
                'baselineModelSha256': model_hashes,
                'cataloguePreserved': True, 'sharedApplicationModulesChanged': False,
                'pricebookChanged': False, 'apiChanged': False,
                'files': [{'path': p.relative_to(output).as_posix(), 'sha256': sha(p.read_bytes()), 'bytes': p.stat().st_size}
                          for p in sorted(output.rglob('*')) if p.is_file()]}
    if args.release:
        manifest_path = ROOT / 'output/home-hero-release-manifest.json'
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', 'utf-8')
        with zipfile.ZipFile(ROOT / 'output/home-hero-release.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
            for file in manifest['files']:
                archive.write(output / file['path'], 'site/' + file['path'])
            archive.write(manifest_path, 'manifest.json')
            archive.write(HERE / 'DEPLOY.md', 'DEPLOY.md')
        print(json.dumps({'output': str(output), 'files': len(manifest['files']), 'published': False}, ensure_ascii=True))
        return
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

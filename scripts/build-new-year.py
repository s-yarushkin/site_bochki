"""Build a route-only overlay; reuse the deployed site's lead and MAX integration."""
from pathlib import Path
from PIL import Image
import shutil, json, hashlib, zipfile, re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'concepts/new-year-2027'
OUT = ROOT / 'output/new-year-2027-site'
PAGE = OUT / 'novyy-god'
(PAGE / 'assets').mkdir(parents=True, exist_ok=True)

for name in ['style.css', 'experience.js', 'lead.mjs', 'lead-contract.mjs','catalog.mjs','models.mjs','countdown.mjs']:
    text = (SOURCE / name).read_text('utf-8')
    # Source contract is importable in Node tests; deployed modules use root paths.
    text = text.replace("'../../web/lead-client.mjs'", "'/lead-client.mjs'")
    text = text.replace("'../../web/quote.mjs'", "'/quote.mjs'")
    (PAGE / name).write_text(text, encoding='utf-8')

html = (SOURCE / 'index.html').read_text('utf-8')
html = html.replace(' · Концепция</title>', '</title>')
html = html.replace('Концепция новогоднего лендинга ДачаПар:', 'Баня к Новому году от ДачаПар:')
html = html.replace('<html lang="ru">', '<html lang="ru" data-campaign="new_year_2027">')
for filename in ['winter-sauna', 'winter-parus', 'winter-viking', 'winter-house']:
    image = Image.open(SOURCE / 'assets' / (filename + '.png'))
    variants=[]
    for width in [640,960,1536]:
        resized = image.copy()
        resized.thumbnail((width,width))
        resized.save(PAGE / 'assets' / f'{filename}-{width}.webp',quality=83,method=6)
        variants.append(f'assets/{filename}-{width}.webp {resized.width}w')
    # The original generation files stay in concepts; deploy only encoded images.
    html = html.replace(f'assets/{filename}.png', f'assets/{filename}-1536.webp')
    source = f'src="assets/{filename}-1536.webp"'
    html = html.replace(source, source + f' srcset="{", ".join(variants)}" sizes="100vw"')
for name in ['manrope-cyrillic.woff2','manrope-latin.woff2','favicon.svg','OFL-Manrope.txt']:
    shutil.copy2(SOURCE / 'assets' / name,PAGE / 'assets' / name)
html = html.replace('href="assets/winter-sauna-1536.webp" as="image"', 'href="assets/winter-sauna-1536.webp" as="image" imagesrcset="assets/winter-sauna-640.webp 640w, assets/winter-sauna-960.webp 960w, assets/winter-sauna-1536.webp 1536w" imagesizes="100vw"')
book=json.loads((ROOT/'web/data/catalog-pricebook.json').read_text('utf-8'))
for model,prices in book['prices'].items():
    for size,value in prices.items():
        assert value==book['r85']['models'][model]['sizes'][size]['priceRub'], (model,size)
default_price=book['prices']['kvadro']['400']
html=re.sub(r'(<strong id="model-price">).*?(</strong>)',lambda match:match[1]+'от '+f'{default_price:,}'.replace(',',' ')+' ₽'+match[2],html)
(PAGE / 'index.html').write_text(html,encoding='utf-8')
# Remove only known obsolete generated assets from the former three-scene build.
assert PAGE.resolve().is_relative_to((ROOT/'output').resolve())
for old in ['new-year-tea','steam-room','fir-bucket']:
    for width in [640,960,1536]:
        (PAGE/'assets'/f'{old}-{width}.webp').unlink(missing_ok=True)
files=[{'path':str(file.relative_to(OUT)).replace('\\','/'),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()} for file in sorted(PAGE.rglob('*')) if file.is_file()]
manifest={'route':'/novyy-god/','published':False,'files':files,'sharedProductionModules':['/lead-client.mjs','/lead-consent.mjs','/quote.mjs','/r85-pricing.mjs','/analytics-core.mjs','/phone-mask.mjs','/r101/mobile-dialog.mjs','/data/site-settings.json','/data/catalog-pricebook.json'],'api':'/api/lead','apiChanged':False,'managerDelivery':'Existing MAX relay, unchanged','models':list(book['prices']),'priceVariants':sum(len(prices) for prices in book['prices'].values())}
(OUT / 'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
with zipfile.ZipFile(ROOT / 'output/new-year-2027-route.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(PAGE.rglob('*')):
        if file.is_file(): archive.write(file,file.relative_to(OUT))
# Handoff includes the same route ZIP plus a guarded Linux installer. No server secrets.
handoff = ROOT / 'output/new-year-2027-deploy'
handoff.mkdir(parents=True, exist_ok=True)
shutil.copy2(ROOT / 'output/new-year-2027-route.zip', handoff / 'payload.zip')
shutil.copy2(ROOT / 'scripts/new-year-remote.py', handoff / 'new-year-remote.py')
manifest['payloadSha256'] = hashlib.sha256((handoff / 'payload.zip').read_bytes()).hexdigest()
(handoff / 'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
with zipfile.ZipFile(ROOT / 'output/new-year-2027-handoff.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for name in ['payload.zip','manifest.json','new-year-remote.py']:
        archive.write(handoff / name, name)
print(json.dumps({'output':str(OUT),'files':len(files),'bytes':sum(file['bytes'] for file in files),'published':False},ensure_ascii=True))

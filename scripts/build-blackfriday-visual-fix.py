"""Only the two approved visual corrections; never rebuild the already published home."""
import hashlib,json
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'web/blackfriday/style.css';css=path.read_text('utf8');marker='/* Blend the real image edges'
if marker in css:css=css[:css.index(marker)]
css+='\n'+(ROOT/'content/blackfriday-scene.css').read_text('utf8');path.write_bytes(css.encode())
source=ROOT/'concepts/black-friday-2026/v4/assets/scene-kvadro-house.png';dest=ROOT/'web/blackfriday/assets/scene-kvadro-house.webp'
with Image.open(source) as image:
 image.save(dest,'WEBP',lossless=True,method=6)
 with Image.open(dest) as check:assert check.convert('RGB').tobytes()==image.convert('RGB').tobytes()
print(json.dumps({'visual_files':2,'pricing_changed':False,'house_source_sha256':hashlib.sha256(source.read_bytes()).hexdigest()}))

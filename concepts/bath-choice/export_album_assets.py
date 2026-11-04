"""Crop native Slides PDF pages for the site. Never redraw the diagrams."""
from pathlib import Path
import argparse, gzip, hashlib, json, math, shutil
import pypdfium2 as pdfium
from PIL import Image

HERE = Path(__file__).resolve().parent

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def matrix(element):
    t = element.get('transform')
    if t is None:
        return [1, 0, 0, 1, 0, 0]
    unit = 12700 if t.get('unit') == 'PT' else 1
    return [t.get('scaleX', 0), t.get('shearY', 0), t.get('shearX', 0),
            t.get('scaleY', 0), t.get('translateX', 0)*unit, t.get('translateY', 0)*unit]

def multiply(a, b):
    x,y,u,v,tx,ty = a
    X,Y,U,V,TX,TY = b
    return [x*X+u*Y,y*X+v*Y,x*U+u*V,y*U+v*V,x*TX+u*TY+tx,y*TX+v*TY+ty]

def entries(elements, parent=None):
    for element in elements:
        world = multiply(parent or [1,0,0,1,0,0], matrix(element))
        yield element, world
        if 'elementGroup' in element:
            yield from entries(element['elementGroup']['children'], world)

def bounds(element, world):
    size = element['size']
    w = size['width']['magnitude']*(12700 if size['width'].get('unit') == 'PT' else 1)
    h = size['height']['magnitude']*(12700 if size['height'].get('unit') == 'PT' else 1)
    a,b,c,d,x,y = world
    corners = [(a*X+c*Y+x,b*X+d*Y+y) for X,Y in [(0,0),(w,0),(w,h),(0,h)]]
    return [min(p[0] for p in corners)/12700, min(p[1] for p in corners)/12700,
            max(p[0] for p in corners)/12700, max(p[1] for p in corners)/12700]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--readback', type=Path, required=True)
    parser.add_argument('--pdf', type=Path, required=True)
    args = parser.parse_args()
    raw = json.loads(args.readback.read_text('utf8'))
    source = raw['structuredContent']
    output = HERE/'album'
    output.mkdir(parents=True, exist_ok=True)
    document = pdfium.PdfDocument(args.pdf)
    assert len(source['slides']) == len(document) and len(document) in [14,19]
    shutil.copy2(args.pdf, output/'native-album.pdf')
    # Deterministic snapshots keep native shapes and text editable/recoverable.
    with gzip.GzipFile(filename=str(output/'native-presentation.json.gz'), mode='wb', mtime=0) as stream:
        stream.write(json.dumps(source,ensure_ascii=False,separators=(',',':')).encode('utf8'))
    manifest = {'presentationId':source['presentationId'],'revisionId':source['revisionId'],
                'sourceUrl':f"https://docs.google.com/presentation/d/{source['presentationId']}/edit",
                'pdf':'native-album.pdf','pdfSha256':sha(output/'native-album.pdf'),
                'method':'Native PDF rendered at 216 dpi; crop only; lossless WebP', 'plans':[]}
    for number, slide in enumerate(source['slides'], 1):
        geometry = [bounds(e,m) for e,m in entries(slide['pageElements'])
                    if 'size' in e and 'shape' in e and e['shape']['shapeType'] != 'TEXT_BOX'
                    and not any(t.get('textRun',{}).get('content','').strip()
                                for t in e['shape'].get('text',{}).get('textElements',[]))]
        assert geometry
        page = document[number-1]
        width, height = page.get_size()
        crop = [max(0,min(b[0] for b in geometry)-40),max(0,min(b[1] for b in geometry)-40),
                min(width,max(b[2] for b in geometry)+40),min(height,max(b[3] for b in geometry)+25)]
        # The right-hand engineering legend, title, QR and footer stay outside the web crop.
        assert crop[2] < 920 and crop[1] > 100 and crop[3] < 870, (number,crop)
        scale = 3
        pixels = (math.floor(crop[0]*scale),math.floor(crop[1]*scale),
                  math.ceil(crop[2]*scale),math.ceil(crop[3]*scale))
        bitmap = page.render(scale=scale)
        image = bitmap.to_pil().convert('RGB').crop(pixels)
        path = output/f'{number:02}.webp'
        image.save(path, lossless=True, method=6)
        assert Image.open(path).convert('RGB').tobytes() == image.tobytes()
        manifest['plans'].append({'number':number,'slideId':slide['objectId'],'drawing':path.name,
                                  'cropPt':crop,'cropPx':pixels,'width':image.width,'height':image.height,
                                  'sha256':sha(path),'pixelExact':True})
        bitmap.close()
        page.close()
    document.close()
    (output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n','utf8')
    print(json.dumps({'diagrams':len(manifest['plans']),'pixelExact':True,'pdfSha256':manifest['pdfSha256']},ensure_ascii=False))

if __name__ == '__main__':
    main()

"""Add the verified calculator prices outside the original native diagrams."""
from pathlib import Path
import argparse, copy, gzip, hashlib, io, json
from export_album_assets import entries, bounds

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
LABELS = {'kvadro':'Квадро', 'kvadro-house':'Квадро Хаус', 'parus':'Парус', 'viking':'Викинг'}


def read(path):
    return json.loads(path.read_text('utf8'))


def content(element):
    return ''.join(x.get('textRun', {}).get('content', '') for x in element.get('shape', {}).get('text', {}).get('textElements', []))


def rub(cents):
    whole, fraction = divmod(cents, 100)
    return f'{whole:,}'.replace(',', '\u00a0') + (f',{fraction:02}' if fraction else '') + ' ₽'


def plan_rows(source):
    prices = read(HERE/'pricing/prices.json')['prices']
    quotes = read(HERE/'pricing/quotes.json')
    result = []
    for number, slide in enumerate(source['slides'], 1):
        flat = list(entries(slide['pageElements']))
        footer = [(e,m) for e,m in flat if content(e).startswith('Размеры в мм.')]
        caption = [(e,m) for e,m in flat if content(e).strip() and 'size' in e and bounds(e,m)[0] > 900 and bounds(e,m)[1] < 50]
        assert len(footer) == len(caption) == 1, number
        rows = [p for p in prices if p['number'] == number]
        assert rows and len(rows) <= 2
        lines = []
        for p in rows:
            prefix = LABELS[p['model']] + ': ' if len(rows)>1 else ''
            lines.append(prefix + f'В комплектации «Комфорт» - {rub(p["comfortCents"])} · в комплектации «Делюкс» - {rub(p["deluxeCents"])}')
        kinds = {x['label'].lower() for q in quotes if q['number']==number for x in q['separateAgreementItems']}
        exclusions = ['доставка', 'основание']
        if any('кровать' in s for s in kinds): exclusions.append('кровать')
        if any('диван' in s for s in kinds): exclusions.append('диван')
        if kinds: exclusions.append('сантехника')
        scope = ', '.join(exclusions).capitalize() + ' - отдельно'
        result.append({'number':number, 'slideId':slide['objectId'], 'footerId':footer[0][0]['objectId'],
                       'captionId':caption[0][0]['objectId'], 'text':'\n'.join(lines), 'scope':scope,
                       'footerBounds':[48,830 if len(lines)>1 else 848,1208,884],
                       'captionBounds':bounds(*caption[0]), 'prices':rows})
    return result


def prepare(source):
    rows = plan_rows(source)
    requests=[]
    for row, slide in zip(rows, source['slides']):
        elements = {e['objectId']:e for e,m in entries(slide['pageElements'])}
        e = elements[row['footerId']]
        width = e['size']['width']['magnitude'] / (12700 if e['size']['width']['unit']=='EMU' else 1)
        height = e['size']['height']['magnitude'] / (12700 if e['size']['height']['unit']=='EMU' else 1)
        x,y,right,bottom = row['footerBounds']
        requests.append({'updatePageElementTransform':{'objectId':row['footerId'],'applyMode':'ABSOLUTE',
                         'transform':{'scaleX':(right-x)/width,'scaleY':(bottom-y)/height,'translateX':x,'translateY':y,'unit':'PT'}}})
        for ident,text,size in [(row['footerId'],row['text'],16),(row['captionId'],row['scope'],10)]:
            requests.extend([
                {'deleteText':{'objectId':ident,'textRange':{'type':'ALL'}}},
                {'insertText':{'objectId':ident,'insertionIndex':0,'text':text}},
                {'updateTextStyle':{'objectId':ident,'textRange':{'type':'ALL'},'style':{'fontFamily':'Verdana','fontSize':{'magnitude':size,'unit':'PT'},'bold':False,'foregroundColor':{'opaqueColor':{'rgbColor':{'red':.14,'green':.25,'blue':.22}}}},'fields':'fontFamily,fontSize,bold,foregroundColor'}},
            ])
        requests.append({'updateParagraphStyle':{'objectId':row['footerId'],'textRange':{'type':'ALL'},'style':{'alignment':'START','lineSpacing':110,'spaceAbove':{'magnitude':0,'unit':'PT'},'spaceBelow':{'magnitude':0,'unit':'PT'}},'fields':'alignment,lineSpacing,spaceAbove,spaceBelow'}})
        requests.append({'updateShapeProperties':{'objectId':row['footerId'],'shapeProperties':{'contentAlignment':'MIDDLE'},'fields':'contentAlignment'}})
    payload={'presentationId':source['presentationId'],'requiredRevisionId':source['revisionId'],'requests':requests}
    (HERE/'pricing/album-price-requests.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n','utf8')
    (HERE/'pricing/album-price-evidence.json').write_text(json.dumps({'slides':rows,'prices':48,'geometryUnchanged':True},ensure_ascii=False,indent=2)+'\n','utf8')
    return rows, len(requests)


def audit(before, after):
    def stable(element):
        value=copy.deepcopy(element)
        if 'image' in value: value['image'].pop('contentUrl',None)
        return value
    rows=plan_rows(before)
    for row,a,b in zip(rows,before['slides'],after['slides']):
        aa={e['objectId']:e for e,m in entries(a['pageElements'])}
        bb={e['objectId']:e for e,m in entries(b['pageElements'])}
        assert aa.keys()==bb.keys()
        assert content(bb[row['footerId']]).strip()==row['text']
        assert content(bb[row['captionId']]).strip()==row['scope']
        for ident,element in aa.items():
            if ident not in [row['footerId'],row['captionId']] and 'elementGroup' not in element:
                assert stable(element)==stable(bb[ident]), (row['number'],ident)
    report={'pass':True,'slides':19,'pricesMatched':48,'diagramElementsUnchanged':True,'revisionId':after['revisionId']}
    (HERE/'pricing/live-album-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
    snapshot=copy.deepcopy(after)
    for slide in snapshot['slides']:
        for element,m in entries(slide['pageElements']):
            if 'image' in element: element['image'].pop('contentUrl',None)
    with gzip.GzipFile(filename=str(HERE/'album/native-presentation.json.gz'),mode='wb',mtime=0) as stream:
        stream.write(json.dumps(snapshot,ensure_ascii=False,separators=(',',':')).encode('utf8'))
    return report


def pdf(rows):
    import pypdfium2 as pdfium
    from pypdf import PdfReader, PdfWriter
    from reportlab.pdfgen import canvas
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from PIL import Image, ImageDraw
    pdfmetrics.registerFont(TTFont('VerdanaDP','C:/Windows/Fonts/verdana.ttf'))
    original=HERE/'album/native-album.pdf'
    reader=PdfReader(original); writer=PdfWriter()
    native=pdfium.PdfDocument(original)
    image=native[0].render(scale=1).to_pil().convert('RGB'); background=tuple(c/255 for c in image.getpixel((10,10)))
    for row,page in zip(rows,reader.pages):
        assert tuple(map(float,page.mediabox[2:]))==(1350,900)
        overlay=io.BytesIO(); c=canvas.Canvas(overlay,pagesize=(1350,900))
        c.setFillColorRGB(*background); c.rect(44,14,1172,58,stroke=0,fill=1)
        x,y,r,b=row['captionBounds']; c.rect(x-2,900-b-2,r-x+4,b-y+4,stroke=0,fill=1)
        c.setFillColorRGB(.14,.25,.22); c.setFont('VerdanaDP',16)
        lines=row['text'].split('\n')
        for i,line in enumerate(lines):
            assert pdfmetrics.stringWidth(line,'VerdanaDP',16)<1160,(row['number'],line)
            c.drawString(48,48-i*21 if len(lines)>1 else 30,line)
        c.setFont('VerdanaDP',10)
        assert pdfmetrics.stringWidth(row['scope'],'VerdanaDP',10)<r-x
        c.drawRightString(r,900-y-15,row['scope'])
        c.save(); page.merge_page(PdfReader(overlay).pages[0]); writer.add_page(page)
    output=ROOT/'output/pdf/ДачаПар-планировки-и-цены-2026-11-04-v4.pdf';output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('wb') as stream: writer.write(stream)
    target=HERE/'album/priced-album.pdf';target.write_bytes(output.read_bytes())
    priced=pdfium.PdfDocument(output);manifest=read(HERE/'album/manifest.json')
    contact=Image.new('RGB',(1350,5*210),'#ddd'); draw=ImageDraw.Draw(contact)
    review=ROOT/'output/review-v4';review.mkdir(exist_ok=True)
    for row,crop in zip(rows,manifest['plans']):
        n=row['number']; im=priced[n-1].render(scale=1).to_pil().convert('RGB')
        source=native[n-1].render(scale=1).to_pil().convert('RGB')
        box=tuple(round(v) for v in crop['cropPt'])
        assert source.crop(box).tobytes()==im.crop(box).tobytes(),('diagram pixels changed',n)
        im.save(review/f'priced-album-{n:02}.png')
        thumb=im.resize((270,180));left=((n-1)%5)*270;top=((n-1)//5)*210
        contact.paste(thumb,(left,top));draw.text((left+5,top+184),str(n),fill='black')
    contact.save(review/'priced-album-contact.png')
    report={'pass':True,'pages':19,'prices':48,'diagramPixelsUnchanged':True,'nativePdfSha256':hashlib.sha256(original.read_bytes()).hexdigest(),'pricedPdfSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'method':'Overlay prices and scope outside original native PDF diagrams'}
    (HERE/'pricing/pdf-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
    return report


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,default=ROOT/'.local/source-album-v4/raw-verified.json');parser.add_argument('--audit',type=Path);parser.add_argument('--pdf',action='store_true');args=parser.parse_args()
    source=read(args.source)['structuredContent']
    if args.audit: print(json.dumps(audit(source,read(args.audit)['structuredContent'])))
    elif args.pdf: print(json.dumps(pdf(plan_rows(source))))
    else:
        rows,count=prepare(source);print(json.dumps({'slides':len(rows),'prices':48,'requests':count}))

"""Verify native readback against the reviewed plan, including rotated shapes."""
from pathlib import Path
import argparse, gzip, hashlib, json
from export_album_assets import bounds, entries

HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--planned',type=Path,required=True)
args=parser.parse_args()
expected=json.loads(args.planned.read_text('utf8'))
actual=json.loads(gzip.decompress((HERE/'album/native-presentation.json.gz').read_bytes()))
before=json.loads(gzip.decompress((HERE/'album/native-presentation-before.json.gz').read_bytes()))
assert [s['objectId'] for s in before['slides']]==[s['objectId'] for s in actual['slides']]
maximum=0;count=0
for original,planned,readback in zip(before['slides'],expected['slides'],actual['slides']):
    a={e['objectId']:(e,m) for e,m in entries(planned['pageElements'])}
    b={e['objectId']:(e,m) for e,m in entries(readback['pageElements'])}
    assert a.keys()==b.keys()=={e['objectId'] for e,_ in entries(original['pageElements'])}
    for ident,(element,matrix) in a.items():
        if 'size' not in element:continue
        delta=max(abs(x-y) for x,y in zip(bounds(element,matrix),bounds(*b[ident])))
        maximum=max(maximum,delta)
        assert delta<.05,(ident,delta)
        count+=1
    def text(e):return ''.join(t.get('textRun',{}).get('content','') for t in e.get('shape',{}).get('text',{}).get('textElements',[]))
    assert {i:text(e) for i,(e,_) in a.items()}=={i:text(e) for i,(e,_) in b.items()}
manifest=json.loads((HERE/'album/manifest.json').read_text('utf8'))
assert hashlib.sha256((HERE/'album/native-album.pdf').read_bytes()).hexdigest()==manifest['pdfSha256']
assert all(hashlib.sha256((HERE/'album'/p['drawing']).read_bytes()).hexdigest()==p['sha256'] and p['pixelExact'] for p in manifest['plans'])
report={'pass':True,'revisionId':actual['revisionId'],'slides':len(actual['slides']),
        'nativeElementsChecked':count,'maximumNativeBoundsErrorPt':maximum,
        'nativeObjectIdsPreserved':True,'nativeTextPreserved':True,'nativePdfAnd14DrawingHashes':'PASS'}
(HERE/'album/audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
print(json.dumps(report,ensure_ascii=False))

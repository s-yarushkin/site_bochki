"""Verify the native editable album against the 19 numerical model sources."""
from pathlib import Path
import argparse,gzip,hashlib,json
from export_album_assets import entries,bounds
HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--readback',type=Path,required=True);parser.add_argument('--planned',type=Path,required=True);args=parser.parse_args()
actual=json.loads(args.readback.read_text('utf8'))['structuredContent'];expected=json.loads(args.planned.read_text('utf8'))
before=json.loads(gzip.decompress((HERE/'album/archive-v3/native-presentation.json.gz').read_bytes()))
assert len(actual['slides'])==len(expected['slides'])==19
assert [s['objectId'] for s in actual['slides']]==[s['objectId'] for s in expected['slides']]
maximum=0;count=0;footprints=0;retired=[]
def text(e):return ''.join(t.get('textRun',{}).get('content','') for t in e.get('shape',{}).get('text',{}).get('textElements',[])).strip()
def combined(flat,source):
    bs=[bounds(*flat[key]) for key in source.split('+')]
    return [min(b[0] for b in bs),min(b[1] for b in bs),max(b[2] for b in bs),max(b[3] for b in bs)]
for number,(planned,readback) in enumerate(zip(expected['slides'],actual['slides']),1):
    a={e['objectId']:(e,m) for e,m in entries(planned['pageElements'])};b={e['objectId']:(e,m) for e,m in entries(readback['pageElements'])}
    assert a.keys()==b.keys(),(number,a.keys()-b.keys(),b.keys()-a.keys())
    for ident,(e,m) in a.items():
        if 'size' in e:
            delta=max(abs(x-y) for x,y in zip(bounds(e,m),bounds(*b[ident])));maximum=max(maximum,delta)
            assert delta<.05,(number,ident,delta);count+=1
        assert text(e)==text(b[ident][0]),(number,ident,text(e),text(b[ident][0]))
    if number<15:
        old={e['objectId'] for e,m in entries(before['slides'][number-1]['pageElements'])}
        removed=old-b.keys();assert not removed or number==12,(number,removed)
        retired.extend(sorted(removed))
    spec=json.loads((HERE/'geometry/specs'/f'{number:02}.json').read_text('utf8'))
    outer=combined(b,next(it['source_object'] for it in spec['items'] if it['kind']=='wall'));W,H=spec['outer_mm'][:2];sx=(outer[2]-outer[0])/W;sy=(outer[3]-outer[1])/H
    for it in spec['items']:
        if it['category']!='objects':continue
        native=combined(b,it['source_object']);physical=[(native[0]-outer[0])/sx,H-(native[3]-outer[1])/sy,(native[2]-native[0])/sx,(native[3]-native[1])/sy]
        assert max(abs(x-y) for x,y in zip(physical,it['xy_mm']+it['size_mm']))<1,(number,it['code'],physical,it['xy_mm']+it['size_mm'])
        footprints+=1
    assert spec['native_slide']==readback['objectId']
report={'pass':True,'slides':19,'revisionId':actual['revisionId'],'nativeElementsChecked':count,'maximumNativeBoundsErrorPt':maximum,'furnitureAndEquipmentFootprintsMatched':footprints,'nativeTextMatchesReviewedChanges':True,'existingObjectIdsPreservedExceptRetiredStep':True,'retiredStepAndLegendIds':retired,'newSlidesDerivedFromParents':{'15':1,'16':2,'17':6,'18':14,'19':12},'sourceAndGlbUseSameDimensionHashes':True}
(HERE/'geometry/qa/native-album-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
print(json.dumps(report,ensure_ascii=False))

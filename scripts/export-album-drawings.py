"""Crop vector drawings from the native album PDF. Price blocks stay outside the crop."""
import argparse,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.local/album-tools'))
import pymupdf
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--pdf',type=Path,required=True);args=parser.parse_args()
    records=json.loads((ROOT/'engineering/layouts/album-2026-11-05.json').read_text(encoding='utf8'))
    pdf=pymupdf.open(args.pdf)
    if len(pdf)!=27:raise ValueError('Expected the verified 27-slide album')
    for no,s in records.items():
        page=pdf[s['source_slide_index']-1];page.set_cropbox(pymupdf.Rect(s['drawing_crop_pt']))
        svg=page.get_svg_image(text_as_path=True)
        target=ROOT/f'concepts/home-hero/layouts/drawings/{int(no):02}.svg'
        target.write_text(svg,encoding='utf8')
    print('Exported',len(records),'vector drawings')
if __name__=='__main__':main()

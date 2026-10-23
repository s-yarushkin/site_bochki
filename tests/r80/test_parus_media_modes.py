#!/usr/bin/env python3
"""R8.0 model-page upgrade regression: Parus media may already be published on model page.
Run: python3 tests/test_parus_media_modes.py (stdlib only; no live writes).
"""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import transform

BASE='''<!doctype html><html lang="ru"><head><title>Парус</title></head><body><main><h1>Готовая баня Парус</h1><p class="lead">Парус</p><h2>Размеры и базовые цены</h2><div class="table-scroll"><table><tr><td>415000</td></tr></table></div></main></body></html>'''
PHOTO='<section class="pp-section pp-examples" id="parus-photos">'+''.join('<article class="pp-card">Фотография</article>' for _ in range(3))+'</section>'
PLANS='<section class="pp-section pp-layouts" id="parus-layouts">'+''.join('<button data-pp-layout="p'+str(i)+'"></button>' for i in range(5))+'</section>'
PARTS={'parus-photos':PHOTO,'parus-layouts':PLANS}
IMPORTS='<link rel="stylesheet" href="/parus-media/widget.css?v=rc2"><script type="module" src="/parus-media/widget.mjs?v=rc2"></script>'

for case,src in [
    ('legacy_missing',BASE),
    ('existing_both',BASE.replace('</head>',IMPORTS+'</head>').replace('<h2>Размеры',PHOTO+PLANS+'<h2>Размеры')),
]:
 result=transform.model_page(src,'parus',PARTS)
 assert result.count('id="photos"')==1 and result.count('id="plans"')==1,case
 assert result.count('id="parus-photos"')==1 and result.count('id="parus-layouts"')==1,case
 assert result.count('class="pp-card"')==3 and result.count('data-pp-layout=')==5,case
 assert result.count('/parus-media/widget.css')==1 and result.count('/parus-media/widget.mjs')==1,case
 assert result.count('id="r732-size-prices"')==1,case
 print('R80_MEDIA_MODE='+case+'; PASS',flush=True)

for case,src in [
 ('partial_missing_layout',BASE.replace('<h2>Размеры',PHOTO+'<h2>Размеры')),
 ('partial_missing_photos',BASE.replace('<h2>Размеры',PLANS+'<h2>Размеры')),
 ('duplicate_id',BASE.replace('<h2>Размеры',PHOTO.replace('id="parus-photos"','id="parus-photos" id="parus-photos"')+PLANS+'<h2>Размеры')),
 ('incomplete_import',BASE.replace('</head>','<link rel="stylesheet" href="/parus-media/widget.css"></head>').replace('<h2>Размеры',PHOTO+PLANS+'<h2>Размеры')),
]:
 try:transform.model_page(src,'parus',PARTS)
 except RuntimeError as exc:assert str(exc).startswith('PARUS_'),(case,exc)
 else:raise AssertionError('Unsafe input accepted: '+case)
 print('R80_MEDIA_MODE='+case+'; SAFE_ABORT',flush=True)
print('R80_PARUS_MEDIA_MODE_REGRESSION=PASS; CASES=6',flush=True)

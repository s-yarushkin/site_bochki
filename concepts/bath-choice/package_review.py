"""Package the isolated prototype and all editable sources. Never deploy."""
from pathlib import Path
import hashlib,json,shutil,zipfile

HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
site=ROOT/'output/bath-choice-prototype';cache=ROOT/'.local/bath-choice-cache'
bundle=ROOT/'output/bath-choice-review-v4';bundle.mkdir(parents=True,exist_ok=True)
shutil.copytree(site,bundle/'site',dirs_exist_ok=True)
shutil.copytree(cache,bundle/'cache',dirs_exist_ok=True)
shutil.copy2(HERE/'preview.mjs',bundle/'preview.mjs')
shutil.copy2(ROOT/'output/bath-choice-manifest.json',bundle/'site-manifest.json')
shutil.copytree(HERE,bundle/'sources/bath-choice',dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','*.pyc','*.blend1','pilot'))
shutil.copytree(ROOT/'output/review-v4',bundle/'verification',dirs_exist_ok=True)
note='''# ДачаПар: полный рабочий просмотр v4

Основной сайт не менялся. Для просмотра: `node preview.mjs`, затем
http://127.0.0.1:4192/. Нужен Node.js 24+. Завершение: Ctrl+C.

Готовы 19 схем и настоящих GLB для всех 20 сочетаний модели и размера.
В каждой модели разные материалы стен, пола и мебели и подвижный нижний полок.
Есть 19 редактируемых сцен Blender, размеры, спецификации и отчёты геометрии.
Схемы сайта являются точными обрезками нативного альбома; отдельно не рисуются.

Калькулятор и 19 листов Google Slides уже содержат 48 расчётов для 24 сочетаний
модели и планировки. Суммы сверены до копейки. В источниках сохранены ведомости,
правила Сергея, формулы и PDF с ценами. Кровать, диван и отдельная сантехника
согласуются отдельно. Кухня 37 900 ₽ включает мойку и смеситель.

Карточки прототипа используют актуальные базовые цены калькулятора.
Точные цены отдельных планировок в публичную страницу пока не добавлены.
Исходный R117 сохранён; автоматическое сопоставление его старых 41 вариантов
с новыми ведомостями не включалось.

Галерея компактная, крупные фото открываются в окне. Возвращена исходная
последовательность фотографий «У каждого вечера свой ритуал».

Каталог sources содержит внутренние тарифы и рабочие документы.
На публичный хостинг его копировать нельзя. Для сайта предназначена папка site.
Это пакет разработки: установщика, команд публикации и доступа к серверу нет.
Заявки и API заблокированы, аналитика отключена. Реальных сообщений MAX нет.
'''
(bundle/'README.md').write_text(note,'utf8')
files=[]
for file in sorted(bundle.rglob('*')):
    if file.is_file() and file!=bundle/'manifest.json':
        files.append({'path':file.relative_to(bundle).as_posix(),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bytes':file.stat().st_size})
manifest={'published':False,'deploymentReady':False,'geometryCount':19,'modelSizePairs':20,'layoutPrices':48,'files':files}
(bundle/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n','utf8')
archive=ROOT/'output/ДачаПар-планировки-3D-цены-2026-11-04-v4.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as target:
    for file in sorted(bundle.rglob('*')):
        if file.is_file():target.write(file,file.relative_to(bundle).as_posix())
with zipfile.ZipFile(archive) as check:assert check.testzip() is None
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix('.zip.sha256').write_text(digest+'  '+archive.name+'\n','utf8')
print(json.dumps({'archive':str(archive),'files':len(files)+1,'bytes':archive.stat().st_size,'sha256':digest,'published':False},ensure_ascii=False))

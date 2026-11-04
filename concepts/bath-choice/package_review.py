"""Package an isolated local preview with editable pilot sources. No deploy tools."""
from pathlib import Path
import hashlib,json,shutil,zipfile

HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
site=ROOT/'output/bath-choice-prototype';cache=ROOT/'.local/bath-choice-cache'
bundle=ROOT/'output/bath-choice-review-v3';bundle.mkdir(parents=True,exist_ok=True)
shutil.copytree(site,bundle/'site',dirs_exist_ok=True)
shutil.copytree(cache,bundle/'cache',dirs_exist_ok=True)
shutil.copy2(HERE/'preview.mjs',bundle/'preview.mjs')
shutil.copy2(ROOT/'output/bath-choice-manifest.json',bundle/'site-manifest.json')
shutil.copytree(HERE/'pilot',bundle/'editable-pilot',dirs_exist_ok=True)
shutil.copytree(HERE/'album',bundle/'native-album',dirs_exist_ok=True)
shutil.copytree(ROOT/'output/layout-pricing-review',bundle/'pricing-review',dirs_exist_ok=True)
note='''# ДачаПар — рабочий просмотр

Это отдельный прототип. На основной сайт он не установлен.

Откройте терминал в этой папке и выполните `node preview.mjs`, затем откройте
http://127.0.0.1:4192/. Нужен Node.js 24 или новее. Завершение — Ctrl+C.

После выбора модели сначала открывается галерея из шести фотографий.
Под ней — размеры и две комплектации с одной кнопкой сравнения.
План открывается крупно, с увеличением и описанием помещений обычным языком.
Вернулись фотографии камней, веника, отдыха на полке и чайный финал.
После сроков и установки показано сопровождение: новости с производства,
персональные видео скрытых работ и помощь менеджера.

«Квадро» 4 м открывает новый GLB с кнопкой
«Задвинуть полок». В editable-pilot сохранены сцена Blender, размеры, GLB,
архивный SVG и отчёты проверки. Во время полного хода геометрических пересечений нет.
Все 14 отображаемых схем взяты напрямую из native Google Slides PDF.
В native-album находятся PDF, точные изображения, нативные снимки и обратные
запросы для отката согласованных поправок. Отдельная SVG-отрисовка в интерфейсе
больше не используется.

В прототипе пока 13 из 20 сочетаний имеют готовую геометрию. Для остальных
показана помощь с планировкой, схема другого размера не подставляется.
Перед выпуском оставшиеся размеры будут заполнены.

Карточки пока показывают действующий публичный прайс. Выявленное расхождение
«Делюкса» с актуальным калькулятором и квизом разобрано в pricing-review/README.md.
Там же фактические составы 14 схем и черновые расчёты обеих комплектаций.
Это рабочие сметы, конечные цены ещё требуют подтверждения состава и тарифов.

Реальные заявки в этом просмотре отправить нельзя; аналитика отключена.
Отправка сообщений в мессенджеры не проверялась. Старые отдельные страницы
доступны через чтение основного сайта; основной сценарий и 3D собраны локально.
'''
(bundle/'README.md').write_text(note,'utf8')
files=[]
for file in sorted(bundle.rglob('*')):
    if file.is_file():files.append({'path':file.relative_to(bundle).as_posix(),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bytes':file.stat().st_size})
manifest={'published':False,'deploymentReady':False,'files':files}
(bundle/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf8')
archive=ROOT/'output/ДачаПар-галерея-планы-и-забота-2026-11-04-v3.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as target:
    for file in sorted(bundle.rglob('*')):
        if file.is_file():target.write(file,file.relative_to(bundle).as_posix())
with zipfile.ZipFile(archive) as check:assert check.testzip() is None
print(json.dumps({'archive':str(archive),'files':len(files)+1,'bytes':archive.stat().st_size,'published':False},ensure_ascii=False))

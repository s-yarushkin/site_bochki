"""Package public candidate, authoring source and review evidence only."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import hashlib,json,sys
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parents[1]
dest=root.parent/'ДачаПар-R101-проект-и-сайт.zip'
with ZipFile(dest,'w',ZIP_DEFLATED,compresslevel=6) as z:
 for f in (root/'output/r101-site').rglob('*'):
  if f.is_file():z.write(f,'site/'+f.relative_to(root/'output/r101-site').as_posix())
 for f in (root/'r101').rglob('*'):
  if f.is_file() and '__pycache__' not in str(f):z.write(f,'source/r101/'+f.relative_to(root/'r101').as_posix())
 for n in ['r101-architecture.md','r101-funnel.md','r101-v3-funnel-review.md','r101-v3-decisions.md','r101-release.md','r101-seo-geo.md']:z.write(root/'docs'/n,'docs/'+n)
 release=json.loads((root/'output/r101-release.json').read_text('utf-8'))
 for f in Path(release['path']).iterdir():
  if f.is_file():z.write(f,'deployment/'+f.name)
 for name in ['r101-inventory.py','r101-release.py','r101-remote.py','r101-smoke.mjs']:z.write(root/'scripts'/name,'source/scripts/'+name)
 for f in (root/'scrollcraft/builds/dachapar-r101').glob('*'):z.write(f,'docs/'+f.name)
 for f in (root/'output/qa').glob('r101-*.png'):z.write(f,'qa/'+f.name)
 z.write(root/'output/r101-manifest.json','manifest.json')
 z.write(root/'output/r101-search-audit.json','docs/search-audit.json')
 z.write(root/'output/qa/r101-final-mobile-audit.json','qa/r101-final-mobile-audit.json')
 z.writestr('qa/README.txt','Актуальная редакция: r101-final-*.png, измерения r101-final-mobile-audit.json. Остальные снимки сохранены как история.\n')
 z.write(root.parent/'СТАТУС-R101.md','СТАТУС-R101.md')
 z.writestr('README.txt','ДачаПар R101, версия для просмотра.\nsite/ — готовая публичная сборка, запускать HTTP-сервером из этого корня.\ndocs/ — архитектура, карта сайта, CJM, CTA и воронка.\nsource/r101/ — исходники новой оболочки; повторная сборка использует web/ исходного репозитория.\nqa/ — снимки проверенной версии.\nКандидат закрыт от индексирования. Не копировать на production без отдельного выпуска.\nКабинет, API и реальные уведомления не изменялись.\n')
result={'zip':str(dest),'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()}
(root/'output/r101-package.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))

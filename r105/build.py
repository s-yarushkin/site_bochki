"""Buyer-facing model benefits; preserve protected prices and R104 analytics."""
import sys,subprocess,shutil,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
subprocess.run([sys.executable,str(ROOT/'r104/build.py')],check=True)
OUT=ROOT/'output/r105-site'
shutil.copytree(ROOT/'output/r104-site',OUT,dirs_exist_ok=True)
replacements={
 'Особенности<br/>четырёх моделей':'Планировки<br/>под ваш отдых',
 'Центральный вход и ровный пол уже включены в Комфорт.':'Компактная баня с отдельной парной и комнатой отдыха. Подберём расстановку полков и мебели под ваши привычки.',
 'Удобный центральный вход уже включён в Комфорт.':'Корпус шириной 2,4 метра даёт больше свободы для планировки парной и комнаты отдыха.',
 'Арочный центральный вход уже включён.':'Парная и отдельная комната отдыха в корпусе шириной 2,4 метра. Поможем выбрать планировку для вашей семьи.',
 'Арочный центральный вход и корпус шириной 2,4 метра':'Парная и комната отдыха в корпусе шириной 2,4 метра',
 'Корпус шириной 2,4 метра с прямыми стенами и центральным входом':'Прямые стены и ширина 2,4 метра для удобной расстановки полков и мебели',
 'Больше места для отдельных помещений и отдыха с семьёй или гостями':'Больше места для отдельных помещений: помывочной, просторной комнаты отдыха или спальни',
 'Больше места для отдельных помещений и отдыха':'Больше места для отдельных помещений: помывочной, просторной комнаты отдыха или спальни',
}
changed=[]
for f in OUT.rglob('*.html'):
 s=f.read_text('utf-8')
 if 'data-release="R104-CANDIDATE"' not in s:continue
 original=s
 for old,new in replacements.items():s=s.replace(old,new)
 s=s.replace('data-release="R104-CANDIDATE"','data-release="R105-CANDIDATE"')
 if s!=original:changed.append(str(f.relative_to(OUT)))
 f.write_text(s,encoding='utf-8')
m=json.loads((ROOT/'output/r104-manifest.json').read_text('utf-8'))
m.update(release='R105-CANDIDATE',changed=changed)
(ROOT/'output/r105-manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
print('R105 model-benefit candidate ready; no pricing or lead changes')

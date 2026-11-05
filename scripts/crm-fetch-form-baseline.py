import io,subprocess,tarfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
names=['choice/home-hero/model-request.mjs','home-hero/model-request.mjs','privacy.html','consent.html','phone-mask.mjs','data/site-settings.json']
data=subprocess.check_output(['ssh','-o','BatchMode=yes','dachapar','tar -czf - -C /srv/sites/dachapar-preview/current '+' '.join(names)],timeout=90)
with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
 for name in names:
  content=archive.extractfile(name).read();backup=root/'.local/crm-audit/web-baseline'/name;backup.parent.mkdir(parents=True,exist_ok=True)
  if not backup.exists():backup.write_bytes(content)
  if name.endswith('model-request.mjs'):
   target=root/('concepts/choice-album/'+name if name.startswith('choice/') else 'concepts/'+name);target.parent.mkdir(parents=True,exist_ok=True)
   source=content.decode('utf-8');signature="  const dialog = document.createElement('dialog');"
   assert source.count(signature)==1
   source="import {journeyFormOpened} from '/journey-tracker.mjs?v=crm-20261105';\n"+source.replace(signature,"  journeyFormOpened(opener,"+("reason??'quote'" if name.startswith('choice/') else "'quote'")+");\n"+signature)
   target.write_text(source,encoding='utf-8')
print('Public form baseline preserved; only analytics hook inserted. No credentials downloaded.')

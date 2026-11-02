"""Validate manual Direct copy and package the kit. Never edits image pixels."""
from pathlib import Path
import csv
import html
import json
import struct
import zipfile

PACKAGE = Path(__file__).resolve().parent
ROOT = PACKAGE.parents[1]
data = json.loads((PACKAGE / 'pack.json').read_text('utf-8'))


def validate_text(text, limit, label):
    assert len(text) <= limit, f'{label}: {len(text)} > {limit}'
    assert '\n' not in text and '\t' not in text, label


for ad in data['ads']:
    for key, limit in [('title', 56), ('title2', 30), ('text', 81)]:
        validate_text(ad[key], limit, ad['id'] + '/' + key)
    assert max(map(len, ad['title'].split())) <= 22
    assert max(map(len, ad['title2'].split())) <= 22
    assert max(map(len, ad['text'].split())) <= 23
for value in data['clarifications']:
    validate_text(value, 25, 'clarification')
assert len(' '.join(data['clarifications'])) <= 76
for item in data['sitelinks']:
    validate_text(item['title'], 30, 'sitelink/title')
    validate_text(item['description'], 60, 'sitelink/description')
    assert not any(char in item['title'] + item['description'] for char in '!?[]')
    anchor = item['url'].split('#')[-1]
    assert f'id="{anchor}"' in (ROOT / 'concepts/new-year-2027/index.html').read_text('utf-8')
validate_text(data['displayPath'], 20, 'display path')
for group in data['groups']:
    assert all(len(phrase.split()) <= 7 for phrase in group['keywords'])
book = json.loads((ROOT / 'web/data/catalog-pricebook.json').read_text('utf-8'))
assert book['prices']['kvadro']['400'] == 410000, 'Recheck the price in S02-A before launch'
images = []
for path in sorted((PACKAGE / 'assets').glob('*.png')):
    header = path.read_bytes()[:24]
    assert header[:8] == b'\x89PNG\r\n\x1a\n'
    width, height = struct.unpack('>II', header[16:24])
    assert min(width, height) >= 450 and max(width, height) <= 5000
    assert path.stat().st_size < 10_000_000
    images.append({'file': path.name, 'width': width, 'height': height, 'bytes': path.stat().st_size})
assert len(images) == 4
assert all((PACKAGE / ad['image']).is_file() for ad in data['ads'] if ad['image'])

lines = ['# Поля для ручного ввода в Директ', '',
         '02.11.2026. Цели и суммы не включены. Порядок настройки — в README.md.', '']
cards = []


def section(title, fields):
    lines.extend(['## ' + title, ''])
    entries = []
    for name, value in fields.items():
        if isinstance(value, list):
            value = '\n'.join(value)
        lines.extend(['**' + name + '**', '', '```text', value, '```', ''])
        entries.append('<div class="field"><div class="label">' + html.escape(name) +
                       '<button type="button">Скопировать</button></div><pre>' + html.escape(value) + '</pre></div>')
    cards.append('<section><h2>' + html.escape(title) + '</h2>' + ''.join(entries) + '</section>')


section('Общие поля кампаний', data['commonSettings'])
section('География каждой группы', {'Выбрать все территории': data['regions']})
for campaign in data['campaigns']:
    section(campaign['name'], {
        'Название': campaign['name'], 'Ссылка на сайт': data['landing'],
        'Места показа': campaign['placements'], 'Параметры URL кампании': campaign['urlParameters'],
        'Минус-фразы кампании — через запятую': ', '.join(campaign['negativePhrases']) or 'Оставить пустым',
    })
section('Общие поля групп', data['groupCommon'])
for group in data['groups']:
    section(group['name'], {'Название группы': group['name'], 'Настройка условий': group['targeting'],
                           'Ключевые фразы': group['keywords'] or ['Оставить пустым'],
                           'Интересы и привычки': group['interests'],
                           **({'Слова для поиска интересов': group['interestSearchSeeds']}
                              if group.get('interestSearchSeeds') else {})})
section('Уточнения — отдельными элементами', {str(i + 1): value for i, value in enumerate(data['clarifications'])})
for i, item in enumerate(data['sitelinks']):
    section(f'Быстрая ссылка {i + 1}', {'Заголовок': item['title'], 'Описание': item['description'], 'URL': item['url']})
section('Общие поля объявления', data['adCommon'])
for ad in data['ads']:
    section(ad['id'] + ' → ' + ad['group'], {
        'Внутренняя метка (если поле есть)': ad['id'],
        'Заголовок': ad['title'], 'Дополнительный заголовок': ad['title2'], 'Текст': ad['text'],
        'Ссылка на сайт': data['landing'],
        'Изображение': ad['image'] or 'Для обычного поискового показа изображение не требуется',
    })
lines.extend(['## Размеры проверенных изображений', '', '| Файл | Пиксели | Объём |', '|---|---|---|'])
lines.extend(f"| {i['file']} | {i['width']} × {i['height']} | {i['bytes']:,} bytes |" for i in images)
(PACKAGE / 'COPY-PASTE.md').write_text('\n'.join(lines) + '\n', 'utf-8')

with (PACKAGE / 'ads.tsv').open('w', encoding='utf-8-sig', newline='') as stream:
    writer = csv.writer(stream, delimiter='\t')
    writer.writerow(['ID', 'Группа', 'Заголовок', 'Дополнительный заголовок', 'Текст',
                     'Ссылка', 'Изображение', 'Знаков заголовка', 'Знаков текста'])
    for ad in data['ads']:
        writer.writerow([ad['id'], ad['group'], ad['title'], ad['title2'], ad['text'],
                         data['landing'], ad['image'] or '', len(ad['title']), len(ad['text'])])
with (PACKAGE / 'quick-links.tsv').open('w', encoding='utf-8-sig', newline='') as stream:
    writer = csv.writer(stream, delimiter='\t')
    writer.writerow(['Заголовок', 'Описание', 'URL'])
    writer.writerows([x['title'], x['description'], x['url']] for x in data['sitelinks'])

gallery = ''.join('<figure><img src="assets/' + html.escape(i['file']) + '" alt="Рекламная визуализация бани"><figcaption>' +
                  html.escape(i['file']) + '</figcaption></figure>' for i in images)
page = '''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ДачаПар · Поля для Яндекс Директа</title><style>
*{box-sizing:border-box}body{margin:0;background:#0e1c29;color:#f9f1dd;font:16px/1.6 system-ui,sans-serif}
main{max-width:1020px;margin:auto;padding:38px 22px 80px}h1{font-size:clamp(30px,5vw,48px);line-height:1.1}h2{font-size:25px;line-height:1.2}
section{margin:28px 0;padding:26px;background:#19332f;border-radius:16px}a{color:#f3c573}p{max-width:850px}
.field{margin:18px 0}.label{display:flex;align-items:center;gap:14px;justify-content:space-between;color:#d4dfd7;font-size:14px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.6 system-ui,sans-serif;background:#0d2423;border-radius:8px;padding:16px;margin:8px 0}
button{flex-shrink:0;background:#edc971;color:#172e29;border:0;border-radius:6px;padding:10px 14px;font:inherit;cursor:pointer}
.gallery{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%;border-radius:12px}figcaption{font-size:12px;overflow-wrap:anywhere}
@media(max-width:600px){section{padding:18px}.gallery{grid-template-columns:1fr}.label{align-items:flex-start}button{padding:8px}}
</style><main><h1>ДачаПар · Новый год в своей бане</h1>
<p>Готовые поля для ручного ввода в Яндекс Директ. Цели и суммы вы задаёте самостоятельно.
Кнопка копирования переносит только значение поля. Рекламные кампании этот файл не создаёт и не запускает.</p>
<p><a href="README.md">Полная инструкция, порядок настройки и ссылки на справку Яндекса</a> · <a href="ads.tsv">Все объявления в таблице</a></p>
<p>Сначала опубликуйте и проверьте лендинг. Пакет не подтверждает дату установки: в текстах предлагаем уточнить срок у менеджера.</p>
<div class="gallery">''' + gallery + '</div>' + ''.join(cards) + '''</main><script>
document.querySelectorAll('.field button').forEach(button=>button.addEventListener('click',async()=>{
 const value=button.closest('.field').querySelector('pre').textContent;
 try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(value)}else{
  const field=document.createElement('textarea');field.value=value;field.style.position='fixed';field.style.left='-9999px';document.body.append(field);
  field.select();const ok=document.execCommand('copy');field.remove();if(!ok)throw Error('copy');}
  button.textContent='Скопировано';setTimeout(()=>button.textContent='Скопировать',1500);
 }catch{button.textContent='Выделите текст ниже';setTimeout(()=>button.textContent='Скопировать',2500)}
}));
</script></html>'''
(PACKAGE / 'ИНСТРУКЦИЯ.html').write_text(page, 'utf-8')
out = ROOT / 'output'
out.mkdir(exist_ok=True)
with zipfile.ZipFile(out / 'new-year-2027-direct-kit.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(PACKAGE.rglob('*')):
        if path.is_file() and '__pycache__' not in path.parts:
            archive.write(path, Path('new-year-2027-direct') / path.relative_to(PACKAGE))
print(json.dumps({'ads': len(data['ads']), 'groups': len(data['groups']), 'images': images,
                  'copyValidated': True, 'zip': str(out / 'new-year-2027-direct-kit.zip')}, ensure_ascii=False))

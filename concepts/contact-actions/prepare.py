"""Prepare a contact-only overlay against the verified public release."""
import hashlib
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent
CURRENT = Path('/srv/sites/dachapar-preview/current')
OLD = CURRENT.parent/'releases/NY-SELECTOR-71577ff56bdf629d'
NUMBER = '+79517349999'
TEL = 'tel:' + NUMBER
CALL = f'<a class="contact-action" href="{TEL}" data-contact-call>Позвонить</a>'
DIALOG = f'''<dialog id="contact-phone-dialog" aria-labelledby="contact-phone-title">
<form method="dialog"><button type="submit" aria-label="Закрыть">×</button></form>
<h2 id="contact-phone-title">Позвонить в ДачаПар</h2>
<a href="{TEL}">+7 (951) 734-99-99</a>
</dialog>'''
PHONE_LINK = re.compile(r'<a\b(?P<attrs>[^>]*\bhref="tel:\+79517349999"[^>]*)>.*?</a>', re.S)
VISIBLE_NUMBER = re.compile(r'\+7\s*\(?951\)?[\s-]*734[\s-]*99[\s-]*99')
HEADER_PHONE = re.compile(r'<a\b[^>]*class="phone"[^>]*\bhref="tel:\+79517349999"[^>]*>.*?</a>', re.S)
NY_HEADER_LEAD = re.compile(r'<button\b[^>]*class="cta header-cta"[^>]*data-open-lead[^>]*>.*?</button>', re.S)

def patch(source):
    is_inquiry = 'id="inquiry-dialog"' in source
    is_holiday = 'id="lead-dialog"' in source and 'data-open-lead' in source
    assert is_inquiry or is_holiday
    header, = HEADER_PHONE.findall(source)
    callback_attr = 'data-inquiry="selection_help"' if is_inquiry else 'data-open-lead'
    callback = f'<button type="button" class="contact-action" {callback_attr} data-contact-callback>Заказать звонок</button>'
    if is_holiday:
        source, count = NY_HEADER_LEAD.subn('', source)
        assert count == 1
    placeholder = '<!-- dp-primary-contact -->'
    source = source.replace(header, placeholder, 1)
    def replace_phone(match):
        attrs = match['attrs']
        attrs = re.sub(r'\s+aria-label="[^"]*"', '', attrs)
        return f'<a{attrs} data-contact-call>Позвонить</a>'
    source = PHONE_LINK.sub(replace_phone, source)
    source = source.replace('Свяжитесь с ДачаПар: +7 (951) 734-99-99.', 'Свяжитесь с ДачаПар.')
    source = source.replace('Или позвоните нам <a', '<a')
    source = source.replace('Поможем выбрать баню по телефону <a', 'Поможем выбрать баню. <a')
    source = source.replace('Чтобы обсудить баню к Новому году, позвоните <a', 'Обсудим баню к Новому году. <a')
    source = source.replace(placeholder, f'<span class="phone contact-actions">{CALL}{callback}</span>', 1)
    source = source.replace('</head>', '<link rel="stylesheet" href="/contact-actions.css?v=20261106"></head>', 1)
    return source.replace('</body>', DIALOG+'\n<script type="module" src="/contact-actions.mjs?v=20261106"></script></body>', 1)

def main():
    assert CURRENT.resolve() == OLD
    overlay = {}
    for path in OLD.rglob('*.html'):
        rel = path.relative_to(OLD).as_posix()
        source = path.read_text('utf8')
        if not PHONE_LINK.search(source):
            continue
        updated = patch(source)
        assert updated != source and 'id="contact-phone-dialog"' in updated
        without_scripts = re.sub(r'<script\b.*?</script>', '', updated.split(DIALOG)[0], flags=re.S)
        assert not VISIBLE_NUMBER.search(re.sub(r'<[^>]+>', '', without_scripts)), rel
        overlay[rel] = updated
    assert {'index.html','kontakty/index.html','novyy-god/index.html'} <= overlay.keys()
    for name in ['contact-actions.css', 'contact-actions.mjs']:
        overlay[name] = (BASE/name).read_text('utf-8-sig')
    manifest = {'baseline':str(OLD),'before':{},'files':{}}
    sha = lambda data: hashlib.sha256(data).hexdigest()
    for rel, text in overlay.items():
        dest = BASE/'site'/rel
        dest.parent.mkdir(parents=True,exist_ok=True)
        data = text.encode('utf8')
        dest.write_bytes(data)
        original = OLD/rel
        manifest['before'][rel] = sha(original.read_bytes()) if original.is_file() else None
        manifest['files'][rel] = sha(data)
    data = (json.dumps(manifest,sort_keys=True,indent=2)+'\n').encode()
    (BASE/'manifest.json').write_bytes(data)
    print('PREPARED',len(overlay),sha(data)[:16])

if __name__=='__main__':
    main()

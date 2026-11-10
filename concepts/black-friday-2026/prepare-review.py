"""Approval-only campaign arithmetic. Does not write to web/, API or production."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
source=ROOT/'.local/package-update-20261109/baseline/web/choice/catalog-pricebook.json'
manifest=json.loads((ROOT/'.local/package-layouts-20261110/deployment.json').read_text('utf8'))
digest=hashlib.sha256(source.read_bytes()).hexdigest()
assert digest==manifest['baseline']['web_files']['choice/catalog-pricebook.json']
book=json.loads(source.read_text('utf8'))
rules={'kvadro':{'comfort':(20000,25000),'deluxe':(30000,35000)},'parus':{'comfort':(25000,30000),'deluxe':(30000,35000)},'viking':{'comfort':(25000,30000),'deluxe':(30000,35000)},'kvadro-house':{'comfort':(40000,45000),'deluxe':(50000,55000)}}
names={'kvadro':'Квадро','parus':'Парус','viking':'Викинг','kvadro-house':'Квадро Хаус'}
sizes={'4x4':'4×4 м','5x4':'4×5 м','6x4':'4×6 м','6x5':'5×6 м','6x6':'6×6 м'}
rows=[]
for model in names:
 for size,row in book['r85']['models'][model]['sizes'].items():
  for package in ['comfort','deluxe']:
   current=int(row['priceRub'] if package=='comfort' else row['deluxe']['priceRub']);uplift,discount=rules[model][package]
   reference=current+uplift;bf=reference-discount
   assert bf==current-5000
   rows.append({'model':model,'modelName':names[model],'size':size,'sizeLabel':sizes.get(size,row['label']),'package':package,'packageName':'Комфорт' if package=='comfort' else 'Делюкс','currentDisplayedPriceRub':current,'proposedReferencePriceRub':reference,'blackFridayDiscountRub':discount,'blackFridayPriceRub':bf,'additionalDeluxeDiscountRub':0,'finalPriceRub':bf,'totalDiscountFromProposedReferenceRub':discount})
data={'status':'CONCEPT_FOR_APPROVAL_NOT_PUBLISHED','campaign':'black_friday_2026','startInclusive':'2026-11-11T00:00:00+03:00','endExclusive':'2026-11-22T00:00:00+03:00','timeZone':'Europe/Moscow','contractRequired':True,'additionalDeluxeDiscountIncluded':False,'referenceLabel':'Цена вне акции — новый прайс на утверждение, не историческая цена','sourcePricebookSha256':digest,'rows':rows}
(OUT/'proposed-prices.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
money=lambda n:f'{n:,}'.replace(',',' ')+' ₽'
lines=['# Чёрная пятница · проект цен','', '**Статус: на согласование. На рабочем сайте ничего не изменено.**','', 'Договор должен быть заключён с 11.11.2026 по 21.11.2026 включительно, московское время. В расчёте участвует только скидка Чёрной пятницы. Дополнительные 20 000 ₽ на «Делюкс» здесь не учитываются.','', 'Зачёркнутая сумма — предложенный новый прайс вне акции. Она не подтверждена как историческая цена продажи. До публикации нужно утвердить её применение вне акции. Формула Чёрной пятницы даёт минус 5 000 ₽ от текущей показанной цены для каждой позиции.','', '| Модель | Размер | Комплектация | Сейчас на сайте | Новый прайс вне акции* | Скидка ЧП | Итог акции |','|---|---|---|---:|---:|---:|---:|']
for r in rows:lines.append('| '+ ' | '.join([r['modelName'],r['sizeLabel'],r['packageName'],money(r['currentDisplayedPriceRub']),money(r['proposedReferencePriceRub']),money(r['blackFridayDiscountRub']),money(r['finalPriceRub'])])+' |')
lines+=['','* Новый прайс — проект для согласования. Итог равен зачёркнутой цене минус указанная скидка Чёрной пятницы.','', 'Цены на основном сайте, в лендинге, форме и уведомлении менеджеру должны рассчитываться одним модулем. С 22.11.2026 00:00 МСК акция выключается; просроченные рекламные ссылки не должны показывать действующую скидку.','', 'Доставка, основание и окончательная комплектация согласуются отдельно. Текст о непубличной оферте сохраняется. Максимальная скидка акции — 55 000 ₽ на Квадро Хаус Делюкс.']
(OUT/'PRICES-REVIEW.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
print(json.dumps({'model_size_combinations':len(rows)//2,'price_positions':len(rows),'extra_deluxe_discount':0,'live_files_changed':0}))

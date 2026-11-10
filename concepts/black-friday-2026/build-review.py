"""Current approval board using the same campaign data as the native preview."""
import json
from html import escape
from pathlib import Path
OUT=Path(__file__).resolve().parent
data=json.loads((OUT/'proposed-prices.json').read_text('utf8'))
money=lambda n:f'{n:,}'.replace(',',' ')+' ₽'
rows=[]
for r in data['rows']:
 assert r['additionalDeluxeDiscountRub']==0
 assert r['finalPriceRub']==r['proposedReferencePriceRub']-r['blackFridayDiscountRub']
 values=[r['modelName'],r['sizeLabel'],r['packageName'],money(r['currentDisplayedPriceRub']),money(r['proposedReferencePriceRub']),money(r['blackFridayDiscountRub']),money(r['finalPriceRub'])]
 rows.append('<tr>'+''.join('<td>'+escape(v)+'</td>' for v in values)+'</tr>')
html='''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>ДачаПар · Чёрная пятница · согласование</title>
<style>*{box-sizing:border-box}body{margin:0;background:#eae7e1;color:#2d2b28;font:16px/1.6 Arial,sans-serif}main{max-width:1480px;margin:auto;padding:32px 24px}h1{font-size:clamp(30px,4vw,52px);line-height:1.1}a{color:#a45123;text-underline-offset:4px}.open{display:inline-block;padding:14px 22px;border-radius:8px;background:#b65b27;color:white;text-decoration:none;font-weight:bold;margin:10px 0 20px}img{display:block;width:100%;height:auto;border-radius:12px;margin:12px 0 32px}.table{overflow:auto;background:#fcfaf5;border:1px solid #c8c0b4;border-radius:12px}table{border-collapse:collapse;width:100%;font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap}td,th{padding:12px 16px;text-align:left;border-bottom:1px solid #d2c7b8}thead{background:#f2ece2}td:last-child{font-weight:bold}footer{font-size:13px;margin:28px 0;color:#625b51}</style>
<main><h1>Чёрная пятница · текущий вариант</h1><p>11–21 ноября 2026 включительно · московское время · скидка при заключении договора.</p>
<a class="open" href="v4/index.html">Открыть прототип: модели, размеры и цены ↗</a>
<p>Светлая студия, чёрная баня, художник с исправленным масштабом. Графитовый текст, почти белые карточки и оранжевые акценты.</p>
<img src="v4/mockup-v4.png" alt="Визуальный макет Паруса со скидкой 35 000 рублей на Делюкс">
<h2>Все 40 цен</h2><p>Только скидка Чёрной пятницы. Дополнительные скидки на Делюкс в эти цены не включены. Пример: Парус 5,5 м Делюкс — 684 000 − 35 000 = 649 000 ₽.</p>
<p>Зачёркнутая сумма — предложенный новый прайс вне акции, а не подтверждённая историческая цена продажи.</p>
<div class="table"><table><thead><tr><th>Модель</th><th>Размер</th><th>Комплектация</th><th>Сейчас на сайте</th><th>Прайс вне акции</th><th>Скидка ЧП</th><th>Итог акции</th></tr></thead><tbody>'''+''.join(rows)+'''</tbody></table></div>
<p><a href="PRICES-REVIEW.md">Матрица цен</a> · <a href="proposed-prices.json">Данные расчёта</a> · <a href="CONCEPT.md">Концепция и путь клиента</a></p>
<footer>Макет для согласования, форма демонстрационная. Рабочий сайт и API не изменены. Окончательные планировка, комплектация и доставка согласуются в договоре.</footer></main></html>'''
(OUT/'index.html').write_bytes(html.encode())
print(json.dumps({'current_preview':'v4','price_rows':len(rows),'extra_deluxe_discount':0,'arithmetic':'PASS','published':False}))

# V74-01 · Решение о композиции hero

## Два исследованных решения

**A — компактный двухколоночный hero (выбран).** Сохраняем отдельный погодный переключатель, approved media slot, исходный H1, короткое описание и оба реальных anchor CTA. Вместо увеличения/масштабирования всего hero ограничиваем вертикальный бюджет: desktop `h1` 40–59 px в зависимости от ширины и низкой высоты, меньшие межблочные интервалы, proof без лишних переносов и ограничение высоты фото `svh`. Преимущества: сохранён визуальный эмоциональный смысл, понятен следующий шаг; минимум кода. Риск: на промежуточной ширине 851–1080 двусторонняя сетка теснее; разрешаем естественный перенос CTA/proof и проверяем.

**B — этапы под фото на всю ширину.** Proof получает отдельную строку под колонками; CTA остаются под текстом. Выигрыш: одинаковая строка 01–03 и больше ширина. Проигрыш: отдельный grid row увеличивает общую высоту первого экрана, а требование 1366×768 становится чувствительнее к реальной высоте фото. Не выбрано.

## CSS constraints

- Scope `@media (min-width:851px)` и дополнительный `@media (min-width:851px) and (max-height:800px)`.
- Mobile CSS и fixed bar неизменны. При масштабировании до узкой layout width естественно действует прежний breakpoint.
- Не менять H1, содержание, anchor href, weather JS, asset hashes/manifest, API, pricebook.
- Photo: `#heroMedia` остаётся реальным media frame с approved `data-slot`, aspect ratio `5/4`, `max-height` зависит от высоты viewport; не background-image.
- `.hero-proof` остаётся в обычном потоке и DOM; все три элемента доступны.
- Никаких `overflow:hidden` на hero-copy, искусственных `height:100vh`, `position:fixed` для CTA.
- Минимальная hit-area главной кнопки 48px, и hover/focus не подавляются.

## Ворота принятия

G1: измеренный `bottom <= innerHeight - 8` для обеих CTA, proof, H1, lead, photo и других обязательных узлов на четырёх desktop размерах в обеих темах; photoLoaded=true.
G2: сравнение computed CSS и bounding boxes base/head, включая переход через breakpoints. Без браузерной пары причина остаётся инженерной гипотезой.
G3: mobile script на 320–851 и fixed CTA, без overflow.
G12: mouse hit test, keyboard, 200% zoom (реальный, не CSS transform) и platform smoke; отдельное подтверждение.

**Статус (19.10.2026):** desktop G1 при 100% — PASS в Chromium (8/8 sun/rain); screenshot evidence: https://github.com/s-yarushkin/site_bochki/actions/runs/39226183783/artifacts/12173468682. Полная приёмка G12 (реальный 90/110/200% zoom, устройства) — PENDING.

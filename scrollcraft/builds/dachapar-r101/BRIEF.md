# ДачаПар R101

## Revision 3, 29.10.2026
Owner feedback: unify the model imagery with emotional scenes; remove the raw-work gallery from the main flow, repetitive machine-like captions and full stops; make the conversion action honest. Four facade images are edits of original photos, not invented buildings. Keep geometry recognizable and retain original interior details in a deliberate disclosure. Eight selected schemes only. The catalogue now follows the hero directly. The layered broom scene moves after personalization: decorative live text «ВАША БАНЯ», foreground basin, separate readable invitation and CTA. The decorative word may be occluded; offer and controls must remain fully visible. Native scroll and reduced-motion behavior remain. Previous revision contracts below are historical when they differ from this one.

## Visual revision 2, feedback 28.10.2026
Keep the real panoramic sauna hero unobstructed. Remove the birch overlay and the heading's white protrusion. Expand emotional photography without repeating any image on a page.

New depth contract: an editorial oak-broom scene after the hero, with a warm mineral background (z0), oversized live text «ВЫДОХ.» (z1), a genuinely transparent photographic oak broom in a wooden basin (z2), and small descriptive copy / catalogue link in a separate safe region (z3). The foreground occludes only the decorative word, never the offer or controls. Text travels up by at most 30px; subject travels independently by at most 24px. Native scroll, no wheel interception. Mobile is independently composed; reduced motion is static and equally legible.

Assets: oak-basin-layer.png (transparent foreground, no background plate); oak-steam.png (close photographic detail); conifer-rest.png (adult lower legs resting on fir boughs in a sauna). Existing tea scene is used only at the closing CTA. Birch is removed from page compositions for now. Real project photos remain separate from generated mood illustrations.

Self-authored under explicit creative delegation. 28.10.2026.

## Задание и решения
1. Настроение: тишина, тёплое дерево, предметность, уверенность. Авторское решение на основе слов владельца: «мы продаем продуманные до мелочей бани, укомплектованные уже всем необходимым».
2. Путь: банный вечер → четыре модели и открытые цены → детали Комфорта → реальные объекты → доставка на участок → предметное обращение. Цена доступна без прохождения сцен.
3. Энергия: спокойное открытие, деловой каталог, единственный эмоциональный пик в ритуале, ясный финал.
4. Запоминаемый момент: «Я перебирал детали банного вечера, а рядом увидел, какие из них уже есть в моей бане». Пик: интерактивный ритуал, связывающий камни, дерево и отдых с точным составом.
5. Signature move: «От ощущения к составу». Три физических детали открывают соответствующие включённые узлы, выбранная модель и её неизменная цена остаются рядом. Веники/чай показаны как атмосфера, не как товары в комплекте.
6. Авторский выбор: фотографическая предметная редакционная подача. Дизайн-референс Walden на Refero, адаптированный для русскоязычного рекламного трафика.
7. Отдельные главы с нормальной прокруткой и быстрыми переходами. Не непрерывный полёт; нет блокирующего видео/автозвука/перехвата скролла.
8. Используем настоящие фото изделий, панорамную парную kh7-06, существующие макроснимки веника/камней. Недостающий завершающий чайный натюрморт и прозрачный ближний слой берёзовых листьев генерируются imagegen. Не выдаём изображения за построенные объекты.

## Кривая ощущений, до сценария движения
- Узнавание: реальная деревянная парная и вид в сад.
- Контроль: четыре модели, размеры и точные цены Комфорта.
- Предвкушение (пик): детали банного вечера связаны с включённым оборудованием.
- Уверенность: реальные бани с фасадом и интерьером одного объекта.
- Ясность: что входит, что рассчитывается для участка.
- Готовность: выбранная баня, известная цена, конкретный запрос доставки.

## Грамматика и fingerprint
Chaptered editorial: навигация по вопросам покупателя; фотографическое открытие; асимметричные главы; финал как краткое резюме выбора. Запрещены full-bleed scrub, pinned crossfade текста, единый непрерывный градиент, перехват прокрутки.
Остальные грамматики: filmic и worldflight мешают быстрым рекламным входам; live surface подменяет продажу инструментом; poster убирает нужную фотографию; gallery не отвечает на возражения; split не соответствует единому предложению; cutlist слишком нервный для отдыха.
Реестр новый и пустой; сравнивать с предыдущими записями нечего. R100 не назывался работой SCROLL-CRAFT и сохраняется в git.

## Сценарий движения
| Глава | Устройство | Назначение |
|---|---|---|
| Парная | цельная реальная фотография с коротким ходом, текст в отдельной колонке | Чистый вид на окно, предложение и цена сразу |
| Выдох | текст за прозрачным веником и тазом, разные скорости слоёв | Эмоциональный переход к выбору собственной бани |
| Каталог | flow/in | Открытая цена без анимационной задержки |
| Банный вечер | sticky предметный кадр + ручной reveal | Деталь сменяется по смыслу, состав остаётся читаемым |
| Реальные объекты | нативный pan/scroll-snap | Связанные фотографии реальной бани |
| Комплект и доставка | статическая редакционная таблица + disclosures | Честные факты и границы цены |
| Запрос | flow, тактильные кнопки | Отправка только по действию пользователя |

## Контракт слоёв hero
Цельная реальная фотография парной kh7-06; конструкцию окна не разрезаем. Типографика на отдельной светлой левой поверхности без выступов на фото. Ветка исключена по замечанию владельца. Mobile: текст над кадром, CTA и цена до фотографии. Глубина перенесена в самостоятельную сцену с дубовым веником по контракту редакции 2 выше; reduced motion сохраняет композицию без перемещения.

## Технические условия
Проверка doctor: Node24 и Chrome есть; ffmpeg отсутствует, playwright-core не установлен. Видео не используется, поэтому кодирование не требуется. Проверка UI через доступный CUA вместо стороннего browser harness. Генерация встроенной моделью, без Kie/API ключей. Локальный browser localhost ранее запрещён сохранённой политикой: не обходить; если запрет сохраняется, честно отметить отсутствие визуальной проверки, предоставить локальный просмотр пользователю.

## Сохраняемые инварианты
20 цен и точный состав Комфорта; исходные защищённые JSON и ценовые модули; политика/согласие, телефон, личный кабинет и MAX/сервер. Делюкс исчезает из новой публичной оболочки, исторические заявки не переписываются. p9/p11 и зеркала исключены из новой выдачи. Планировки не часть расчёта.

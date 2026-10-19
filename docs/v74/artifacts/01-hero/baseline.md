# V74-01 · Pre-browser CSS audit / baseline

BASE_BRANCH=`plan/v74-customer-experience-20261019`
BASE_SHA=`d93967b5dfa49ea135ed33722ad735545e9cbbd5`
ISSUE=`#58`

## Установленные из исходников факты

- `assets/css/site.css`: `.hero` содержит padding, `.hero-copy` имеет собственный padding; исходный H1 с margin-bottom, `.hero-lead` со своим margin-bottom, а `.hero-proof` располагается ПОСЛЕ двух CTA.
- `themes-v5.css`: погодный toolbar расположен в нормальном потоке ПЕРЕД `.hero-grid` и имеет собственный margin-bottom. Это безопасно против наложения фото, но потребляет высоту.
- `v5-finish.css`: desktop H1 увеличивается до 77px (`clamp(45px,5vw,77px)`), фото `aspect-ratio:5/4`, `.hero-copy` получает padding.
- `weather-v6.css`: позднее `.hero` padding `18px 0 62px`, `.hero-proof` margin-top 30px, `.hero-copy` padding-bottom 18px. Media queries `max-height:850px`, `800px`, `740px` преимущественно уплотняют **каталог**, не hero.
- `site.css` и `themes-v5.css`: при 850px вёрстка из двух колонок становится одноколоночной. Это объясняет механизм возможного парадокса: viewport уже, а текстовая колонка шире, CTA переносится выше фото. Является CSS-гипотезой, пока не выполнены точные браузерные замеры.

## Требуемое фактическое измерение

Запустить `tests/browser_v74_first_viewport.py --phase before --root <base-checkout> --out-dir <evidence>`. Скрипт сохранит screenshot и JSON с computed styles, `visualViewport`, rectangles и FAILED checks. Для `before` FAIL фиксируется как факт и не завершает сбор evidence ошибкой.

До браузерного запуска:
BEFORE_RECTS=NOT_RUN
BEFORE_SCREENSHOTS=NOT_RUN
ROOT_CAUSE=CSS_HYPOTHESIS_NOT_BROWSER_CONFIRMED

**Важно:** HTML-снимок страницы не заменяет браузерную проверку реальных computed styles и шрифтов.

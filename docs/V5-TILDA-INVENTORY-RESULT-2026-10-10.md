# V5 — подтверждённый результат инвентаризации Tilda

**Дата:** 2026-10-10. **Источник:** фактический вывод PowerShell пользователя по точному SHA `9bd0f547abc15cabff46454f3a98b74da76443af` из PR #10.

## Факт

```text
Tilda audit uses the five verified public source pages ... PASS
candidate parser discovers originals ... PASS
candidate parser accepts escaped Tilda JSON URLs ... PASS
auditor handles failed pages ... PASS
tests 4 / pass 4 / fail 0

PAGES_SUCCEEDED=5
PAGES_FAILED=0
PHOTO_CANDIDATES=102
PUBLICATION_APPROVED=NO
V5_PHOTO_INVENTORY=PASS
V5_STAGE_1=PASS
PRODUCTION_UNCHANGED=PASS
```

**Точный JSON:** `C:\Users\Sergey\AppData\Local\Temp\garant-bani-tilda-media-candidates.json`, сохранён на машине пользователя. **Файл ещё не загружен в репозиторий или в эту рабочую среду.** Поэтому нет проверенного списка всех 102 URL, размеров, фотографий или модели.

**Интерпретация:** 102 = найденные ссылки-кандидаты по пяти страницам, возможно с повторениями между страницами, вариантами одного файла, декором, иконками или не относящимися к продукции изображениями. Это не 102 готовых продуктовых фотографии.

## Следующий pipeline (до фото-PR)

1. Получить JSON-отчёт с машины пользователя, **не переписывая** точные URL по памяти.
2. Сгруппировать кандидатов по точному URL, изображению/hash (после разрешённой загрузки), странице и назначению; отфильтровать дубли/иконки/микро-превью.
3. Сделать контакт-лист подходящих фото без логотипов чужих производителей; проверить чёткость и происхождение.
4. Согласовать право на повторное использование и обрезку фотографий Tilda/VK; подтвердить семейство каждой карточки.
5. Сформировать media manifest `modelId` + `slotId` + responsive sources и fallback; только затем commit оптимизированные изображения в отдельный PR.
6. Утвердить SUN/RAIN pair policy по **реально существующим** кадрам; если пары нет, использовать один честный реальный кадр с разными UI-темами, без AI-фикции.

**Критический gate:** `PUBLICATION_APPROVED=NO` — фото пока не публиковать.

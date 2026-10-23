# Дача Пар — R8.1.1: точечная правка первого экрана и фотогалереи

**Что меняется:** ровно один файл `index.html` действующего WEB R8.1 FIX2.

1. Удалён весь вспомогательный нижний ряд первого экрана, включая дублирующую плашку «Ваша баня. Ваше место тишины.» и связанную с ним одиночную ссылку «Ближе к деталям». Hero-фото, заголовок, цена, кнопки «Посмотреть модели» и «Рассчитать стоимость» сохранены. Ритуальный блок `#details` сохранён, как и обычная прокрутка к нему.
2. «Все девять выполненных бань →» заменено на «Смотреть реальные бани →». URL `/raboty/` сохранён. На сайте уже десять объектных фотосерий, но публичная ссылка теперь не обещает точного количества объектов и не создаёт впечатления, будто компания выполнила только девять заказов.

**Стабильность:** исходный `index.html` SHA256 `2d1495b0dfaccff0f72dc46e7cb35e89f0eaa350bb7147b72a43d42246f52a4f`, новый `0b879e762b101632c35b38c60ae07f0f626e75314d972cdcecce47399718cc2f`. Точно проверены 64 sha предыдущего R8.1 и ещё 8 исходных файлов. Никакие API, заявки, калькулятор, цены, MAX, кабинет, TOTP и юридические страницы не изменяются.

## Запуск на Windows PowerShell

Сохранить `DachaPar_R811_Copy_Hotfix_Kit.zip` в `Downloads`:

```powershell
$kit = "$env:USERPROFILE\Downloads\DachaPar_R811_Copy_Hotfix"
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\DachaPar_R811_Copy_Hotfix_Kit.zip" -DestinationPath $kit -Force

# По умолчанию ТОЛЬКО проверка текущего релиза, ничего не переключает.
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $kit 'DachaPar_R811_Copy_Hotfix.ps1')
```

Ожидаемый вывод: `R811_PREFLIGHT=PASS; ... WRITES=0` и `R811_WINDOWS_PREFLIGHT=PASS; ONE_SUDO_INVOCATION=YES`.

**Публикация** после preflight и согласования этих двух точечных правок:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File (Join-Path $kit 'DachaPar_R811_Copy_Hotfix.ps1') `
  -Deploy -Approval 'R811_HERO_COPY_APPROVED'
```

В одной `sudo`-сессии: проверка исходной версии и SHA, создание отдельной immutable копии R8.1.1, проверка разницы **ровно один файл**, атомарное переключение, сравнение публичных GET SHA для `index.html`, `app.mjs`, `quote.mjs`, `lead-client.mjs`, `data/catalog-pricebook.json`, `/raboty/`. При ошибке серверной проверки выполняется **автоматический откат на R8.1 FIX2** (не на устаревший R8.0).

Успех: `R811_DEPLOY=PASS; ... API_UNCHANGED=YES; SQLITE_UNTOUCHED=YES; MAX_POSTS=0` и `R811_WINDOWS_DEPLOY=PASS; ONE_SUDO_INVOCATION=YES`.

Если сетевое соединение оборвётся — не повторять `-Deploy` вслепую, сначала:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $kit 'DachaPar_R811_Copy_Hotfix.ps1') -Status
```

**Экстренный откат R8.1.1 → R8.1 FIX2** (не затрагивает API и данные):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $kit 'DachaPar_R811_Copy_Hotfix.ps1') -Rollback
```

## Пройденные локальные проверки

- Проверка точной текстовой замены, hero CTA и обязательных DOM-якорей.
- Подписи в калькуляторе и цены не затронуты; модуль `app.mjs` не изменялся.
- 6/6 локальных тестов Python на копии R8.1: preflight/64 SHA, атомарный deploy и дифф ровно `index.html`, ручной rollback, повторный rollback, принудительный HTTP checksum fail → автоматический rollback, отказ при drift исходного файла.
- Проверка семантики HTML и соответствия ссылок через локальный разбор.

**Статус до запуска владельцем:** архив и скрипт подготовлены, **production по-прежнему R8.1 FIX2**. Для этого hotfix реальный запуск на Windows/сервере пока не сделан.

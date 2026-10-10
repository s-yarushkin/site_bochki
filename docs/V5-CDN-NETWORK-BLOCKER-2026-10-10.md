# Гарант Бани V5 — CDN-сетевой блокер подтверждён

**Дата:** 10.10.2026. **Статус:** EXPORT_BLOCKED / CODE_PARSE_PASS / PRODUCTION_UNCHANGED.

## Фактический повторный запуск Windows

Пользователь выполнил Windows PowerShell recovery на версии PR #10 с ASCII-кодировкой. Результат:

```text
SCRIPT_ENCODING=PASS
POWERSHELL_SYNTAX=PASS
FAILED GBV5-03BD8AB77 IWR=Время ожидания завершения операции истекло. | CURL=curl: (28) Connection timed out after 8005 milliseconds
FAILED GBV5-0C91AE597 IWR=Время ожидания завершения операции истекло. | CURL=curl: (28) Connection timed out after 8004 milliseconds
FAILED GBV5-135EDF0DD IWR=Время ожидания завершения операции истекло. | CURL=curl: (28) Connection timed out after 8014 milliseconds
CDN_TRANSPORT_BLOCKED=YES
PHOTOS_SAVED=0
PHOTOS_PENDING=36
PHOTO_NETWORK_DIAGNOSTICS=REQUIRED
REVIEW_ZIP=C:\Users\Sergey\Downloads\GB-V5-photo-review.zip
PHOTO_NETWORK_DIAGNOSTICS=READY
PRODUCTION_UNCHANGED=PASS
```

Команда отработала по предусмотренному механизму fail-closed: после трёх последовательных сетевых неудач перестала загружать. **Получение фотографий не выполнено**. Это не ошибка прав на отдельный кадр: транспортное соединение не устанавливается, точный слой проблемы (сетевой маршрут, DNS, TLS, региональная фильтрация) ещё не подтверждён, нужен фактический архив диагностики и/или независимый серверный HTTPS probe.

## Решение для следующей итерации

1. Не повторять полный скачивающий цикл с Windows, пока транспорт недоступен.
2. Выполнить **read-only HTTPS probe** с уже авторизованного VPS `135.106.137.195` через `deploy`, без `sudo`, без изменения Caddy/сайта/базы. Проверить `static.tildacdn.com` и `www.garant-bany.ru` отдельно. Защитить время ожидания `curl --connect-timeout ... --max-time ...`.
3. Если CDN доступен с VPS — временно скачивать в отдельную приватную директорию пользователя deploy под `/home/deploy`, ограничить количество/объём и вернуть ZIP через `scp` на Windows; **не** копировать в публичный релиз, не публиковать. Выбор модели и права подлежат проверке.
4. Если CDN недоступен и с VPS — получать оригиналы через экспорт Tilda владельцем либо его собственные файлы/официальный VK, с проверкой прав; не использовать сетевой обход/сток вместо реального изделия.
5. Разработка независимых визуальных компонентов из PR #9 может продолжаться без фотографий, но media PR не выпускается до G1.

**Перед реальным скачиванием и публикацией:** подтверждение происхождения, модели и согласования владельца, затем проверка изображений глазами и отдельный media PR.

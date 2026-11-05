$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'ДачаПар — исправление формы заявки'
$remote = '/tmp/dachapar-callback-fix-45bb11dcf8b51b79'
ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 deploy@135.106.137.195 "python3 '$remote/apply_fix.py' --check"
if ($LASTEXITCODE -ne 0) { throw 'Предварительная проверка не прошла. Сайт не переключён.' }
Write-Host 'Введите sudo-пароль в этом окне. В чат пароль не отправляйте.' -ForegroundColor Yellow
ssh -tt -o StrictHostKeyChecking=yes -o ConnectTimeout=10 deploy@135.106.137.195 "sudo python3 '$remote/apply_fix.py' --apply"
if ($LASTEXITCODE -ne 0) { throw 'Исправление не подтвердило успех. Сохраняется полный резервный выпуск; проверю состояние.' }
Write-Host 'Исправление опубликовано. Выполняю контрольную проверку основного сайта.' -ForegroundColor Green

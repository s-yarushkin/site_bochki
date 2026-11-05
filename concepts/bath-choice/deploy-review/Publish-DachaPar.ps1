$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'ДачаПар — публикация проверенного каталога'
$remote = '/tmp/dachapar-bath-choice-250ed3a209ba1254'
Write-Host 'Проверяю пакет. Основной сайт пока не переключён.'
ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 deploy@135.106.137.195 "python3 '$remote/install.py' --check"
if ($LASTEXITCODE -ne 0) { throw 'Предварительная проверка не прошла. Сайт не переключён.' }
Write-Host 'Введите sudo-пароль прямо в этом окне. Символы пароля не отображаются. В чат пароль не отправляйте.' -ForegroundColor Yellow
ssh -tt -o StrictHostKeyChecking=yes -o ConnectTimeout=10 deploy@135.106.137.195 "sudo python3 '$remote/install.py' --apply"
if ($LASTEXITCODE -ne 0) { throw 'Установка не подтвердила успех. Проверю состояние и откат.' }
Write-Host 'Публикация завершена. Проверяю основной сайт в браузере.' -ForegroundColor Green

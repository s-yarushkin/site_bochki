# Garant Bani V5: Windows transport fallback for an existing failed review.json.
# Read-only remote; writes ONLY to specified local review directory and ZIP.
param(
  [string]$ReviewDir = (Join-Path $env:TEMP 'GB-V5-photo-review-a5a05d92'),
  [string]$ZipPath = (Join-Path $env:USERPROFILE 'Downloads\GB-V5-photo-review.zip')
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$ManifestFile = Join-Path $ReviewDir 'review.json'
if (!(Test-Path -LiteralPath $ManifestFile -PathType Leaf)) { throw 'REVIEW_MANIFEST_NOT_FOUND' }
$Data = Get-Content -LiteralPath $ManifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ($Data.total -ne 36 -or @($Data.items).Count -ne 36) { throw 'UNEXPECTED_REVIEW_INVENTORY' }
if (!(Test-Path -LiteralPath (Join-Path $ReviewDir 'photos'))) { throw 'REVIEW_PHOTO_DIR_MISSING' }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36'
$Diagnostics = New-Object System.Collections.Generic.List[string]

function Test-ActualImage([string]$Path) {
  if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  $f = [IO.File]::OpenRead($Path)
  try {
    if ($f.Length -lt 16 -or $f.Length -gt 16777216) { return $false }
    $h = New-Object byte[] 16
    [void]$f.Read($h, 0, 16)
    $ascii = [Text.Encoding]::ASCII
    if ($h[0] -eq 255 -and $h[1] -eq 216 -and $h[2] -eq 255) { return $true }
    if ($h[0] -eq 137 -and $h[1] -eq 80 -and $h[2] -eq 78 -and $h[3] -eq 71) { return $true }
    if ($ascii.GetString($h,0,4) -eq 'RIFF' -and $ascii.GetString($h,8,4) -eq 'WEBP') { return $true }
    if ($ascii.GetString($h,0,4) -eq 'GIF8') { return $true }
    if ($ascii.GetString($h,4,4) -eq 'ftyp') { return $true }
    return $false
  }
  finally { $f.Dispose() }
}
function Get-Html([string]$Value) {
  return [Net.WebUtility]::HtmlEncode($Value)
}
$Saved = 0
$Failed = 0
$Consecutive = 0
foreach ($item in @($Data.items)) {
  $url = [uri][string]$item.url
  if ($url.Scheme -ne 'https' -or $url.Host -ne 'static.tildacdn.com' -or
      [string]$item.local -notmatch '^photos/GBV5-[A-F0-9]{9}\.(webp|png|jpe?g|avif|gif)$') {
    throw 'UNSAFE_MEDIA_SOURCE_OR_DESTINATION'
  }
  $target = Join-Path $ReviewDir ([string]$item.local).Replace('/', [IO.Path]::DirectorySeparatorChar)
  if (([bool]$item.saved) -and (Test-ActualImage $target)) {
    $Saved++
    continue
  }
  $tmp = $target + '.partial'
  if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force }
  $errorWindows = ''
  $errorCurl = ''
  $ok = $false
  try {
    Invoke-WebRequest -Uri $url.AbsoluteUri -OutFile $tmp -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 15 -UserAgent $UserAgent | Out-Null
    $ok = Test-ActualImage $tmp
    if (!$ok) { $errorWindows = 'INVALID_IMAGE_AFTER_WINDOWS_DOWNLOAD' }
  }
  catch { $errorWindows = $_.Exception.Message }
  if (!$ok -and (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force }
    try {
      $curlOutput = & curl.exe '--fail' '--silent' '--show-error' '--connect-timeout' '8' '--max-time' '18' '--max-filesize' '16777216' '--user-agent' $UserAgent '--output' $tmp '--' $url.AbsoluteUri 2>&1
      $curlExit = $LASTEXITCODE
      $ok = ($curlExit -eq 0) -and (Test-ActualImage $tmp)
      if (!$ok) { $errorCurl = ('curl_exit=' + $curlExit + ': ' + (($curlOutput | Out-String).Trim())) }
    }
    catch { $errorCurl = $_.Exception.Message }
  }
  if ($ok) {
    Move-Item -LiteralPath $tmp -Destination $target -Force
    $item.saved = $true
    $item.error = $null
    $item | Add-Member -NotePropertyName bytes -NotePropertyValue ([long](Get-Item -LiteralPath $target).Length) -Force
    $item | Add-Member -NotePropertyName sha256 -NotePropertyValue ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()) -Force
    $Saved++
    $Consecutive = 0
    Write-Host ('SAVED ' + $item.id + ' ' + $item.sourcePage)
  }
  else {
    $Failed++
    $Consecutive++
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force }
    $errorInfo = ('IWR=' + $errorWindows + ' | CURL=' + $errorCurl)
    $item.error = $errorInfo
    $Diagnostics.Add(([string]$item.id + ' ' + $errorInfo))
    Write-Host ('FAILED ' + $item.id + ' ' + $errorInfo)
    if ($Consecutive -ge 3 -and $Saved -eq 0) {
      Write-Host 'CDN_TRANSPORT_BLOCKED=YES'
      break
    }
  }
}
$Data.saved = @($Data.items | Where-Object { $_.saved }).Count
$Data.failed = @($Data.items | Where-Object { -not $_.saved }).Count
$Data.status = 'INTERNAL_REVIEW_ONLY_NOT_PUBLISHABLE'
$utf8NoBom = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($ManifestFile,($Data | ConvertTo-Json -Depth 12),$utf8NoBom)
$itemsHtml = New-Object System.Collections.Generic.List[string]
foreach ($group in @('home','kvadro','parus','viking','kvadro-house')) {
  $itemsHtml.Add('<section><h2>' + (Get-Html $group) + '</h2><div class="grid">')
  foreach ($item in @($Data.items | Where-Object { $_.sourcePage -eq $group })) {
    $identifier = Get-Html ([string]$item.id)
    $filename = Get-Html ([string]$item.filename)
    $origin = Get-Html ([string]$item.url)
    $image = if ($item.saved) {
      '<a href="' + (Get-Html ([string]$item.local)) + '" target="_blank"><img loading="lazy" src="' + (Get-Html ([string]$item.local)) + '" alt="' + $identifier + '"></a>'
    } else { '<span class="error">Недоступно</span>' }
    $itemsHtml.Add('<article><div class="photo">' + $image + '</div><div class="description"><b>' + $identifier + '</b><small>' + $filename + '</small><a href="' + $origin + '" target="_blank" rel="noreferrer">Источник</a></div></article>')
  }
  $itemsHtml.Add('</div></section>')
}
$html = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Гарант Бани — фотопроверка V5</title><style>body{margin:0;font:15px/1.5 Arial,sans-serif;background:#18251d;color:#eee}header,main{padding:25px max(15px,4vw)}header{background:#304837}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(225px,1fr));gap:15px}section{margin:24px 0}article{overflow:hidden;border-radius:12px;background:#fff;color:#26362b}.photo{height:230px;display:grid;place-items:center;background:#e4e9e1}.photo a,.photo img{width:100%;height:100%;object-fit:contain}.description{padding:12px;display:grid;gap:7px;word-break:break-all}a{color:#34844d}header p{max-width:820px}.error{color:#ae443b}</style></head><body><header><h1>Гарант Бани — фото V5</h1><p>Внутренний просмотр. Права, модель и публикация НЕ подтверждены. Фото группируются по исходным страницам Tilda, а не по проверенной модели.</p></header><main>' + ($itemsHtml -join [Environment]::NewLine) + '</main></body></html>'
[IO.File]::WriteAllText((Join-Path $ReviewDir 'index.html'),$html,$utf8NoBom)
$Diagnostics.Add('Source=static.tildacdn.com')
$Diagnostics.Add('PhotosSuccess=' + $Saved)
$Diagnostics.Add('PhotosFailedInAttempt=' + $Failed)
try {
  $ips = [Net.Dns]::GetHostAddresses('static.tildacdn.com') | ForEach-Object { $_.IPAddressToString }
  $Diagnostics.Add('DNS_IP=' + ($ips -join ','))
}
catch { $Diagnostics.Add('DNS_ERROR=' + $_.Exception.Message) }
[IO.File]::WriteAllLines((Join-Path $ReviewDir 'network-diagnostics.txt'),$Diagnostics,$utf8NoBom)
if (Test-Path -LiteralPath $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force }
Compress-Archive -Path (Join-Path $ReviewDir '*') -DestinationPath $ZipPath -Force
Write-Host ('PHOTOS_SAVED=' + $Data.saved)
Write-Host ('PHOTOS_PENDING=' + $Data.failed)
Write-Host ('REVIEW_ZIP=' + $ZipPath)
Write-Host 'PUBLICATION_APPROVED=NO'
if ($Data.saved -eq 0) {
  Write-Host 'PHOTO_NETWORK_DIAGNOSTICS=REQUIRED'
  exit 2
}
Write-Host 'PHOTO_REVIEW_ZIP=READY'

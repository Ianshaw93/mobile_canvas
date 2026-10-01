param([switch]$Build,[switch]$LiveTest)
$ErrorActionPreference='Stop'
$mobileRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$python=(Resolve-Path (Join-Path $mobileRoot '../MobileAppBackend/.venv/Scripts/python.exe')).Path
$env:NEXT_PUBLIC_API_BASE_URL='http://127.0.0.1:3112'
$env:NEXT_PUBLIC_UPLOAD_RECOVERY_PROTOTYPE='1'
$node=(Get-Command node).Source
if (-not (netstat -ano -p tcp | Select-String '^\s*TCP\s+127\.0\.0\.1:3112\s+\S+\s+LISTENING\s+\d+')) {
  $serverArgs=@((Join-Path $PSScriptRoot 'server.py'))
  if($LiveTest){$serverArgs+='--live-test'}
  $proc=Start-Process -FilePath $python -ArgumentList $serverArgs -WorkingDirectory $mobileRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot 'run.log') -RedirectStandardError (Join-Path $PSScriptRoot 'error.log')
  $proc.Id | Set-Content (Join-Path $PSScriptRoot 'server.pid')
}
Push-Location $mobileRoot
try {
  if ($Build -or -not (Test-Path '.next-recovery/BUILD_ID')) {
    & $node scripts/sync-pdf-worker.mjs
    & $node node_modules/next/dist/bin/next build
    if ($LASTEXITCODE -ne 0) {throw 'Mobile build failed'}
  }
  if (-not (netstat -ano -p tcp | Select-String '^\s*TCP\s+127\.0\.0\.1:3113\s+\S+\s+LISTENING\s+\d+')) {
    $proc=Start-Process -FilePath $node -ArgumentList @('node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3113') -WorkingDirectory $mobileRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot 'mobile.log') -RedirectStandardError (Join-Path $PSScriptRoot 'mobile-error.log')
    $proc.Id | Set-Content (Join-Path $PSScriptRoot 'mobile.pid')
  }
} finally {Pop-Location}
Write-Output 'Mobile app browser build: http://127.0.0.1:3113'

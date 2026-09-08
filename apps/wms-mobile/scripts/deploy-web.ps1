[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$appRoot = Split-Path -Parent $PSScriptRoot
$credentialDir = Join-Path $appRoot '.deploy'
$keyPath = Join-Path $credentialDir 'appqr-web-deploy-runtime'
$knownHostsPath = Join-Path $credentialDir 'known_hosts'
$logDir = Join-Path $appRoot '.tmp'
$logPath = Join-Path $logDir 'web-auto-deploy.log'
$hostName = '14.246.0.81'
$remoteUser = 'wmsdeploy'
$releaseId = '{0}-{1}' -f [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'), ([guid]::NewGuid().ToString('N').Substring(0, 8))
$archiveName = "wms-web-$releaseId.tar.gz"
$archivePath = Join-Path $logDir $archiveName

function Write-DeployLog([string]$message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message
  $line | Tee-Object -FilePath $logPath -Append
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$mutex = New-Object System.Threading.Mutex($false, 'WmsMobileWebDeploy')
if (-not $mutex.WaitOne(0)) {
  Write-DeployLog 'Bỏ qua: một lần phát hành khác đang chạy.'
  exit 0
}

try {
  foreach ($requiredPath in @($keyPath, $knownHostsPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
      throw "Thiếu tệp cấu hình phát hành cục bộ: $requiredPath"
    }
  }

  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  $tar = (Get-Command tar.exe -ErrorAction Stop).Source
  $ssh = (Get-Command ssh.exe -ErrorAction Stop).Source
  $scp = (Get-Command scp.exe -ErrorAction Stop).Source

  Write-DeployLog "Bắt đầu kiểm tra và build release $releaseId."
  Push-Location $appRoot
  try {
    & $npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "Typecheck thất bại (mã $LASTEXITCODE)." }

    & $npm run build:web
    if ($LASTEXITCODE -ne 0) { throw "Build web thất bại (mã $LASTEXITCODE)." }

    if (-not (Test-Path -LiteralPath (Join-Path $appRoot 'web-dist\index.html'))) {
      throw 'Build không tạo ra web-dist\\index.html.'
    }

    if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
    & $tar -czf $archivePath -C $appRoot web-dist
    if ($LASTEXITCODE -ne 0) { throw "Đóng gói release thất bại (mã $LASTEXITCODE)." }
  }
  finally {
    Pop-Location
  }

  $sshOptions = @(
    '-i', $keyPath,
    '-o', 'BatchMode=yes',
    '-o', 'IdentitiesOnly=yes',
    '-o', 'StrictHostKeyChecking=yes',
    # OpenSSH for Windows parses spaces inside -o values poorly. The working
    # directory is pinned below, so use the equivalent relative safe path.
    '-o', 'UserKnownHostsFile=./.deploy/known_hosts'
  )
  $remoteTarget = "$remoteUser@$hostName"

  Push-Location $appRoot
  try {
    Write-DeployLog 'Đang tải release lên VPS.'
    & $scp @sshOptions $archivePath "${remoteTarget}:/home/$remoteUser/upload/$archiveName"
    if ($LASTEXITCODE -ne 0) { throw "Tải release lên VPS thất bại (mã $LASTEXITCODE)." }

    $remoteCommand = "sudo /usr/local/sbin/deploy-wms-web $releaseId"

    Write-DeployLog 'Đang kích hoạt release mới trên VPS.'
    & $ssh @sshOptions $remoteTarget $remoteCommand
    if ($LASTEXITCODE -ne 0) { throw "Kích hoạt release trên VPS thất bại (mã $LASTEXITCODE)." }
  }
  finally {
    Pop-Location
  }

  Remove-Item -LiteralPath $archivePath -Force
  Write-DeployLog "Đã phát hành $releaseId thành công."
}
catch {
  Write-DeployLog "PHÁT HÀNH THẤT BẠI: $($_.Exception.Message)"
  exit 1
}
finally {
  if ($mutex) {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
  }
}

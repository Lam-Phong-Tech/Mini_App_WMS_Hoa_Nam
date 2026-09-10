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
  Write-DeployLog 'Skipped: another deployment is already running.'
  exit 0
}

try {
  foreach ($requiredPath in @($keyPath, $knownHostsPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
      throw "Missing local deployment configuration: $requiredPath"
    }
  }

  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  $tar = (Get-Command tar.exe -ErrorAction Stop).Source
  $ssh = (Get-Command ssh.exe -ErrorAction Stop).Source
  $scp = (Get-Command scp.exe -ErrorAction Stop).Source

  Write-DeployLog "Starting validation and build for release $releaseId."
  Push-Location $appRoot
  try {
    & $npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "Typecheck failed (exit $LASTEXITCODE)." }

    & $npm run build:web
    if ($LASTEXITCODE -ne 0) { throw "Web build failed (exit $LASTEXITCODE)." }

    if (-not (Test-Path -LiteralPath (Join-Path $appRoot 'web-dist\index.html'))) {
      throw 'Build did not create web-dist\\index.html.'
    }

    if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
    & $tar -czf $archivePath -C $appRoot web-dist
    if ($LASTEXITCODE -ne 0) { throw "Release archive failed (exit $LASTEXITCODE)." }
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
    Write-DeployLog 'Uploading release to VPS.'
    & $scp @sshOptions $archivePath "${remoteTarget}:/home/$remoteUser/upload/$archiveName"
    if ($LASTEXITCODE -ne 0) { throw "VPS upload failed (exit $LASTEXITCODE)." }

    $remoteCommand = "sudo /usr/local/sbin/deploy-wms-web $releaseId"

    Write-DeployLog 'Activating release on VPS.'
    & $ssh @sshOptions $remoteTarget $remoteCommand
    if ($LASTEXITCODE -ne 0) { throw "VPS activation failed (exit $LASTEXITCODE)." }
  }
  finally {
    Pop-Location
  }

  Remove-Item -LiteralPath $archivePath -Force
  Write-DeployLog "Release $releaseId deployed successfully."
}
catch {
  Write-DeployLog "DEPLOYMENT FAILED: $($_.Exception.Message)"
  exit 1
}
finally {
  if ($mutex) {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
  }
}

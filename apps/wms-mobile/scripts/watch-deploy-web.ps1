[CmdletBinding()]
param(
  [int]$DebounceSeconds = 4,
  [switch]$DeployOnStart
)

$ErrorActionPreference = 'Stop'

$appRoot = Split-Path -Parent $PSScriptRoot
$deployScript = Join-Path $PSScriptRoot 'deploy-web.ps1'
$logDir = Join-Path $appRoot '.tmp'
$logPath = Join-Path $logDir 'web-auto-deploy.log'

function Write-WatchLog([string]$message) {
  $line = '[{0}] WATCHER: {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message
  $line | Tee-Object -FilePath $logPath -Append
}

function Invoke-WebDeploy {
  Write-WatchLog 'Có thay đổi hợp lệ, bắt đầu phát hành.'
  & $deployScript
  if ($LASTEXITCODE -eq 0) {
    Write-WatchLog 'Đã phát hành thành công.'
  }
  else {
    Write-WatchLog "Phát hành không thành công (mã $LASTEXITCODE); phiên bản đang chạy được giữ nguyên."
  }
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$watchTargets = @(
  @{ Path = (Join-Path $appRoot 'src'); Filter = '*'; Recurse = $true },
  @{ Path = $appRoot; Filter = 'index.html'; Recurse = $false },
  @{ Path = $appRoot; Filter = 'vite.config.mjs'; Recurse = $false },
  @{ Path = $appRoot; Filter = 'package.json'; Recurse = $false },
  @{ Path = $appRoot; Filter = 'package-lock.json'; Recurse = $false }
)

$watchers = @()
$subscriptions = @()
$eventNumber = 0
foreach ($target in $watchTargets) {
  if (-not (Test-Path -LiteralPath $target.Path)) { continue }

  $watcher = New-Object System.IO.FileSystemWatcher($target.Path, $target.Filter)
  $watcher.IncludeSubdirectories = $target.Recurse
  $watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, Size'
  $watcher.EnableRaisingEvents = $true
  $watchers += $watcher

  foreach ($eventName in @('Changed', 'Created', 'Deleted', 'Renamed')) {
    $eventNumber++
    $sourceIdentifier = "WmsMobileAutoDeploy.$eventNumber"
    $subscriptions += Register-ObjectEvent -InputObject $watcher -EventName $eventName -SourceIdentifier $sourceIdentifier
  }
}

Write-WatchLog 'Đang theo dõi mã nguồn app web. Mỗi lượt lưu sẽ được gom trong 4 giây trước khi build và phát hành.'
if ($DeployOnStart) { Invoke-WebDeploy }

$deployAfter = $null
try {
  while ($true) {
    $event = Wait-Event -Timeout 1
    if ($null -ne $event) {
      Remove-Event -EventIdentifier $event.EventIdentifier -ErrorAction SilentlyContinue
      $deployAfter = [DateTime]::UtcNow.AddSeconds($DebounceSeconds)
    }

    if ($null -ne $deployAfter -and [DateTime]::UtcNow -ge $deployAfter) {
      $deployAfter = $null
      Invoke-WebDeploy
    }
  }
}
finally {
  foreach ($subscription in $subscriptions) {
    Unregister-Event -SubscriptionId $subscription.Id -ErrorAction SilentlyContinue
  }
  foreach ($watcher in $watchers) {
    $watcher.Dispose()
  }
}

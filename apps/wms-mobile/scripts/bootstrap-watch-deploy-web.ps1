[CmdletBinding()]
param(
  [switch]$PrepareOnly
)

$ErrorActionPreference = 'Stop'

$appRoot = Split-Path -Parent $PSScriptRoot
$credentialDir = Join-Path $appRoot '.deploy'
$sourceKey = Join-Path $credentialDir 'appqr-web-deploy'
$runtimeKey = Join-Path $credentialDir 'appqr-web-deploy-runtime'
$watchScript = Join-Path $PSScriptRoot 'watch-deploy-web.ps1'
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$logPath = Join-Path $appRoot '.tmp\web-auto-deploy-bootstrap.log'

try {
  New-Item -ItemType Directory -Path (Split-Path -Parent $logPath) -Force | Out-Null
  if (-not (Test-Path -LiteralPath $sourceKey)) {
    throw "Không tìm thấy khóa nguồn: $sourceKey"
  }

  # Tệp runtime được tạo bởi chính tài khoản đăng nhập Windows. Nhờ vậy
  # OpenSSH chấp nhận quyền sở hữu/ACL của private key khi launcher khởi động.
  if (-not (Test-Path -LiteralPath $runtimeKey)) {
    Copy-Item -LiteralPath $sourceKey -Destination $runtimeKey
    $keyAcl = Get-Acl -LiteralPath $runtimeKey
    $keyAcl.SetAccessRuleProtection($true, $false)
    foreach ($accessRule in @($keyAcl.Access)) {
      [void] $keyAcl.RemoveAccessRuleSpecific($accessRule)
    }
    $readRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
      $identity,
      [System.Security.AccessControl.FileSystemRights]::Read,
      [System.Security.AccessControl.AccessControlType]::Allow
    )
    [void] $keyAcl.AddAccessRule($readRule)
    Set-Acl -LiteralPath $runtimeKey -AclObject $keyAcl
  }

  if ($PrepareOnly) {
    'Khóa runtime đã sẵn sàng.' | Set-Content -LiteralPath $logPath
    exit 0
  }

  & $watchScript -DeployOnStart
}
catch {
  $_ | Out-String | Set-Content -LiteralPath $logPath
  exit 1
}

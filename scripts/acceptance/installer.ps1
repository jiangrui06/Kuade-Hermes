param(
  [Parameter(Mandatory=$true)][string]$Installer,
  [Parameter(Mandatory=$true)][string]$Unpacked,
  [Parameter(Mandatory=$true)][string]$BuildDirectory,
  [Parameter(Mandatory=$true)][string]$Version
)
$ErrorActionPreference = 'Stop'
# Run only on an explicitly selected test machine with no existing Kuade install.
# A fresh short target avoids Windows archive path limits. No user profile is removed.
$registry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\8e713d3f-3d91-5886-8938-8c3dd682fd8e'
if (Test-Path -LiteralPath $registry) { throw 'Existing Kuade installation: stop before making changes' }
if (Get-CimInstance Win32_Process -Filter "Name='Kuade.exe'") { throw 'Exit running Kuade instances before installer acceptance' }
$Installer = (Resolve-Path -LiteralPath $Installer).Path
$Unpacked = (Resolve-Path -LiteralPath $Unpacked).Path
$BuildDirectory = (Resolve-Path -LiteralPath $BuildDirectory).Path
$runId = [guid]::NewGuid().ToString()
$evidence = Join-Path 'D:\Kuade-acceptance' ('installer-' + $Version + '-' + $runId)
$target = 'D:\KI-' + $runId.Substring(0,8)
if (Test-Path -LiteralPath $target) { throw 'Test target already exists' }
New-Item -ItemType Directory -Path $evidence | Out-Null
$nodeExe = (Get-Command node.exe).Source
$witnessDirectory = Join-Path $evidence 'unrelated-process'
New-Item -ItemType Directory -Path $witnessDirectory | Out-Null
$witnessExe = Join-Path $witnessDirectory 'Kuade.exe'
Copy-Item -LiteralPath $nodeExe -Destination $witnessExe
$userProfile = 'C:\Users\jiangrui\AppData\Roaming\Kuade'
$protectedFiles = @('harness\.credentials.yaml','harness\profiles\web\cordis.patch.yml')
function Get-ProfileHashes {
  $result = @{}
  foreach ($path in $protectedFiles) {
    $absolute = Join-Path $userProfile $path
    $result[$path] = if (Test-Path -LiteralPath $absolute) { (Get-FileHash -LiteralPath $absolute -Algorithm SHA256).Hash } else { $null }
  }
  return $result
}
$before = Get-ProfileHashes
$receipt = [ordered]@{ status='not-passed'; version=$Version; installer=$Installer; installerSha256=(Get-FileHash -LiteralPath $Installer).Hash; target=$target; evidence=$evidence; startedAt=(Get-Date).ToString('o'); steps=@() }
function Save-Receipt { $receipt | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $evidence 'acceptance.json') -Encoding UTF8 }
function Assert-Condition($condition, [string]$message) { if (-not $condition) { throw $message } }
function Run-Executable([string]$file, [string[]]$arguments) {
  $process = Start-Process -FilePath $file -ArgumentList $arguments -WindowStyle Hidden -PassThru
  $deadline = (Get-Date).AddMinutes(8)
  while (-not $process.HasExited) {
    if ((Get-Date) -gt $deadline) { throw "Timed out waiting for owned process $($process.Id); retained for diagnosis" }
    Start-Sleep -Milliseconds 500
    $process.Refresh()
  }
  $process.WaitForExit()
  return $process.ExitCode
}
function Start-Witness {
  $process = Start-Process -FilePath $witnessExe -ArgumentList '-e','"setInterval(()=>{},1000)"' -WindowStyle Hidden -PassThru
  Start-Sleep -Milliseconds 500
  Assert-Condition (-not $process.HasExited) 'Witness did not start'
  return $process
}
function Stop-Witness($process) {
  if ($process -and -not $process.HasExited) {
    $actual = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)"
    Assert-Condition ($actual.ExecutablePath -eq $witnessExe) 'Witness ownership changed'
    $process.Kill(); $process.WaitForExit()
  }
}
$witness = $null
Save-Receipt
Write-Output "Installer acceptance evidence: $evidence"
try {
  $witness = Start-Witness
  $exitCode = Run-Executable $Installer @('/S','/currentuser',('/D=' + $target))
  $receipt.steps += @{ name='blocked-install'; exitCode=$exitCode; witnessAlive=(-not $witness.HasExited); targetExecutableExists=(Test-Path -LiteralPath (Join-Path $target 'Kuade.exe')); registryExists=(Test-Path -LiteralPath $registry) }; Save-Receipt
  Assert-Condition ($exitCode -eq 2 -and -not $witness.HasExited) 'Installer did not preserve unrelated running copy and reject with exit 2'
  Assert-Condition (-not (Test-Path -LiteralPath (Join-Path $target 'Kuade.exe')) -and -not (Test-Path -LiteralPath $registry)) 'Blocked installer changed installed state'
  Stop-Witness $witness; $witness = $null
  $exitCode = Run-Executable $Installer @('/S','/currentuser',('/D=' + $target))
  Assert-Condition ($exitCode -eq 0) 'Normal installation failed'
  Assert-Condition ((Get-ItemProperty -LiteralPath $registry).DisplayIcon -eq ($target + '\Kuade.exe,0')) 'Installed registry target mismatch'
  foreach ($relativePath in @('Kuade.exe','resources\app.asar')) {
    Assert-Condition ((Get-FileHash -LiteralPath (Join-Path $target $relativePath)).Hash -eq (Get-FileHash -LiteralPath (Join-Path $Unpacked $relativePath)).Hash) ('Installed hash mismatch: ' + $relativePath)
  }
  $receipt.steps += @{ name='install-and-hashes'; exitCode=$exitCode; status='passed' }; Save-Receipt
  Push-Location $BuildDirectory
  try {
    & $nodeExe (Join-Path $PSScriptRoot '..\check-packaged-startup.mjs') (Join-Path $target 'Kuade.exe') $Version (Join-Path $evidence 'startup')
    $startupExit = $LASTEXITCODE
  } finally { Pop-Location }
  $receipt.steps += @{ name='installed-startup'; exitCode=$startupExit }; Save-Receipt
  if (Get-CimInstance Win32_Process -Filter "Name='Kuade.exe'") { throw 'Startup check left a live Kuade instance; do not uninstall' }
  $witness = Start-Witness
  # _?= keeps the uninstaller in this process, so exit code and completion are observable.
  $exitCode = Run-Executable (Join-Path $target 'Uninstall Kuade.exe') @('/S','/currentuser',('_?=' + $target))
  $receipt.steps += @{ name='blocked-uninstall'; exitCode=$exitCode; witnessAlive=(-not $witness.HasExited); targetExecutableExists=(Test-Path -LiteralPath (Join-Path $target 'Kuade.exe')); registryExists=(Test-Path -LiteralPath $registry) }; Save-Receipt
  Assert-Condition ($exitCode -eq 2 -and -not $witness.HasExited) 'Uninstaller did not preserve unrelated running copy and reject with exit 2'
  Assert-Condition ((Test-Path -LiteralPath (Join-Path $target 'Kuade.exe')) -and (Test-Path -LiteralPath $registry)) 'Blocked uninstall changed installed state'
  Stop-Witness $witness; $witness = $null
  $exitCode = Run-Executable (Join-Path $target 'Uninstall Kuade.exe') @('/S','/currentuser',('_?=' + $target))
  Assert-Condition ($exitCode -eq 0 -and -not (Test-Path -LiteralPath (Join-Path $target 'Kuade.exe')) -and -not (Test-Path -LiteralPath $registry)) 'Uninstall did not finish'
  $receipt.steps += @{ name='uninstall'; exitCode=$exitCode; status='passed' }; Save-Receipt
  # Only remove the verified test target; NSIS leaves its own in-place executable.
  $resolvedTarget = (Resolve-Path -LiteralPath $target).Path
  Assert-Condition ($resolvedTarget -eq $target -and $target -match '^D:\\KI-[a-f0-9]{8}$') 'Cleanup target escaped owned test directory'
  Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
  $after = Get-ProfileHashes
  $receipt.userConfigurationUnchanged = $true
  foreach ($path in $protectedFiles) { if ($before[$path] -ne $after[$path]) { $receipt.userConfigurationUnchanged = $false } }
  Assert-Condition $receipt.userConfigurationUnchanged 'Original user configuration changed'
  Assert-Condition ($startupExit -eq 0) 'Installed startup check failed; installer lifecycle evidence retained separately'
  $receipt.status = 'passed'
} catch {
  $receipt.error = $_.Exception.Message
  throw
} finally {
  Stop-Witness $witness
  $receipt.finishedAt = (Get-Date).ToString('o'); Save-Receipt
}

param(
  [ValidateSet('Start','Run')][string]$Mode = 'Start',
  [Parameter(Mandatory=$true)][string]$Manifest
)
$ErrorActionPreference = 'Stop'
trap {
  if ($Mode -eq 'Run' -and $runDirectory -match '^D:\\Kuade-acceptance\\host-[a-f0-9-]{36}$') {
    @{ status='not-passed'; stage='host-validation'; error=$_.Exception.Message; finishedAt=(Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runDirectory 'bootstrap-error.json') -Encoding utf8
  }
  Write-Error $_ -ErrorAction Continue
  exit 1
}
$Manifest = (Resolve-Path -LiteralPath $Manifest).Path
$runDirectory = Split-Path -Parent $Manifest
$spec = Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json
if ($spec.schema -ne 1 -or $spec.kind -notin @('startup','recovery')) { throw 'Invalid acceptance host manifest' }
if ($spec.taskName -notmatch '^Kuade-Acceptance-[a-f0-9-]{36}$') { throw 'Invalid acceptance task name' }
if ($runDirectory -notmatch '^D:\\Kuade-acceptance\\host-[a-f0-9-]{36}$') { throw 'Expected an owned acceptance host directory' }
foreach ($path in @($spec.node, $spec.executable, $spec.workspace, $spec.workingDirectory, $spec.powerShellDirectory)) {
  if (-not [IO.Path]::IsPathRooted($path) -or $path.Contains('"') -or -not (Test-Path -LiteralPath $path)) { throw 'Missing or invalid host dependency path' }
}
if ($spec.kind -eq 'recovery') {
  if ($spec.durationMs -notin @(60000,7200000,86400000)) { throw 'Unsupported recovery acceptance duration' }
  if (-not (Test-Path -LiteralPath (Join-Path $spec.modelProfile 'harness/.credentials.yaml'))) { throw 'Saved model profile is missing' }
}
if ($Mode -eq 'Start') {
  if ($spec.kind -eq 'recovery') {
    # A packaged desktop's AppData view can be virtualized. Task Scheduler runs
    # outside that package, so store the actual existing directory, never keys.
    $physicalProfile = & $spec.node -e "process.stdout.write(require('node:fs').realpathSync.native(process.argv[1]))" $spec.modelProfile
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($physicalProfile)) { throw 'Could not resolve model profile directory' }
    $spec.modelProfile = $physicalProfile.Trim()
    $spec | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $Manifest -Encoding utf8
  }
  # The OS scheduler owns this process, independently of a terminal/chat lifetime.
  # No trigger is registered: this is a temporary, demand-started acceptance job.
  $action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$PSCommandPath+'" -Mode Run -Manifest "'+$Manifest+'"') -WorkingDirectory $spec.workingDirectory
  $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 28) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $spec.taskName -Action $action -Principal $principal -Settings $settings -Description 'Temporary Kuade desktop acceptance host; no recurrence, remove after receipt collection' | Out-Null
  Start-ScheduledTask -TaskName $spec.taskName
  @{ taskName=$spec.taskName; manifest=$Manifest; state='dispatched' } | ConvertTo-Json -Compress
  exit 0
}

$statePath = Join-Path $runDirectory 'host-state.json'
$state = @{ status='preparing'; taskName=$spec.taskName; hostPid=$PID; startedAt=(Get-Date).ToString('o'); kind=$spec.kind }
function Save-HostState {
  $temporary = $statePath+'.tmp'
  $state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temporary -Encoding utf8
  Move-Item -LiteralPath $temporary -Destination $statePath -Force
}
Save-HostState
try {
  # Scope all environment changes to this scheduler-owned process and its child.
  Get-ChildItem Env: | Where-Object { $_.Name -match '(API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET)$|^(DSH_|DEEPSEEK_|OPENAI_|ANTHROPIC_|ELECTRON_|NODE_OPTIONS$|NODE_PATH$|KUADE_)' } | ForEach-Object { [Environment]::SetEnvironmentVariable($_.Name,$null,'Process') }
  $env:PATH = $spec.powerShellDirectory+';'+(Split-Path -Parent $spec.node)+';'+$env:PATH
  if ($spec.kind -eq 'startup') {
    $script = Join-Path $spec.workspace 'scripts/check-packaged-startup.mjs'
    $arguments = @('"'+$script+'"','"'+$spec.executable+'"',$spec.version,'"'+(Join-Path $runDirectory 'startup')+'"')
  } else {
    $script = Join-Path $spec.workspace 'scripts/accept-real-recovery.mjs'
    $arguments = @('"'+$script+'"')
    $env:KUADE_REAL_RECOVERY='1'; $env:KUADE_RECOVERY_GOAL='1'
    $env:KUADE_RECOVERY_SOAK_MS=[string]$spec.durationMs
    $env:KUADE_MODEL_PROFILE=$spec.modelProfile
    $env:KUADE_ACCEPT_EXECUTABLE=$spec.executable
    $env:KUADE_ACCEPT_ROOT=$runDirectory
  }
  $state.scriptSha256 = (Get-FileHash -LiteralPath $script -Algorithm SHA256).Hash.ToLowerInvariant()
  Copy-Item -LiteralPath $script -Destination (Join-Path $runDirectory 'runner-source.mjs')
  if ((Get-FileHash -LiteralPath (Join-Path $runDirectory 'runner-source.mjs') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $state.scriptSha256) { throw 'Runner changed while capturing acceptance source' }
  $state.executableSha256 = (Get-FileHash -LiteralPath $spec.executable -Algorithm SHA256).Hash.ToLowerInvariant()
  $child = Start-Process -FilePath $spec.node -ArgumentList $arguments -WorkingDirectory $spec.workingDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runDirectory 'stdout.log') -RedirectStandardError (Join-Path $runDirectory 'stderr.log')
  # Windows PowerShell can lose ExitCode for a process obtained by ID after it
  # exits. Retain its native handle before waiting; null never means success.
  $childHandle = $child.Handle
  $state.status='running'; $state.childPid=$child.Id; Save-HostState
  $child.WaitForExit()
  $state.exitCode=$child.ExitCode
  if ($null -eq $child.ExitCode -or $child.ExitCode -ne 0) { throw 'Acceptance child did not exit successfully' }
  $state.status='passed'
} catch {
  $state.status='not-passed'; $state.error=$_.Exception.Message
} finally {
  $state.finishedAt=(Get-Date).ToString('o'); Save-HostState
}
if ($state.status -ne 'passed') { exit 1 }
exit 0

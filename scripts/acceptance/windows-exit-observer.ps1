param(
  [Parameter(Mandatory=$true)][int]$ProcessId,
  [Parameter(Mandatory=$true)][string]$ExpectedExecutable,
  [Parameter(Mandatory=$true)][string]$ExpectedStartTime,
  [Parameter(Mandatory=$true)][string]$Evidence
)
$ErrorActionPreference='Stop'
$Evidence=(Resolve-Path -LiteralPath $Evidence).Path
if ($Evidence -notmatch '^D:\\Kuade-acceptance\\host-[a-f0-9-]{36}$') { throw 'Expected an owned acceptance directory' }
$process=[Diagnostics.Process]::GetProcessById($ProcessId)
$expected=(Resolve-Path -LiteralPath $ExpectedExecutable).Path
if ($process.Path -ne $expected) { throw 'Observed executable identity mismatch' }
$created=$process.StartTime.ToUniversalTime()
if ([Math]::Abs(($created-[DateTimeOffset]::Parse($ExpectedStartTime).UtcDateTime).TotalMilliseconds) -gt 1) { throw 'Observed process creation time mismatch' }
# Retain a kernel handle to this process, rather than looking up a reusable PID
# after it exits. This works even when the process is not our child.
$nativeHandle=$process.Handle
$receipt=@{status='running';processId=$ProcessId;executable=$expected;processStartedAt=$created.ToString('o');observerPid=$PID;attachedAt=(Get-Date).ToString('o')}
$target=Join-Path $Evidence 'exit-observation.json'
function Save-Observation {
  $temporary=$target+'.tmp'
  $receipt | ConvertTo-Json | Set-Content -LiteralPath $temporary -Encoding utf8
  Move-Item -LiteralPath $temporary -Destination $target -Force
}
Save-Observation
try {
  $process.WaitForExit()
  if ($null -eq $process.ExitCode) { throw 'Observed process exit code is unavailable' }
  $receipt.status='exited';$receipt.exitCode=$process.ExitCode
} catch {
  $receipt.status='not-passed';$receipt.error=$_.Exception.Message
} finally {
  $receipt.finishedAt=(Get-Date).ToString('o');Save-Observation
  $process.Dispose()
}
if ($receipt.status -ne 'exited') { exit 1 }
exit 0

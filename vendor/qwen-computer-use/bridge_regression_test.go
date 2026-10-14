package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestWindowsKeyboardBridgeTypesAndModifiers(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows PowerShell")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "runtime.ps1")
	if err := os.WriteFile(path, []byte(windowsRuntimeScript), 0600); err != nil {
		t.Fatal(err)
	}
	// Execute the real key parser and dispatcher against a recording C# boundary.
	// No desktop input is produced by this regression.
	script := `$ErrorActionPreference='Stop';
Add-Type 'public static class OcuDesktop { public static string Result; public static int CharacterKey(System.IntPtr h,char c) { switch(c) { case (char)43:return 443; case (char)45:return 189; case (char)42:return 312; case (char)47:return 191; case (char)46:return 190; case (char)61:return 187; case (char)40:return 305; default:throw new System.Exception("Missing keyboard layout mapping");} } public static void Chord(System.IntPtr h, ushort[] m, ushort k) { Result=string.Join(",",m)+":"+k; } }';
$ast=[System.Management.Automation.Language.Parser]::ParseFile('` + strings.ReplaceAll(path, "'", "''") + `',[ref]$null,[ref]$null);
$names=@('Get-VirtualKey','Send-Key','Test-EnvFlagEnabled');
$ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $names -contains $n.Name},$true) | ForEach-Object {Invoke-Expression $_.Extent.Text};
$env:OPEN_COMPUTER_USE_WINDOWS_FOREGROUND_INPUT='1';
Send-Key ([IntPtr]1) 'ctrl+shift+return';
[OcuDesktop]::Result;
foreach($entry in @(@('plus','16:187'),@('KP_Add',':107'),@('minus',':189'),@('KP_Subtract',':109'),@('asterisk','16:56'),@('KP_Multiply',':106'),@('slash',':191'),@('KP_Divide',':111'),@('period',':190'),@('equal',':187'),@('parenleft','16:49'))) {Send-Key ([IntPtr]1) $entry[0];if([OcuDesktop]::Result -ne $entry[1]){throw 'Wrong symbol mapping'}};
Send-Key ([IntPtr]1) 'Control_L+Shift_L+Return';if([OcuDesktop]::Result -ne '17,16:13'){throw 'Modifier alias dropped'};
$before=[OcuDesktop]::Result;$denied=$false;try {Send-Key ([IntPtr]1) 'typo+a'}catch{$denied=$true};if(-not $denied -or [OcuDesktop]::Result -ne $before){throw 'Bad modifier dispatched'};
foreach($key in @('super','win','LWin','super_l','rwin')) { Send-Key ([IntPtr]1) $key; [OcuDesktop]::Result }`
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	hideRuntimeWindow(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	if strings.Join(strings.Fields(string(out)), "|") != "17,16:13|:91|:91|:91|:91|:92" {
		t.Fatalf("wrong chord: %s", out)
	}
}

// Exercises the same UTF-8 file -> Windows PowerShell -> JSON stdout bridge
// used by actions, without dispatching input or creating a window.
func TestWindowsBridgePreservesUnicode(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows bridge")
	}
	t.Setenv("OPEN_COMPUTER_USE_WINDOWS_ALLOW_APP_LAUNCH", "0")
	name := "OCU_missing_中文你好_é_😀_9a18c670"
	r, err := runPowerShell(psRequest{Tool: "get_app_state", App: name})
	if err != nil {
		t.Fatal(err)
	}
	if r.OK || !strings.Contains(r.Error, name) {
		t.Fatalf("Unicode request/response damaged: %#v", r)
	}
}

func TestObservedWindowSurvivesTransientProcessMainWindow(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows PowerShell")
	}
	path := filepath.Join(t.TempDir(), "runtime.ps1")
	if err := os.WriteFile(path, []byte(windowsRuntimeScript), 0600); err != nil {
		t.Fatal(err)
	}
	script := `$ErrorActionPreference='Stop';
Add-Type 'public static class OcuDesktop { public static bool BelongsToProcess(System.IntPtr h,int p){return h.ToInt64()==11 && p==7;} public static System.IntPtr InitialWindow(int p,System.IntPtr c){return new System.IntPtr(11);} public static uint WindowProcessId(System.IntPtr h){return 7;} public static string Title(System.IntPtr h){return "main";} }';
$ast=[System.Management.Automation.Language.Parser]::ParseFile('` + strings.ReplaceAll(path, "'", "''") + `',[ref]$null,[ref]$null);
$ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Resolve-ObservedApp'},$true) | ForEach-Object {Invoke-Expression $_.Extent.Text};
function Resolve-App {return [pscustomobject]@{Id=7;ProcessName='Example';MainWindowHandle=[IntPtr]22;MainWindowTitle='popup'}};
function Get-Process {param([int]$Id) return [pscustomobject]@{Id=$Id;ProcessName='Example';MainWindowHandle=[IntPtr]0}};
$bound=Resolve-ObservedApp 'Example' 11 7 $true;
$originalResolver=(Get-Item Function:Resolve-App).ScriptBlock;
function Resolve-App {throw 'appNotFound: shell flyout is absent from process main windows'};
$flyout=Resolve-ObservedApp 'SearchHost' 11 7 $true;
if($flyout.MainWindowHandle.ToInt64() -ne 11 -or $flyout.Id -ne 7){throw 'Observed flyout lost'};
Set-Item Function:Resolve-App $originalResolver;
if($bound.MainWindowHandle.ToInt64() -ne 11){throw 'Retargeted to popup'};
$rejected=$false;try {Resolve-ObservedApp 'Example' 99 7 $true | Out-Null} catch {$rejected=$true};
if(-not $rejected){throw 'Closed target silently replaced'};
$fresh=Resolve-ObservedApp 'Example';
if($fresh.MainWindowHandle.ToInt64() -ne 11){throw 'Initial selection omitted'};
'bound;closed-rejected;fresh-selected'`
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	hideRuntimeWindow(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil || strings.TrimSpace(string(out)) != "bound;closed-rejected;fresh-selected" {
		t.Fatalf("window binding: %v: %s", err, out)
	}
}

func TestMutationsRequireObservedWindow(t *testing.T) {
	for _, r := range []psRequest{{Tool: "type_text", Text: "do not dispatch"}, {Tool: "press_key", Key: "enter"}, {Tool: "click"}} {
		got := newService().actionResult("missing", r)
		if !got.IsError || !strings.Contains(got.Content[0].Text, "Observe") {
			t.Fatalf("Unbound mutation accepted: %#v", got)
		}
	}
}

func TestUnavailableScreenshotIsExplicit(t *testing.T) {
	s := &appSnapshot{App: appDescriptor{Name: "Example"}}
	if !strings.Contains(s.renderedText(), "Screenshot unavailable") {
		t.Fatal("Missing image is silently treated as visual evidence")
	}
	s.ScreenshotPNGBase64 = "present"
	if strings.Contains(s.renderedText(), "Screenshot unavailable") {
		t.Fatal("Present screenshot reported missing")
	}
}

func TestWindowsScrollCoordinatesUseScreenshotOrigin(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows PowerShell")
	}
	file := filepath.Join(t.TempDir(), "runtime.ps1")
	if err := os.WriteFile(file, []byte(windowsRuntimeScript), 0600); err != nil {
		t.Fatal(err)
	}
	script := "$ast=[System.Management.Automation.Language.Parser]::ParseFile('" + strings.ReplaceAll(file, "'", "''") + "',[ref]$null,[ref]$null); $ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Get-ScrollPoint'},$true) | ForEach-Object {Invoke-Expression $_.Extent.Text}; $p=Get-ScrollPoint ([pscustomobject]@{x=220;y=600}) ([pscustomobject]@{x=-1920;y=80}); [string]$p.x+','+[string]$p.y"
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	hideRuntimeWindow(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil || strings.TrimSpace(string(out)) != "-1700,680" {
		t.Fatalf("wrong desktop point: %s %v", out, err)
	}
}

func TestPostActionObservationFailureDoesNotDenyDispatch(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows PowerShell")
	}
	file := filepath.Join(t.TempDir(), "runtime.ps1")
	if err := os.WriteFile(file, []byte(windowsRuntimeScript), 0600); err != nil {
		t.Fatal(err)
	}
	script := "$ErrorActionPreference='Stop'; $ast=[System.Management.Automation.Language.Parser]::ParseFile('" + strings.ReplaceAll(file, "'", "''") + "',[ref]$null,[ref]$null); $ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Build-AfterActionResponse'},$true) | ForEach-Object {Invoke-Expression $_.Extent.Text}; function Build-Snapshot {throw 'Target window identity changed; no input dispatched.'}; $r=Build-AfterActionResponse ([pscustomobject]@{app='explorer';expectedWindow=11;expectedPid=7}); if(-not $r.ok -or -not $r.actionDispatched -or $r.text -match 'no input dispatched' -or $r.text -notmatch 'before any retry'){throw 'Incorrect dispatch outcome'}; 'dispatched-observation-unavailable'"
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	hideRuntimeWindow(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil || strings.TrimSpace(string(out)) != "dispatched-observation-unavailable" {
		t.Fatalf("after-state semantics: %v: %s", err, out)
	}
}

func TestUnavailableAfterStateExpiresAllWindowSnapshots(t *testing.T) {
	s := newService()
	original := &appSnapshot{WindowHandle: 11, App: appDescriptor{Name: "Example", PID: 7}}
	unrelated := &appSnapshot{WindowHandle: 22, App: appDescriptor{Name: "Other", PID: 8}}
	s.rememberSnapshot("foreground", original)
	s.rememberSnapshot("Other", unrelated)
	snapshot, result := s.acceptSnapshotResponse("Example", psRequest{Tool: "press_key", ExpectedWindow: 11, ExpectedPID: 7}, psResponse{OK: true, ActionDispatched: true, Text: "Action dispatched; observe foreground before retrying."})
	if snapshot != nil || result.IsError || !strings.Contains(result.Content[0].Text, "dispatched") {
		t.Fatalf("lost dispatch evidence: %#v", result)
	}
	for _, alias := range []string{"Example", "7", "foreground"} {
		if s.currentSnapshot(alias) != nil {
			t.Errorf("stale alias: %s", alias)
		}
	}
	if s.currentSnapshot("Other") != nil {
		t.Fatal("pre-action state survived an unobserved transition")
	}
	_, invalid := s.acceptSnapshotResponse("Example", psRequest{Tool: "get_app_state"}, psResponse{OK: true, ActionDispatched: true})
	if !invalid.IsError {
		t.Fatal("read without snapshot accepted as dispatch")
	}
}

func TestHiddenWindowNeverReturnsCachedPixels(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows PowerShell")
	}
	file := filepath.Join(t.TempDir(), "runtime.ps1")
	if err := os.WriteFile(file, []byte(windowsRuntimeScript), 0600); err != nil {
		t.Fatal(err)
	}
	script := `$ErrorActionPreference='Stop';Add-Type 'public static class OcuDesktop { public static bool WindowVisible(System.IntPtr w){return false;} public static bool IsIconic(System.IntPtr w){throw new System.Exception("Hidden capture continued");} }';$ast=[System.Management.Automation.Language.Parser]::ParseFile('` + strings.ReplaceAll(file, "'", "''") + `',[ref]$null,[ref]$null);$ast.FindAll({param($n)$n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Capture-WindowPngBase64'},$true)|ForEach-Object{Invoke-Expression $_.Extent.Text};$r=Capture-WindowPngBase64 ([IntPtr]11) ([pscustomobject]@{width=1536;height=1200});if($null -ne $r){throw 'Hidden pixels returned'};'hidden-no-image'`
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	hideRuntimeWindow(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil || strings.TrimSpace(string(out)) != "hidden-no-image" {
		t.Fatalf("hidden capture: %v: %s", err, out)
	}
}

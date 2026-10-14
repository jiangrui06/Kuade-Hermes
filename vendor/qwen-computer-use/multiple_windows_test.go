package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestWindowSelectorsExposeAndBindEachWindow(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows bridge")
	}
	path := filepath.Join(t.TempDir(), "runtime.ps1")
	if err := os.WriteFile(path, []byte(windowsRuntimeScript), 0600); err != nil {
		t.Fatal(err)
	}
	script := `$ErrorActionPreference='Stop';
 Add-Type 'public static class OcuDesktop { public static System.IntPtr[] VisibleWindows(){return new[]{new System.IntPtr(11),new System.IntPtr(12),new System.IntPtr(21)};} public static uint WindowProcessId(System.IntPtr h){return h.ToInt64()==21?8u:7u;} public static bool BelongsToProcess(System.IntPtr h,int p){return (h.ToInt64()==11||h.ToInt64()==12||h.ToInt64()==21)&&WindowProcessId(h)==p;} public static string Title(System.IntPtr h){return h.ToInt64()==12?"Image viewer":"Chat";} public static System.IntPtr InitialWindow(int p,System.IntPtr h){throw new System.Exception("Exact window was replaced");} }';
 function Get-Process {param([int]$Id) return [pscustomobject]@{Id=$Id;ProcessName='ChatApp';MainWindowHandle=[IntPtr]12;MainWindowTitle='Image viewer'}};
 $ast=[System.Management.Automation.Language.Parser]::ParseFile('` + strings.ReplaceAll(path, "'", "''") + `',[ref]$null,[ref]$null);
 $ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -in @('Resolve-App','Resolve-ObservedApp','List-Apps')},$true)|ForEach-Object {Invoke-Expression $_.Extent.Text};
 $lines=(List-Apps).Split([char]10);if($lines.Count -ne 3){throw 'A window was hidden by process grouping'};
 foreach($selector in @('window:7:11','window:7:12','window:8:21')){if(-not ($lines -match [regex]::Escape($selector))){throw 'Missing selector'};$p=Resolve-ObservedApp $selector;if($p.MainWindowHandle.ToInt64() -ne [int64]$selector.Split(':')[2]){throw 'Wrong window selected'}};
 foreach($selector in @('window:8:11','window:7:99')){$rejected=$false;try {Resolve-App $selector|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Stale or reused window accepted'}};
 'multiple;exact;owner;stale'`
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	hideRuntimeWindow(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil || strings.TrimSpace(string(out)) != "multiple;exact;owner;stale" {
		t.Fatalf("window selectors: %v: %s", err, out)
	}
}

func TestExplicitWindowSnapshotsRemainSeparateInOneProcess(t *testing.T) {
	s := newService()
	chat := &appSnapshot{App: appDescriptor{Name: "ChatApp", PID: 7}, WindowHandle: 11}
	viewer := &appSnapshot{App: chat.App, WindowHandle: 12}
	s.rememberSnapshot("window:7:11", chat)
	s.rememberSnapshot("window:7:12", viewer)
	if s.currentSnapshot("window:7:11") != chat || s.currentSnapshot("window:7:12") != viewer {
		t.Fatal("window aliases crossed")
	}
}

func TestForegroundSnapshotCanBeAddressedByExactWindow(t *testing.T) {
	s := newService()
	first := &appSnapshot{App: appDescriptor{Name: "ChatApp", PID: 7}, WindowHandle: 11}
	s.rememberSnapshot("foreground", first)
	if s.currentSnapshot("window:7:11") != first {
		t.Fatal("fresh foreground observation lost its exact window identity")
	}
	second := &appSnapshot{App: appDescriptor{Name: "ChatApp", PID: 7}, WindowHandle: 12}
	s.rememberSnapshot("foreground", second)
	if s.currentSnapshot("window:7:11") != first || s.currentSnapshot("window:7:12") != second {
		t.Fatal("same-process windows crossed")
	}
	s.acceptSnapshotResponse("foreground", psRequest{Tool: "click"}, psResponse{OK: true, ActionDispatched: true, Snapshot: second})
	if s.currentSnapshot("window:7:11") != nil {
		t.Fatal("input preserved stale window alias")
	}
	if s.currentSnapshot("window:7:12") != second {
		t.Fatal("action after-state lost exact window identity")
	}
	reused := &appSnapshot{App: appDescriptor{Name: "OtherApp", PID: 8}, WindowHandle: 12}
	s.acceptSnapshotResponse("foreground", psRequest{Tool: "click"}, psResponse{OK: true, ActionDispatched: true, Snapshot: reused})
	if s.currentSnapshot("window:7:12") != nil || s.currentSnapshot("window:8:12") != reused {
		t.Fatal("reused window mixed owners")
	}
}

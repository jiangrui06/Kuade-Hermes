package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestInitialWindowSelectsHostedFrameWithoutGuessing(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows C# compiler")
	}
	source := strings.Replace(desktopInputSource, "public static class OcuDesktop {", "public static class OcuDesktop { public static int Scenario;", 1)
	replacements := map[string]string{
		`[DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);`:                              `static IntPtr GetAncestor(IntPtr window,uint flags){return Scenario==1?new IntPtr(101):window;}`,
		`[DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);`:             `static uint GetWindowThreadProcessId(IntPtr window,out uint process){process=window.ToInt64()<100?7u:42u;return 1;}`,
		`[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);`:                                        `static bool IsWindowVisible(IntPtr window){return Scenario!=5;}`,
		`[DllImport("user32.dll")] static extern int GetWindowLong(IntPtr window, int index);`:                                `static int GetWindowLong(IntPtr window,int index){return index==-16?0x00C00000:0;}`,
		`[DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowProc callback, IntPtr data);`:                     `static bool EnumWindows(EnumWindowProc callback,IntPtr data){callback(new IntPtr(101),data);if(Scenario==3)callback(new IntPtr(102),data);return true;}`,
		`[DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumWindowProc callback, IntPtr data);`: `static bool EnumChildWindows(IntPtr parent,EnumWindowProc callback,IntPtr data){if(Scenario!=4)callback(new IntPtr(12),data);return true;}`,
	}
	replacements[`[DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out uint value, int size);`] = `static int DwmGetWindowAttribute(IntPtr window,int attribute,out uint value,int size){if(attribute!=14||size!=4)throw new Exception("Wrong DWM query");value=Scenario==6?2u:0u;return Scenario==7?-1:0;}`
	for from, to := range replacements {
		if !strings.Contains(source, from) {
			t.Fatalf("Native boundary changed: %s", from)
		}
		source = strings.Replace(source, from, to, 1)
	}
	file := filepath.Join(t.TempDir(), "fixture.cs")
	if err := os.WriteFile(file, []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	// Only the Win32 boundary is replaced. Production selection logic runs intact;
	// no real window enumeration, activation or input is performed.
	script := `$ErrorActionPreference='Stop';Add-Type -Path '` + strings.ReplaceAll(file, "'", "''") + `';
[OcuDesktop]::Scenario=1;if([OcuDesktop]::InitialWindow(7,[IntPtr]11).ToInt64() -ne 101){throw 'Child frame lost'};
[OcuDesktop]::Scenario=2;if([OcuDesktop]::InitialWindow(7,[IntPtr]11).ToInt64() -ne 101){throw 'Detached main window selected instead of hosted frame'};
[OcuDesktop]::Scenario=3;$rejected=$false;try{[OcuDesktop]::InitialWindow(7,[IntPtr]11)|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Ambiguous hosts guessed'};
[OcuDesktop]::Scenario=4;if([OcuDesktop]::InitialWindow(7,[IntPtr]21).ToInt64() -ne 21){throw 'Normal window changed'};
[OcuDesktop]::Scenario=5;if([OcuDesktop]::WindowVisible([IntPtr]11)){throw 'Invisible capture allowed'};
[OcuDesktop]::Scenario=6;if([OcuDesktop]::WindowVisible([IntPtr]11)){throw 'Cloaked capture allowed'};
[OcuDesktop]::Scenario=7;if([OcuDesktop]::WindowVisible([IntPtr]11)){throw 'Unknown visibility guessed'};
[OcuDesktop]::Scenario=4;if(-not [OcuDesktop]::WindowVisible([IntPtr]11)){throw 'Visible capture rejected'};
'child;detached;ambiguous;normal'`
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	hideRuntimeWindow(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil || strings.TrimSpace(string(out)) != "child;detached;ambiguous;normal" {
		t.Fatalf("window selection: %v: %s", err, out)
	}
}

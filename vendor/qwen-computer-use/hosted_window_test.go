package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestHostedWindowBindsActualFrameOwner(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows PowerShell")
	}
	file := filepath.Join(t.TempDir(), "runtime.ps1")
	if err := os.WriteFile(file, []byte(windowsRuntimeScript), 0600); err != nil {
		t.Fatal(err)
	}
	// Exercise the production binding code against a hosted-window relationship.
	// No windows are activated and no desktop input is sent.
	script := `$ErrorActionPreference='Stop';
Add-Type 'public static class OcuDesktop {
 public static bool Alive=true;
 public static bool BelongsToProcess(System.IntPtr h,int p){return Alive && h.ToInt64()==101 && p==42;}
 public static System.IntPtr InitialWindow(int p,System.IntPtr c){return new System.IntPtr(101);}
 public static uint WindowProcessId(System.IntPtr h){return Alive ? 42u : 0u;}
 public static string Title(System.IntPtr h){return "Hosted window";}
}';
$ast=[System.Management.Automation.Language.Parser]::ParseFile('` + strings.ReplaceAll(file, "'", "''") + `',[ref]$null,[ref]$null);
$ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Resolve-ObservedApp'},$true) | ForEach-Object {Invoke-Expression $_.Extent.Text};
function Resolve-App {return [pscustomobject]@{Id=7;ProcessName='HostedApp';MainWindowHandle=[IntPtr]11}};
function Get-Process {param([int]$Id) if($Id -ne 42){throw 'Unexpected owner'};return [pscustomobject]@{Id=42;ProcessName='FrameHost'}};
$fresh=Resolve-ObservedApp 'HostedApp';
if($fresh.Id -ne 42 -or $fresh.MainWindowHandle.ToInt64() -ne 101 -or $fresh.ProcessName -ne 'FrameHost'){throw 'Frame and owner mismatch'};
$bound=Resolve-ObservedApp 'HostedApp' 101 42 $true;
if($bound.Id -ne 42 -or $bound.MainWindowHandle.ToInt64() -ne 101){throw 'Observed binding changed'};
$rejected=$false;try {Resolve-ObservedApp 'HostedApp' 101 7 $true | Out-Null} catch {$rejected=$true};
if(-not $rejected){throw 'Wrong owner accepted'};
[OcuDesktop]::Alive=$false;
$rejected=$false;try {Resolve-ObservedApp 'HostedApp' 101 42 $true | Out-Null} catch {$rejected=$true};
if(-not $rejected){throw 'Closed frame accepted'};
'hosted-frame-bound;wrong-owner-rejected;closed-rejected'`
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	hideRuntimeWindow(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil || strings.TrimSpace(string(out)) != "hosted-frame-bound;wrong-owner-rejected;closed-rejected" {
		t.Fatalf("hosted binding: %v: %s", err, out)
	}
}

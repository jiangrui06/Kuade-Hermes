package main

import (
	"os/exec"
	"syscall"
)

func hideRuntimeWindow(cmd *exec.Cmd) {
	// A per-call PowerShell console must not steal focus from the target app.
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
}

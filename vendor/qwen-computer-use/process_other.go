//go:build !windows

package main

import "os/exec"

func hideRuntimeWindow(cmd *exec.Cmd) {}

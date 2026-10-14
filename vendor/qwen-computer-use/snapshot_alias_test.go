package main

import "testing"

func TestFreshWindowStateUpdatesAllObservedAliases(t *testing.T) {
	s := newService()
	minimized := &appSnapshot{App: appDescriptor{Name: "FrameHost", PID: 42}, WindowHandle: 101, WindowBounds: &frame{Width: 0, Height: 0}}
	s.rememberSnapshot("HostedApp", minimized)
	other := &appSnapshot{App: appDescriptor{Name: "Other", PID: 43}, WindowHandle: 102}
	s.rememberSnapshot("Other", other)
	restored := &appSnapshot{App: minimized.App, WindowHandle: 101, WindowBounds: &frame{Width: 1558, Height: 1212}}
	s.rememberSnapshot("FrameHost", restored)
	for _, alias := range []string{"HostedApp", "FrameHost", "42"} {
		if s.currentSnapshot(alias) != restored {
			t.Fatalf("%s retains pre-restore geometry", alias)
		}
	}
	if s.currentSnapshot("Other") != other {
		t.Fatal("unrelated window changed")
	}
	// Reused handles owned by another process must not retarget old app aliases.
	replacement := &appSnapshot{App: appDescriptor{Name: "Replacement", PID: 99}, WindowHandle: 101}
	s.rememberSnapshot("Replacement", replacement)
	if s.currentSnapshot("HostedApp") != restored {
		t.Fatal("old alias retargeted to new process")
	}
}

func TestMutationExpiresOtherWindowSnapshots(t *testing.T) {
	s := newService()
	content := &appSnapshot{App: appDescriptor{Name: "Content", PID: 7}, WindowHandle: 11}
	shell := &appSnapshot{App: appDescriptor{Name: "Frame", PID: 42}, WindowHandle: 101}
	s.rememberSnapshot("Content", content)
	s.rememberSnapshot("foreground", shell)
	fresh := &appSnapshot{App: shell.App, WindowHandle: 101, WindowBounds: &frame{Width: 1558, Height: 1212}}
	s.acceptSnapshotResponse("Frame", psRequest{Tool: "perform_secondary_action", ExpectedWindow: 101, ExpectedPID: 42}, psResponse{OK: true, ActionDispatched: true, Snapshot: fresh})
	if s.currentSnapshot("Content") != nil {
		t.Fatal("content window keeps stale pre-restore state")
	}
	if s.currentSnapshot("foreground") != fresh {
		t.Fatal("observed frame alias lost its after-state")
	}
	r := s.click("Content", "", nil, nil, 1, "left")
	if !r.IsError {
		t.Fatal("expired window accepted input")
	}
}

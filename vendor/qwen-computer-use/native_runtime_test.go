package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"
)

// The subprocess speaks the real stdin/stdout wire format, without desktop input.
func TestMain(m *testing.M) {
	if os.Getenv("CODEPRO_NATIVE_RUNTIME_FIXTURE") == "1" {
		var request psRequest
		if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
			os.Exit(2)
		}
		fmt.Fprintln(os.Stderr, "native diagnostic must not corrupt JSON stdout")
		if request.Text == "malformed" {
			fmt.Print("not json")
			os.Exit(0)
		}
		_ = json.NewEncoder(os.Stdout).Encode(psResponse{OK: true, Text: request.Text, Snapshot: &appSnapshot{
			App: appDescriptor{Name: "文本编辑", PID: 71}, WindowHandle: 902,
			WindowBounds:        &frame{X: -500, Y: 30, Width: 640, Height: 480},
			ScreenshotPNGBase64: "aW1hZ2U=",
		}})
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func TestNativeTransportPreservesUnicodeAndWindowReceipt(t *testing.T) {
	t.Setenv("CODEPRO_NATIVE_RUNTIME_FIXTURE", "1")
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	text := "中文🙂\n$(not-a-command) `literal`"
	response, err := runNativeRuntime(context.Background(), executable, psRequest{Tool: "type_text", Text: text})
	if err != nil {
		t.Fatal(err)
	}
	if response.Text != text || response.Snapshot.WindowHandle != 902 || response.Snapshot.App.PID != 71 {
		t.Fatalf("wire data changed: %#v", response)
	}
	if response.Snapshot.result().StructuredContent == nil {
		t.Fatal("missing structured observation")
	}
}

func TestNativeTransportRejectsMalformedAndCancelledResponse(t *testing.T) {
	t.Setenv("CODEPRO_NATIVE_RUNTIME_FIXTURE", "1")
	executable, _ := os.Executable()
	if _, err := runNativeRuntime(context.Background(), executable, psRequest{Text: "malformed"}); err == nil {
		t.Fatal("accepted malformed native response")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := runNativeRuntime(ctx, executable, psRequest{}); err == nil {
		t.Fatal("accepted cancelled input")
	}
}

func TestUncertainInputInvalidatesEveryObservedWindow(t *testing.T) {
	svc := newService()
	svc.rememberSnapshot("editor", &appSnapshot{App: appDescriptor{PID: 71}, WindowHandle: 902})
	svc.rememberSnapshot("browser", &appSnapshot{App: appDescriptor{PID: 72}, WindowHandle: 903})
	_, result := svc.acceptSnapshotResponse("editor", psRequest{Tool: "type_text"}, psResponse{OK: false, ActionDispatched: true, Error: "after-image unavailable"})
	if !result.IsError || len(svc.snapshots) != 0 {
		t.Fatal("uncertain input retained stale action targets")
	}
}

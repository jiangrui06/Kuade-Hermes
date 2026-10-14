package main

import (
	"bytes"
	"encoding/json"
	"runtime"
	"strings"
	"testing"
)

func TestToolDefinitionCount(t *testing.T) {
	// A leftover hybrid launch environment must never hide the standard MCP tools.
	t.Setenv("OPEN_COMPUTER_USE_HOST_CONTROLLED", "1")
	if got := len(toolDefinitions()); got != 9 {
		t.Fatalf("toolDefinitions() count = %d, want 9", got)
	}
}

func TestCallSequenceStopsAfterFirstToolError(t *testing.T) {
	output, hasError, err := runCallCommand([]string{
		"--calls",
		`[{"tool":"not_a_tool"},{"tool":"list_apps"}]`,
	}, newService())
	if err != nil {
		t.Fatal(err)
	}
	if !hasError {
		t.Fatal("expected hasError")
	}
	items, ok := output.([]map[string]any)
	if !ok {
		t.Fatalf("output type = %T", output)
	}
	if len(items) != 1 {
		t.Fatalf("sequence output count = %d, want 1", len(items))
	}
}

func TestReadArgumentsAcceptsJSONObject(t *testing.T) {
	args, err := readArguments(`{"app":"Notepad","pages":2}`, "")
	if err != nil {
		t.Fatal(err)
	}
	if args["app"] != "Notepad" {
		t.Fatalf("app = %v", args["app"])
	}
	if args["pages"].(json.Number).String() != "2" {
		t.Fatalf("pages = %v", args["pages"])
	}
}

func TestMCPInitializeResponseContainsToolsCapability(t *testing.T) {
	request := map[string]any{
		"jsonrpc": "2.0",
		"id":      float64(1),
		"method":  "initialize",
		"params":  map[string]any{},
	}
	response := handleMCPRequest(request, newService())
	result, ok := response["result"].(map[string]any)
	if !ok {
		t.Fatalf("missing result: %#v", response)
	}
	capabilities := result["capabilities"].(map[string]any)
	if _, ok := capabilities["tools"]; !ok {
		t.Fatalf("missing tools capability: %#v", capabilities)
	}
}

func TestCLIHelpMentionsDesktopRuntime(t *testing.T) {
	var out bytes.Buffer
	if err := runCLI([]string{"--help"}, &out); err != nil {
		t.Fatal(err)
	}
	want := "Open Computer Use for Windows"
	if runtime.GOOS == "darwin" {
		want = "Open Computer Use for macOS"
	}
	if !strings.Contains(out.String(), want) {
		t.Fatalf("help text did not identify the desktop runtime:\n%s", out.String())
	}
}

func TestWindowsRuntimeForegroundActionsRequireOptIn(t *testing.T) {
	if !strings.Contains(windowsRuntimeScript, "OPEN_COMPUTER_USE_WINDOWS_ALLOW_APP_LAUNCH") {
		t.Fatal("Windows app launch fallback must remain opt-in")
	}
	if !strings.Contains(windowsRuntimeScript, "OPEN_COMPUTER_USE_WINDOWS_ALLOW_FOCUS_ACTIONS") {
		t.Fatal("Windows SetFocus action must remain opt-in")
	}
	if !strings.Contains(windowsRuntimeScript, "OPEN_COMPUTER_USE_WINDOWS_ALLOW_UIA_TEXT_FALLBACK") {
		t.Fatal("Windows UIA text fallback must remain opt-in")
	}
	if !strings.Contains(serverInstructions, "does not auto-launch apps, perform SetFocus, or use UIA text fallback by default") {
		t.Fatal("MCP instructions must document the Windows background-focus policy")
	}
}

func TestScrollTargetsObservedPaneAndRejectsInvalidCoordinates(t *testing.T) {
	snapshot := &appSnapshot{WindowBounds: &frame{X: -1920, Y: 80, Width: 1300, Height: 931}, Elements: []elementRecord{{Index: 0, Frame: &frame{Width: 1300, Height: 931}}}}
	x, y := 220.0, 600.0
	request, err := scrollRequest(snapshot, "app", "down", "", 1, &x, &y)
	if err != nil || request.Element != nil || *request.X != 220 || *request.Y != 600 {
		t.Fatalf("wrong pane target: %#v %v", request, err)
	}
	if _, err := scrollRequest(snapshot, "app", "down", "0", 1, nil, nil); err != nil {
		t.Fatal(err)
	}
	outside, negative := 1300.0, -1.0
	for _, point := range [][2]*float64{{&x, nil}, {nil, &y}, {&outside, &y}, {&negative, &y}} {
		if _, err := scrollRequest(snapshot, "app", "down", "", 1, point[0], point[1]); err == nil {
			t.Fatal("invalid screenshot coordinate accepted")
		}
	}
	if _, err := scrollRequest(snapshot, "app", "down", "0", 1, &x, &y); err == nil {
		t.Fatal("ambiguous target accepted")
	}
	if _, err := scrollRequest(nil, "app", "down", "", 1, &x, &y); err == nil {
		t.Fatal("unobserved action accepted")
	}
}

func TestCrossAppResultIdentifiesForegroundWithoutRelabelingImage(t *testing.T) {
	snapshot := &appSnapshot{App: appDescriptor{Name: "explorer", PID: 10}, WindowHandle: 100, WindowTitle: "Desktop", Foreground: &foregroundWindow{Name: "SearchHost", PID: 20, WindowHandle: 200, Title: "Search"}}
	text := snapshot.renderedText()
	for _, want := range []string{"App=explorer", "Foreground is now SearchHost", "get_app_state(app=foreground)", "screenshot still belongs to explorer"} {
		if !strings.Contains(text, want) {
			t.Fatalf("missing %q: %s", want, text)
		}
	}
}

func TestPopupObservationKeepsTargetAndCoordinateSpaceDistinct(t *testing.T) {
	snapshot := &appSnapshot{
		App: appDescriptor{Name: "WeChat", PID: 76632}, WindowHandle: 575,
		WindowBounds:        &frame{X: 273, Y: 156, Width: 880, Height: 640},
		ScreenshotPNGBase64: "persisted-image",
		Foreground:          &foregroundWindow{Name: "WeChat", PID: 76632, WindowHandle: 772},
	}
	text := snapshot.renderedText()
	for _, want := range []string{"Observed target: window:76632:575", "Active target: window:76632:772", "width 880, height 640", "external screenshots", "get_app_state(app=foreground)"} {
		if !strings.Contains(text, want) {
			t.Fatalf("Missing %q in %s", want, text)
		}
	}
	result := snapshot.result()
	observation := result.StructuredContent["desktop_observation"].(map[string]any)
	if observation["window_handle"] != int64(575) {
		t.Fatal("Popup relabelled the original screenshot")
	}
}

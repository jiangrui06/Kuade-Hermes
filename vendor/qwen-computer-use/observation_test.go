package main

import (
	"encoding/json"
	"testing"
)

func TestObservationReceiptRequiresAfterImageAndBindsWindow(t *testing.T) {
	snapshot := &appSnapshot{App: appDescriptor{Name: "Calculator", PID: 42}, WindowHandle: 101, WindowTitle: "计算器"}
	if snapshot.result().StructuredContent != nil {
		t.Fatal("hidden snapshot claims an observed screen")
	}
	snapshot.ScreenshotPNGBase64 = "cGl4ZWxz"
	result := snapshot.result()
	bytes, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	var wire struct {
		StructuredContent struct {
			Observation struct {
				PID          int
				WindowHandle int64 `json:"window_handle"`
			} `json:"desktop_observation"`
		} `json:"structuredContent"`
	}
	if err := json.Unmarshal(bytes, &wire); err != nil {
		t.Fatal(err)
	}
	if wire.StructuredContent.Observation.PID != 42 || wire.StructuredContent.Observation.WindowHandle != 101 {
		t.Fatalf("window binding lost: %s", bytes)
	}
	if len(result.Content) != 2 || result.Content[1].Type != "image" {
		t.Fatal("receipt lost its visual evidence")
	}
}

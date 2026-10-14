package main

import (
	"fmt"
	"testing"
)

func TestElementIndicesFollowIdentityAcrossTreeChanges(t *testing.T) {
	s := newService()
	first := &appSnapshot{App: appDescriptor{PID: 7, Name: "Example"}, WindowHandle: 11, Elements: []elementRecord{
		{Index: 0, RuntimeID: []int{1}, Name: "Window"}, {Index: 1, RuntimeID: []int{2}, Name: "Expression"}, {Index: 2, RuntimeID: []int{3}, Name: "Clear"}, {Index: 3, RuntimeID: []int{4}, Name: "Eight"}}, TreeLines: []string{"0 Window", "\t1 Expression", "\t2 Clear", "\t3 Eight"}}
	s.rememberSnapshot("Example", first)
	eight := first.Elements[3].Index
	removed := first.Elements[1].Index
	next := &appSnapshot{App: first.App, WindowHandle: 11, Elements: []elementRecord{
		{Index: 0, RuntimeID: []int{1}, Name: "Window"}, {Index: 1, RuntimeID: []int{3}, Name: "Clear"}, {Index: 2, RuntimeID: []int{4}, Name: "Eight"}, {Index: 3, RuntimeID: []int{5}, Name: "Nine"}}, TreeLines: []string{"0 Window", "\t1 Clear", "\t2 Eight", "\t3 Nine"}}
	s.rememberSnapshot("Example", next)
	got, err := lookupElement(next, fmt.Sprint(eight))
	if err != nil || got.Name != "Eight" {
		t.Fatalf("old index retargeted: %#v %v", got, err)
	}
	if _, err = lookupElement(next, fmt.Sprint(removed)); err == nil {
		t.Fatal("removed index reused")
	}
	if next.TreeLines[2] != "\t"+fmt.Sprint(eight)+" Eight" {
		t.Fatal("text and actionable index disagree")
	}
	changed := &appSnapshot{App: first.App, WindowHandle: 11, Elements: []elementRecord{{Index: 0, RuntimeID: []int{4}, Name: "Delete"}}, TreeLines: []string{"0 Delete"}}
	s.rememberSnapshot("Example", changed)
	if _, err = lookupElement(changed, fmt.Sprint(eight)); err == nil {
		t.Fatal("recycled control identity accepted")
	}
}

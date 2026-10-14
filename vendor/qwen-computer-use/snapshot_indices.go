package main

import (
	"encoding/json"
	"strconv"
	"strings"
)

func elementIdentity(e elementRecord) string {
	if len(e.RuntimeID) == 0 {
		return ""
	}
	// Labels and automation IDs protect against providers recycling virtual controls.
	b, _ := json.Marshal([]any{e.RuntimeID, e.AutomationID, e.ControlType, e.Name})
	return string(b)
}
func (s *service) stabilizeElementIndices(snapshot *appSnapshot) {
	previous := map[string]int{}
	for _, old := range s.snapshots {
		if old.WindowHandle == snapshot.WindowHandle && old.App.PID == snapshot.App.PID && snapshot.WindowHandle != 0 {
			for _, e := range old.Elements {
				if key := elementIdentity(e); key != "" {
					previous[key] = e.Index
				}
			}
			break
		}
	}
	remap := map[int]int{}
	for i := range snapshot.Elements {
		e := &snapshot.Elements[i]
		key := elementIdentity(*e)
		index, exists := previous[key]
		if key == "" || !exists {
			index = s.nextElementIndex
			s.nextElementIndex++
		}
		remap[e.Index] = index
		e.Index = index
	}
	for i, line := range snapshot.TreeLines {
		content := strings.TrimLeft(line, " \t")
		prefix := line[:len(line)-len(content)]
		number, tail, found := strings.Cut(content, " ")
		if !found {
			continue
		}
		old, err := strconv.Atoi(number)
		if err != nil {
			continue
		}
		if index, ok := remap[old]; ok {
			snapshot.TreeLines[i] = prefix + strconv.Itoa(index) + " " + tail
		}
	}
}

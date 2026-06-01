package admin

import (
	"encoding/json"
	"testing"
)

func TestMergeGachiMetadataPreservesHLS(t *testing.T) {
	existing := json.RawMessage(`{"hls":{"manifest_key":"hls/x/master.m3u8"},"gachi_power_level":10}`)
	patch := updateTrackBody{
		Title:           "New Title",
		GachiPowerLevel: intPtr(90),
		MoodTags:        []string{"dungeon"},
	}
	out, err := mergeGachiMetadata(existing, patch)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(out, &m); err != nil {
		t.Fatal(err)
	}
	hls, ok := m["hls"].(map[string]any)
	if !ok || hls["manifest_key"] != "hls/x/master.m3u8" {
		t.Fatalf("hls block lost: %v", m["hls"])
	}
	if m["gachi_power_level"].(float64) != 90 {
		t.Fatalf("power level: %v", m["gachi_power_level"])
	}
	tags, ok := m["mood_tags"].([]any)
	if !ok || len(tags) != 1 {
		t.Fatalf("mood_tags: %v", m["mood_tags"])
	}
}

func intPtr(n int) *int { return &n }

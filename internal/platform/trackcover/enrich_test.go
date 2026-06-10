package trackcover

import (
	"encoding/json"
	"testing"
)

func TestMergeCoverURL(t *testing.T) {
	meta := json.RawMessage(`{"gachi_power_level":50}`)
	out := mergeCoverURL(meta, "https://cdn.example/cover.jpg")
	var m map[string]any
	if err := json.Unmarshal(out, &m); err != nil {
		t.Fatal(err)
	}
	if m["cover_url"] != "https://cdn.example/cover.jpg" {
		t.Fatalf("cover_url: %v", m["cover_url"])
	}
	if m["gachi_power_level"] != float64(50) {
		t.Fatalf("preserved field: %v", m["gachi_power_level"])
	}
}

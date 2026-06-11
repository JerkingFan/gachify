package streaming

import "testing"

func TestParseByteRange(t *testing.T) {
	size := int64(1000)
	cases := []struct {
		hdr       string
		ok        bool
		start,end int64
	}{
		{"bytes=0-99", true, 0, 99},
		{"bytes=500-", true, 500, 999},
		{"bytes=-200", true, 800, 999},
		{"bytes=1000-", false, 0, 0},
		{"bytes=900-50", false, 0, 0},
		{"", false, 0, 0},
	}
	for _, c := range cases {
		br, ok := parseByteRange(c.hdr, size)
		if ok != c.ok {
			t.Fatalf("%q ok=%v want %v", c.hdr, ok, c.ok)
		}
		if !ok {
			continue
		}
		if br.start != c.start || br.end != c.end {
			t.Fatalf("%q got %d-%d want %d-%d", c.hdr, br.start, br.end, c.start, c.end)
		}
	}
}

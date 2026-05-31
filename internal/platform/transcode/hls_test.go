package transcode

import (
	"strings"
	"testing"
)

func TestPrefixAndManifestKeys(t *testing.T) {
	id := "11111111-1111-1111-1111-111111111111"
	prefix := PrefixKey(id)
	if prefix != "hls/"+id {
		t.Fatalf("unexpected prefix: %s", prefix)
	}
	manifest := ManifestObjectKey(id)
	if manifest != prefix+"/master.m3u8" {
		t.Fatalf("unexpected manifest key: %s", manifest)
	}
}

func TestTruncate(t *testing.T) {
	if truncate("short", 10) != "short" {
		t.Fatal("short string should be unchanged")
	}
	long := "banner\n" + strings.Repeat("x", 20)
	out := truncate(long, 12)
	if out != "…"+strings.Repeat("x", 11) {
		t.Fatalf("expected tail of ffmpeg output, got: %q", out)
	}
}

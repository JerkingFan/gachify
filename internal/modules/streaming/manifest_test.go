package streaming

import (
	"context"
	"testing"

	"github.com/gachify/gachify/internal/platform/transcode"
	"github.com/google/uuid"
)

func TestRewritePlaylistMasterAndVariant(t *testing.T) {
	trackID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	opts := rewriteOpts{
		TrackID:       trackID,
		PlaybackToken: "tok",
		ObjectPrefix:  "hls/" + trackID.String() + "/",
	}
	master := []byte("#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-STREAM-INF:BANDWIDTH=128000\n128k/playlist.m3u8\n")
	out, err := rewritePlaylist(context.Background(), master, opts, func(_ context.Context, key string) (string, error) {
		return "https://signed.example/" + key, nil
	}, func(trackID, token, relPath string) string {
		return "/api/v1/stream/playlist.m3u8?track_id=" + trackID + "&pt=" + token + "&path=" + relPath
	}, func(trackID, token string) string {
		return "/api/v1/stream/hls.key?track_id=" + trackID + "&pt=" + token
	})
	if err != nil {
		t.Fatal(err)
	}
	body := string(out)
	if !contains(body, "path=128k/playlist.m3u8") {
		t.Fatalf("expected variant proxy url, got %q", body)
	}

	variant := []byte("#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"" + transcode.HLSKeyURIPlaceholder + "\"\nseg_000.ts\n")
	opts.ObjectPrefix = "hls/" + trackID.String() + "/128k/"
	out, err = rewritePlaylist(context.Background(), variant, opts, func(_ context.Context, key string) (string, error) {
		return "https://signed.example/" + key, nil
	}, func(trackID, token, relPath string) string {
		return "/playlist?path=" + relPath
	}, func(trackID, token string) string {
		return "/key?track_id=" + trackID
	})
	if err != nil {
		t.Fatal(err)
	}
	body = string(out)
	if contains(body, transcode.HLSKeyURIPlaceholder) {
		t.Fatalf("key placeholder should be rewritten: %q", body)
	}
	if !contains(body, "https://signed.example/hls/") {
		t.Fatalf("expected presigned segment: %q", body)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 || indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

package imports

import "testing"

func TestParsePlaylistURL_Spotify(t *testing.T) {
	p, err := ParsePlaylistURL("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")
	if err != nil {
		t.Fatal(err)
	}
	if p.Platform != "spotify" || p.ID != "37i9dQZF1DXcBWIGoYBM5M" {
		t.Fatalf("unexpected %+v", p)
	}
}

func TestParsePlaylistURL_YouTube(t *testing.T) {
	p, err := ParsePlaylistURL("https://www.youtube.com/playlist?list=PLrAXtmRdnEQy6nuLMH8")
	if err != nil {
		t.Fatal(err)
	}
	if p.Platform != "youtube" || p.ID == "" {
		t.Fatalf("unexpected %+v", p)
	}
}

func TestParseLines(t *testing.T) {
	raw := "Artist One - Song A\nSong B\nTrack\tArtist Two"
	got := ParseLines(raw)
	if len(got) != 3 {
		t.Fatalf("expected 3 tracks, got %d", len(got))
	}
	if got[0].Title != "Song A" || got[0].Artist != "Artist One" {
		t.Fatalf("first: %+v", got[0])
	}
}

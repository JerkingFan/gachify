package imports

// ExternalTrack is a row from an external playlist before matching.
type ExternalTrack struct {
	Title  string
	Artist string
}

// MatchResult is one catalog match candidate.
type MatchResult struct {
	Position     int    `json:"position"`
	SourceTitle  string `json:"source_title"`
	SourceArtist string `json:"source_artist"`
	Matched      *MatchedTrack `json:"matched_track,omitempty"`
}

type MatchedTrack struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Artist      string `json:"artist"`
	DurationMs  int    `json:"duration_ms"`
}

type PreviewResult struct {
	Source        string        `json:"source"`
	PlaylistTitle string        `json:"playlist_title"`
	Items         []MatchResult `json:"items"`
	MatchedCount  int           `json:"matched_count"`
	TotalCount    int           `json:"total_count"`
	Warnings      []string      `json:"warnings,omitempty"`
}

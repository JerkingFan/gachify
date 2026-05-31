package domain

import "github.com/google/uuid"

type ArtistSearchResult struct {
	ID              uuid.UUID `json:"id"`
	Handle          string    `json:"handle"`
	DisplayName     string    `json:"display_name"`
	PublishedTracks int       `json:"published_tracks"`
}

type SearchArtistsFilter struct {
	Query  string
	Limit  int
	Offset int
}

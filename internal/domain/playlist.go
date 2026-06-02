package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type PlaylistItem struct {
	TrackID  uuid.UUID `json:"track_id"`
	Position int       `json:"position"`
	AddedAt  time.Time `json:"added_at"`
}

type Playlist struct {
	ID               uuid.UUID       `json:"id"`
	OwnerID          uuid.UUID       `json:"owner_id"`
	Title            string          `json:"title"`
	Description      string          `json:"description"`
	IsPublic         bool            `json:"is_public"`
	IsCollaborative  bool            `json:"is_collaborative"`
	InviteToken      string          `json:"invite_token,omitempty"`
	IsOwner          bool            `json:"is_owner,omitempty"`
	CanEdit          bool            `json:"can_edit,omitempty"`
	Items            json.RawMessage `json:"items"`
	CreatedAt        time.Time       `json:"created_at"`
	UpdatedAt        time.Time       `json:"updated_at"`
}

type CreatePlaylistInput struct {
	Title             string `json:"title"`
	Description       string `json:"description"`
	IsPublic          bool   `json:"is_public"`
	IsCollaborative   bool   `json:"is_collaborative"`
}

type UpdatePlaylistInput struct {
	Title             *string `json:"title"`
	Description       *string `json:"description"`
	IsPublic          *bool   `json:"is_public"`
	IsCollaborative   *bool   `json:"is_collaborative"`
}

type JoinPlaylistInput struct {
	InviteToken string `json:"invite_token"`
}

type AddPlaylistTracksInput struct {
	TrackIDs []uuid.UUID `json:"track_ids"`
}

type ClonePlaylistInput struct {
	PlaylistID uuid.UUID `json:"playlist_id"`
}

type SetPlaylistItemsInput struct {
	TrackIDs []uuid.UUID `json:"track_ids"`
}

// PublicPlaylist is a playlist visible without authentication.
type PublicPlaylist struct {
	Playlist
	OwnerHandle      string `json:"owner_handle"`
	OwnerDisplayName string `json:"owner_display_name"`
}

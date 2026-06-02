package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type UserTier string

const (
	TierFree       UserTier = "free"
	TierPremium    UserTier = "premium"
	TierCreatorPro UserTier = "creator_pro"
)

type User struct {
	ID                uuid.UUID       `json:"id"`
	Email             string          `json:"email,omitempty"`
	Handle            string          `json:"handle"`
	DisplayName       string          `json:"display_name"`
	Tier              UserTier        `json:"tier"`
	TrashTolerance    float32         `json:"trash_tolerance"`
	GachiPersona      json.RawMessage `json:"gachi_persona,omitempty"`
	Region            *string         `json:"region,omitempty"`
	AvatarURL         *string         `json:"avatar_url,omitempty"`
	LikedTracksPublic bool            `json:"liked_tracks_public,omitempty"`
	ProfileBio        string          `json:"profile_bio,omitempty"`
	PushNotifications string          `json:"push_notifications,omitempty"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

// AccountUser is returned for GET /auth/me (authenticated owner).
type AccountUser struct {
	User
	EmailVerified bool `json:"email_verified"`
	HasPassword   bool `json:"has_password"`
}

type UpdateProfileInput struct {
	DisplayName       *string `json:"display_name"`
	Handle            *string `json:"handle"`
	AvatarURL         *string `json:"avatar_url"`
	ProfileBio        *string `json:"profile_bio"`
	LikedTracksPublic *bool   `json:"liked_tracks_public"`
	PushNotifications *string `json:"push_notifications"`
}

type ChangePasswordInput struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type PublicProfile struct {
	ID                  uuid.UUID `json:"id"`
	Handle              string    `json:"handle"`
	DisplayName         string    `json:"display_name"`
	AvatarURL           *string   `json:"avatar_url,omitempty"`
	ProfileBio          string    `json:"profile_bio,omitempty"`
	PublishedTracks     int       `json:"published_tracks"`
	PublicPlaylists     int       `json:"public_playlists_count"`
	FollowingCount      int       `json:"following_count"`
	FollowerCount       int       `json:"follower_count"`
	LikedTracksPublic   bool      `json:"liked_tracks_public"`
}

type PublicUserSummary struct {
	ID          uuid.UUID `json:"id"`
	Handle      string    `json:"handle"`
	DisplayName string    `json:"display_name"`
	AvatarURL   *string   `json:"avatar_url,omitempty"`
}

type CreateUserInput struct {
	Handle         string          `json:"handle"`
	DisplayName    string          `json:"display_name"`
	Tier           UserTier        `json:"tier"`
	TrashTolerance *float32        `json:"trash_tolerance"`
	GachiPersona   json.RawMessage `json:"gachi_persona"`
	Region         *string         `json:"region"`
}

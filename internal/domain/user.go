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
	ID             uuid.UUID       `json:"id"`
	Email          string          `json:"email,omitempty"`
	Handle         string          `json:"handle"`
	DisplayName    string          `json:"display_name"`
	Tier           UserTier        `json:"tier"`
	TrashTolerance float32         `json:"trash_tolerance"`
	GachiPersona   json.RawMessage `json:"gachi_persona,omitempty"`
	Region         *string         `json:"region,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

type CreateUserInput struct {
	Handle         string          `json:"handle"`
	DisplayName    string          `json:"display_name"`
	Tier           UserTier        `json:"tier"`
	TrashTolerance *float32        `json:"trash_tolerance"`
	GachiPersona   json.RawMessage `json:"gachi_persona"`
	Region         *string         `json:"region"`
}

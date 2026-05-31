package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type TrackStatus string

const (
	TrackDraft         TrackStatus = "draft"
	TrackProcessing    TrackStatus = "processing"
	TrackPublished     TrackStatus = "published"
	TrackShadowBanned  TrackStatus = "shadow_banned"
	TrackRemoved       TrackStatus = "removed"
)

// GachiMetadata holds niche-specific track features for recommendations and UI.
type GachiMetadata struct {
	GachiPowerLevel   int     `json:"gachi_power_level,omitempty"`
	DeepnessScore     float32 `json:"deepness_score,omitempty"`
	DominantSample    string  `json:"dominant_male_sample,omitempty"`
	GruntCount        int     `json:"grunt_count,omitempty"`
	BPM               float32 `json:"bpm,omitempty"`
	MoodTags          []string `json:"mood_tags,omitempty"`
	WessratostLevel   int     `json:"wessratost_level,omitempty"`
	IsContinuousMix   bool    `json:"is_continuous_mix,omitempty"`
	GaplessGroupID    *string `json:"gapless_group_id,omitempty"`
}

type Track struct {
	ID                uuid.UUID       `json:"id"`
	CreatorID         uuid.UUID       `json:"creator_id"`
	Title             string          `json:"title"`
	DurationMs        int             `json:"duration_ms"`
	Status            TrackStatus     `json:"status"`
	GachiMetadata     json.RawMessage `json:"gachi_metadata"`
	MasterObjectKey   *string         `json:"master_object_key,omitempty"`
	SourceContentType *string         `json:"source_content_type,omitempty"`
	SourceFilename    *string         `json:"source_filename,omitempty"`
	ProcessingError   *string         `json:"processing_error,omitempty"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

type UploadInitInput struct {
	Title       string          `json:"title"`
	Filename    string          `json:"filename"`
	ContentType string          `json:"content_type"`
	DurationMs  int             `json:"duration_ms"`
	GachiMetadata json.RawMessage `json:"gachi_metadata"`
}

type UploadInitResponse struct {
	TrackID      uuid.UUID `json:"track_id"`
	UploadURL    string    `json:"upload_url"`
	ObjectKey    string    `json:"object_key"`
	ExpiresInSec int       `json:"expires_in_sec"`
}

type UploadCompleteInput struct {
	DurationMs int `json:"duration_ms"`
}

type CreateTrackInput struct {
	CreatorID     uuid.UUID       `json:"creator_id"`
	Title         string          `json:"title"`
	DurationMs    int             `json:"duration_ms"`
	Status        TrackStatus     `json:"status"`
	GachiMetadata json.RawMessage `json:"gachi_metadata"`
}

type CreatorSummary struct {
	ID          uuid.UUID `json:"id"`
	Handle      string    `json:"handle"`
	DisplayName string    `json:"display_name"`
}

type TrackWithCreator struct {
	Track
	Creator CreatorSummary `json:"creator"`
}

type ListTracksFilter struct {
	Status    *TrackStatus
	CreatorID *uuid.UUID
	Query     string
	Limit     int
	Offset    int
}

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
	TrackPendingReview TrackStatus = "pending_review"
	TrackApproved      TrackStatus = "approved"
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
	Description       string          `json:"description,omitempty"`
	DurationMs        int             `json:"duration_ms"`
	Status            TrackStatus     `json:"status"`
	GachiMetadata     json.RawMessage `json:"gachi_metadata"`
	MasterObjectKey   *string         `json:"master_object_key,omitempty"`
	CoverObjectKey    *string         `json:"-"`
	SourceContentType *string         `json:"source_content_type,omitempty"`
	SourceFilename    *string         `json:"source_filename,omitempty"`
	ProcessingError   *string         `json:"processing_error,omitempty"`
	PlayCount           int64      `json:"play_count"`
	ScheduledPublishAt  *time.Time `json:"scheduled_publish_at,omitempty"`
	ApprovedAt          *time.Time `json:"approved_at,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

type UploadInitInput struct {
	Title         string          `json:"title"`
	Description   string          `json:"description"`
	Filename      string          `json:"filename"`
	ContentType   string          `json:"content_type"`
	DurationMs    int             `json:"duration_ms"`
	GachiMetadata json.RawMessage `json:"gachi_metadata"`
	TrackID       *uuid.UUID      `json:"track_id,omitempty"`
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

type CreateDraftInput struct {
	Title         string          `json:"title"`
	Description   string          `json:"description"`
	GachiMetadata json.RawMessage `json:"gachi_metadata"`
}

type UpdateDraftInput struct {
	Title         *string          `json:"title"`
	Description   *string          `json:"description"`
	GachiMetadata *json.RawMessage `json:"gachi_metadata"`
}

type PresignUploadInput struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
}

type SchedulePublishInput struct {
	ScheduledPublishAt time.Time `json:"scheduled_publish_at"`
}

type DailyPlayStat struct {
	Date      string `json:"date"`
	PlayCount int64  `json:"play_count"`
}

type PlaySourceStat struct {
	Source    string `json:"source"`
	PlayCount int64  `json:"play_count"`
}

type TrackCreatorStats struct {
	TrackID   uuid.UUID        `json:"track_id"`
	PlayCount int64            `json:"play_count"`
	Daily     []DailyPlayStat  `json:"daily"`
	Sources   []PlaySourceStat `json:"sources"`
}

type RecordPlayInput struct {
	Source string `json:"source"`
}

// UpdateTrackLyricsInput sets LRC text on an owned track (stored until/for worker sync).
type UpdateTrackLyricsInput struct {
	LyricsLRC string `json:"lyrics_lrc"`
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

type ChartTrack struct {
	TrackWithCreator
	WeeklyPlays int64 `json:"weekly_plays"`
}

type ListTracksFilter struct {
	Status    *TrackStatus
	CreatorID *uuid.UUID
	Query     string
	Sort      string // "recent" (default) or "trending"
	Limit     int
	Offset    int

	// Gachi metadata filters (JSONB on tracks.gachi_metadata).
	MoodTag      string
	Sample       string
	MinPower     *int
	MaxPower     *int
	MinDeepness  *float32
	MaxDeepness  *float32
	MinBPM       *float32
	MaxBPM       *float32
	HasLyrics    *bool // true = tracks with parsed karaoke lines in gachi_metadata.lyrics
}

type TranscodeJob struct {
	ID        uuid.UUID `json:"id"`
	TrackID   uuid.UUID `json:"track_id"`
	Status    string    `json:"status"`
	Attempts  int       `json:"attempts"`
	LastError *string   `json:"last_error,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

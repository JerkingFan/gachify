package domain

import (
	"time"

	"github.com/google/uuid"
)

const (
	NotificationNewRelease = "new_release"
	NotificationMention    = "mention"
	NotificationReply      = "comment_reply"
)

type Notification struct {
	ID        uuid.UUID  `json:"id"`
	Type      string     `json:"type"`
	ActorID   *uuid.UUID `json:"actor_id,omitempty"`
	TrackID   *uuid.UUID `json:"track_id,omitempty"`
	Body      string     `json:"body"`
	ReadAt    *time.Time `json:"read_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	Actor     *PublicUserSummary `json:"actor,omitempty"`
	TrackTitle string     `json:"track_title,omitempty"`
}

type TrackComment struct {
	ID        uuid.UUID  `json:"id"`
	TrackID   uuid.UUID  `json:"track_id"`
	UserID    uuid.UUID  `json:"user_id"`
	ParentID  *uuid.UUID `json:"parent_id,omitempty"`
	Body      string     `json:"body"`
	CreatedAt time.Time  `json:"created_at"`
	Author    PublicUserSummary `json:"author"`
}

type TrackReport struct {
	ID          uuid.UUID `json:"id"`
	TrackID     uuid.UUID `json:"track_id"`
	ReporterID  uuid.UUID `json:"reporter_id"`
	Reason      string    `json:"reason"`
	Detail      string    `json:"detail"`
	CreatedAt   time.Time `json:"created_at"`
	TrackTitle  string    `json:"track_title,omitempty"`
	ReporterHandle string `json:"reporter_handle,omitempty"`
}

type TrackReactionsSummary struct {
	Counts       map[string]int `json:"counts"`
	UserReaction *string        `json:"user_reaction,omitempty"`
	Total        int            `json:"total"`
}

type AddCommentInput struct {
	Body     string     `json:"body"`
	ParentID *uuid.UUID `json:"parent_id,omitempty"`
}

type ReportTrackInput struct {
	Reason string `json:"reason"`
	Detail string `json:"detail"`
}

type SetReactionInput struct {
	Reaction string `json:"reaction"`
}

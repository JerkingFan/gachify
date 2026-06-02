package creator

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/platform/queue"
	"github.com/gachify/gachify/internal/platform/storage"
	"github.com/gachify/gachify/internal/platform/trace"
	"github.com/google/uuid"
)

var (
	ErrInvalidFile       = errors.New("invalid audio file type")
	ErrObjectMissing     = errors.New("uploaded file not found in storage")
	ErrFileTooLarge      = errors.New("file exceeds maximum upload size")
	ErrInvalidState      = errors.New("track is not in a valid state for this operation")
	ErrNotRetryable      = errors.New("track is not in a failed state eligible for retry")
)

var allowedContentTypes = map[string]bool{
	"audio/flac":       true,
	"audio/wav":        true,
	"audio/x-wav":      true,
	"audio/wave":       true,
	"audio/mpeg":       true,
	"audio/mp3":        true,
	"application/octet-stream": true, // browsers sometimes send this for flac
}

type FollowerCounter interface {
	CountFollowers(ctx context.Context, userID uuid.UUID) (int, error)
}

type Service struct {
	catalog   *catalog.Repository
	storage   *storage.Client
	queue     *queue.RedisQueue
	followers FollowerCounter
}

func NewService(cat *catalog.Repository, st *storage.Client, q *queue.RedisQueue, followers FollowerCounter) *Service {
	return &Service{catalog: cat, storage: st, queue: q, followers: followers}
}

func (s *Service) InitUpload(ctx context.Context, creatorID uuid.UUID, in domain.UploadInitInput) (domain.UploadInitResponse, error) {
	title := strings.TrimSpace(in.Title)
	if title == "" {
		return domain.UploadInitResponse{}, fmt.Errorf("title required")
	}
	filename := sanitizeFilename(in.Filename)
	if filename == "" {
		return domain.UploadInitResponse{}, fmt.Errorf("filename required")
	}
	ct := normalizeContentType(in.ContentType, filename)
	if !allowedContentTypes[ct] {
		return domain.UploadInitResponse{}, ErrInvalidFile
	}

	trackID := uuid.New()
	objectKey := fmt.Sprintf("masters/%s/%s/%s", creatorID, trackID, filename)

	desc := strings.TrimSpace(in.Description)
	var track domain.Track
	var err error
	if in.TrackID != nil && *in.TrackID != uuid.Nil {
		if err := s.catalog.AttachDraftMaster(ctx, *in.TrackID, creatorID, objectKey, ct, filename); err != nil {
			return domain.UploadInitResponse{}, err
		}
		track, err = s.catalog.GetOwned(ctx, *in.TrackID, creatorID)
	} else {
		track, err = s.catalog.CreateDraftUpload(ctx, creatorID, title, desc, in.DurationMs, in.GachiMetadata, objectKey, ct, filename)
	}
	if err != nil {
		return domain.UploadInitResponse{}, err
	}

	ttl := 15 * time.Minute
	uploadURL, err := s.storage.PresignPut(ctx, objectKey, ct, ttl)
	if err != nil {
		return domain.UploadInitResponse{}, err
	}

	return domain.UploadInitResponse{
		TrackID:      track.ID,
		UploadURL:    uploadURL,
		ObjectKey:    objectKey,
		ExpiresInSec: int(ttl.Seconds()),
	}, nil
}

func (s *Service) CompleteUpload(ctx context.Context, creatorID, trackID uuid.UUID, durationMs int) (domain.Track, error) {
	track, err := s.catalog.GetOwned(ctx, trackID, creatorID)
	if err != nil {
		return domain.Track{}, err
	}
	if track.Status != domain.TrackDraft {
		return domain.Track{}, ErrInvalidState
	}
	if track.MasterObjectKey == nil || *track.MasterObjectKey == "" {
		return domain.Track{}, ErrObjectMissing
	}

	info, err := s.storage.HeadObject(ctx, *track.MasterObjectKey)
	if err != nil {
		return domain.Track{}, ErrObjectMissing
	}
	if info.Size > s.storage.MaxUploadBytes() {
		return domain.Track{}, ErrFileTooLarge
	}
	if durationMs > 0 {
		_ = s.catalog.UpdateDuration(ctx, trackID, durationMs)
	}

	if err := s.catalog.UpdateStatus(ctx, trackID, domain.TrackProcessing, nil); err != nil {
		return domain.Track{}, err
	}

	jobID, err := s.catalog.CreateTranscodeJob(ctx, trackID)
	if err != nil {
		return domain.Track{}, err
	}

	if err := s.queue.EnqueueTranscode(ctx, queue.TranscodeJob{
		TrackID:    trackID,
		JobID:      jobID,
		EnqueuedAt: time.Now().UTC(),
		RequestID:  trace.RequestIDFromContext(ctx),
	}); err != nil {
		_ = s.catalog.UpdateStatus(ctx, trackID, domain.TrackDraft, strPtr("failed to enqueue transcode job"))
		return domain.Track{}, err
	}

	return s.catalog.GetByID(ctx, trackID)
}

func (s *Service) GetUploadStatus(ctx context.Context, creatorID, trackID uuid.UUID) (domain.Track, error) {
	return s.catalog.GetOwned(ctx, trackID, creatorID)
}

func (s *Service) RetryTranscode(ctx context.Context, creatorID, trackID uuid.UUID) (domain.Track, error) {
	track, err := s.catalog.GetOwned(ctx, trackID, creatorID)
	if err != nil {
		return domain.Track{}, err
	}
	if track.MasterObjectKey == nil || *track.MasterObjectKey == "" {
		return domain.Track{}, ErrObjectMissing
	}
	failed := track.Status == domain.TrackDraft && track.ProcessingError != nil && *track.ProcessingError != ""
	if !failed {
		return domain.Track{}, ErrNotRetryable
	}
	if _, err := s.storage.HeadObject(ctx, *track.MasterObjectKey); err != nil {
		return domain.Track{}, ErrObjectMissing
	}

	jobID, err := s.catalog.CreateTranscodeJob(ctx, trackID)
	if err != nil {
		return domain.Track{}, err
	}
	if err := s.catalog.UpdateStatus(ctx, trackID, domain.TrackProcessing, nil); err != nil {
		return domain.Track{}, err
	}
	if err := s.queue.EnqueueTranscode(ctx, queue.TranscodeJob{
		TrackID:    trackID,
		JobID:      jobID,
		EnqueuedAt: time.Now().UTC(),
		RequestID:  trace.RequestIDFromContext(ctx),
	}); err != nil {
		msg := "failed to enqueue transcode job"
		_ = s.catalog.UpdateStatus(ctx, trackID, domain.TrackDraft, &msg)
		return domain.Track{}, err
	}
	return s.catalog.GetByID(ctx, trackID)
}

func (s *Service) ListMyTracks(ctx context.Context, creatorID uuid.UUID, limit, offset int) ([]domain.Track, error) {
	items, err := s.catalog.List(ctx, domain.ListTracksFilter{
		CreatorID: &creatorID,
		Limit:     limit,
		Offset:    offset,
	})
	if err != nil {
		return nil, err
	}
	out := make([]domain.Track, len(items))
	for i := range items {
		out[i] = items[i].Track
	}
	return out, nil
}

func (s *Service) UpdateTrackLyrics(ctx context.Context, creatorID, trackID uuid.UUID, lrc string) (domain.Track, error) {
	return s.catalog.UpdateOwnedLyricsLRC(ctx, trackID, creatorID, lrc)
}

func sanitizeFilename(name string) string {
	base := filepath.Base(name)
	base = strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == 0 {
			return -1
		}
		return r
	}, base)
	if len(base) > 200 {
		base = base[len(base)-200:]
	}
	return base
}

func normalizeContentType(ct, filename string) string {
	ct = strings.ToLower(strings.TrimSpace(ct))
	if ct != "" && ct != "application/octet-stream" {
		return ct
	}
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".flac":
		return "audio/flac"
	case ".wav":
		return "audio/wav"
	case ".mp3":
		return "audio/mpeg"
	default:
		return ct
	}
}

func strPtr(s string) *string { return &s }


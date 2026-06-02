package creator

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/gachify/gachify/internal/domain"
	"github.com/google/uuid"
)

func (s *Service) CreateDraft(ctx context.Context, creatorID uuid.UUID, in domain.CreateDraftInput) (domain.Track, error) {
	title := strings.TrimSpace(in.Title)
	if title == "" {
		return domain.Track{}, fmt.Errorf("title required")
	}
	meta := in.GachiMetadata
	if len(meta) == 0 {
		meta = json.RawMessage(`{}`)
	}
	return s.catalog.CreateMetadataDraft(ctx, creatorID, title, strings.TrimSpace(in.Description), meta)
}

func (s *Service) UpdateDraft(ctx context.Context, creatorID, trackID uuid.UUID, in domain.UpdateDraftInput) (domain.Track, error) {
	track, err := s.catalog.GetOwned(ctx, trackID, creatorID)
	if err != nil {
		return domain.Track{}, err
	}
	if track.Status != domain.TrackDraft {
		return domain.Track{}, ErrInvalidState
	}
	title := track.Title
	if in.Title != nil {
		title = strings.TrimSpace(*in.Title)
		if title == "" {
			return domain.Track{}, fmt.Errorf("title required")
		}
	}
	desc := track.Description
	if in.Description != nil {
		desc = strings.TrimSpace(*in.Description)
	}
	meta := track.GachiMetadata
	if in.GachiMetadata != nil {
		meta = *in.GachiMetadata
	}
	if len(meta) == 0 {
		meta = json.RawMessage(`{}`)
	}
	return s.catalog.UpdateDraftMetadata(ctx, trackID, creatorID, title, desc, meta)
}

func (s *Service) PresignDraftUpload(ctx context.Context, creatorID, trackID uuid.UUID, in domain.PresignUploadInput) (domain.UploadInitResponse, error) {
	track, err := s.catalog.GetOwned(ctx, trackID, creatorID)
	if err != nil {
		return domain.UploadInitResponse{}, err
	}
	if track.Status != domain.TrackDraft {
		return domain.UploadInitResponse{}, ErrInvalidState
	}
	filename := sanitizeFilename(in.Filename)
	if filename == "" {
		return domain.UploadInitResponse{}, fmt.Errorf("filename required")
	}
	ct := normalizeContentType(in.ContentType, filename)
	if !allowedContentTypes[ct] {
		return domain.UploadInitResponse{}, ErrInvalidFile
	}
	objectKey := fmt.Sprintf("masters/%s/%s/%s", creatorID, trackID, filename)
	if err := s.catalog.AttachDraftMaster(ctx, trackID, creatorID, objectKey, ct, filename); err != nil {
		return domain.UploadInitResponse{}, err
	}
	ttl := 15 * time.Minute
	uploadURL, err := s.storage.PresignPut(ctx, objectKey, ct, ttl)
	if err != nil {
		return domain.UploadInitResponse{}, err
	}
	return domain.UploadInitResponse{
		TrackID:      trackID,
		UploadURL:    uploadURL,
		ObjectKey:    objectKey,
		ExpiresInSec: int(ttl.Seconds()),
	}, nil
}

func (s *Service) SchedulePublish(ctx context.Context, creatorID, trackID uuid.UUID, at time.Time) (domain.Track, error) {
	if at.Before(time.Now().UTC().Add(-time.Minute)) {
		return domain.Track{}, fmt.Errorf("scheduled time must be in the future")
	}
	if err := s.catalog.SetScheduledPublish(ctx, trackID, creatorID, at.UTC()); err != nil {
		return domain.Track{}, err
	}
	return s.catalog.GetOwned(ctx, trackID, creatorID)
}

func (s *Service) PublishNow(ctx context.Context, creatorID, trackID uuid.UUID) (domain.Track, error) {
	if err := s.catalog.CreatorPublishNow(ctx, trackID, creatorID); err != nil {
		return domain.Track{}, err
	}
	return s.catalog.GetByID(ctx, trackID)
}

func (s *Service) TrackStats(ctx context.Context, creatorID, trackID uuid.UUID, days int) (domain.TrackCreatorStats, error) {
	track, err := s.catalog.GetOwned(ctx, trackID, creatorID)
	if err != nil {
		return domain.TrackCreatorStats{}, err
	}
	daily, err := s.catalog.ListTrackPlayDaily(ctx, trackID, days)
	if err != nil {
		return domain.TrackCreatorStats{}, err
	}
	sources, err := s.catalog.ListTrackPlaySources(ctx, trackID)
	if err != nil {
		return domain.TrackCreatorStats{}, err
	}
	return domain.TrackCreatorStats{
		TrackID:   trackID,
		PlayCount: track.PlayCount,
		Daily:     daily,
		Sources:   sources,
	}, nil
}

func (s *Service) FollowerCount(ctx context.Context, userID uuid.UUID) (int, error) {
	if s.followers == nil {
		return 0, nil
	}
	return s.followers.CountFollowers(ctx, userID)
}

package creator

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/platform/trackcover"
	"github.com/google/uuid"
)

const maxCoverBytes = 5 * 1024 * 1024

var allowedCoverTypes = map[string]bool{
	"image/jpeg": true,
	"image/jpg":  true,
	"image/png":  true,
	"image/webp": true,
}

func (s *Service) InitCoverUpload(ctx context.Context, creatorID, trackID uuid.UUID, in domain.PresignUploadInput) (domain.UploadInitResponse, error) {
	if _, err := s.catalog.GetOwned(ctx, trackID, creatorID); err != nil {
		return domain.UploadInitResponse{}, err
	}
	filename := sanitizeFilename(in.Filename)
	if filename == "" {
		return domain.UploadInitResponse{}, fmt.Errorf("filename required")
	}
	ct := normalizeCoverContentType(in.ContentType, filename)
	if !allowedCoverTypes[ct] {
		return domain.UploadInitResponse{}, ErrInvalidCoverFile
	}

	objectKey := fmt.Sprintf("covers/%s/%s/%s", creatorID, trackID, filename)
	if err := s.catalog.SetCoverObjectKey(ctx, trackID, creatorID, objectKey); err != nil {
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

func (s *Service) CompleteCoverUpload(ctx context.Context, creatorID, trackID uuid.UUID) (domain.Track, error) {
	track, err := s.catalog.GetOwned(ctx, trackID, creatorID)
	if err != nil {
		return domain.Track{}, err
	}
	if track.CoverObjectKey == nil || *track.CoverObjectKey == "" {
		return domain.Track{}, ErrObjectMissing
	}
	info, err := s.storage.HeadObject(ctx, *track.CoverObjectKey)
	if err != nil {
		return domain.Track{}, ErrObjectMissing
	}
	if info.Size > maxCoverBytes {
		return domain.Track{}, ErrCoverTooLarge
	}
	return s.withCover(ctx, track), nil
}

func (s *Service) withCover(ctx context.Context, t domain.Track) domain.Track {
	trackcover.Enrich(ctx, s.storage, &t)
	return t
}

func (s *Service) withCoverSlice(ctx context.Context, items []domain.Track) []domain.Track {
	trackcover.EnrichSlice(ctx, s.storage, items)
	return items
}

func normalizeCoverContentType(ct, filename string) string {
	ct = strings.ToLower(strings.TrimSpace(ct))
	if ct != "" && ct != "application/octet-stream" {
		return ct
	}
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	default:
		return ct
	}
}

var (
	ErrInvalidCoverFile = errors.New("invalid cover file type")
	ErrCoverTooLarge    = errors.New("cover exceeds maximum size")
)

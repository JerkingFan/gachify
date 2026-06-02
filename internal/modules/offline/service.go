package offline

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/modules/library"
	"github.com/gachify/gachify/internal/modules/streaming"
	"github.com/google/uuid"
)

const defaultVariant = "128k"

type Config struct {
	MaxDownloadsPerUser int
	SegmentPresignTTL   time.Duration
}

type Segment struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

type Package struct {
	TrackID    string    `json:"track_id"`
	Format     string    `json:"format"`
	AudioURL   string    `json:"audio_url,omitempty"`
	AESKeyB64  string    `json:"aes_key,omitempty"`
	AESIVHex   string    `json:"aes_iv,omitempty"`
	Segments   []Segment `json:"segments,omitempty"`
	ExpiresAt  time.Time `json:"expires_at"`
	DurationMs int       `json:"duration_ms"`
}

type Service struct {
	cfg      Config
	repo     *Repository
	lib      *library.Repository
	catalog  *catalog.Repository
	stream   *streaming.Service
}

func NewService(cfg Config, repo *Repository, lib *library.Repository, cat *catalog.Repository, stream *streaming.Service) *Service {
	if cfg.MaxDownloadsPerUser <= 0 {
		cfg.MaxDownloadsPerUser = 25
	}
	if cfg.SegmentPresignTTL <= 0 {
		cfg.SegmentPresignTTL = 7 * 24 * time.Hour
	}
	return &Service{cfg: cfg, repo: repo, lib: lib, catalog: cat, stream: stream}
}

func (s *Service) ListDownloaded(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	return s.repo.ListTrackIDs(ctx, userID)
}

func (s *Service) MaxDownloadsPerUser() int {
	return s.cfg.MaxDownloadsPerUser
}

func (s *Service) BuildPackage(ctx context.Context, userID, trackID uuid.UUID) (Package, error) {
	liked, err := s.lib.IsLiked(ctx, userID, trackID)
	if err != nil {
		return Package{}, err
	}
	if !liked {
		return Package{}, ErrNotAllowed
	}

	has, err := s.repo.Has(ctx, userID, trackID)
	if err != nil {
		return Package{}, err
	}
	if !has {
		count, err := s.repo.CountByUser(ctx, userID)
		if err != nil {
			return Package{}, err
		}
		if count >= s.cfg.MaxDownloadsPerUser {
			return Package{}, ErrLimitReached
		}
	}

	t, err := s.catalog.GetByID(ctx, trackID)
	if errors.Is(err, catalog.ErrNotFound) {
		return Package{}, fmt.Errorf("track not found")
	}
	if err != nil {
		return Package{}, err
	}
	if t.Status != domain.TrackPublished {
		return Package{}, fmt.Errorf("track not published")
	}

	expires := time.Now().Add(s.cfg.SegmentPresignTTL)
	manifestKey, previewURL := streaming.HLSManifestKey(t.GachiMetadata)

	if manifestKey == "" {
		if previewURL == "" {
			return Package{}, fmt.Errorf("track has no offline source")
		}
		if err := s.repo.Record(ctx, userID, trackID); err != nil {
			return Package{}, err
		}
		return Package{
			TrackID:    trackID.String(),
			Format:     "mp3",
			AudioURL:   previewURL,
			ExpiresAt:  expires,
			DurationMs: t.DurationMs,
		}, nil
	}

	prefix := hlsObjectPrefix(t.GachiMetadata)
	if prefix == "" {
		return Package{}, fmt.Errorf("missing hls prefix")
	}
	variantKey := prefix + defaultVariant + "/playlist.m3u8"
	raw, err := s.stream.GetObjectBytes(ctx, variantKey)
	if err != nil {
		return Package{}, fmt.Errorf("load variant playlist: %w", err)
	}

	segNames := parseTSSegments(raw)
	if len(segNames) == 0 {
		return Package{}, fmt.Errorf("no segments in variant")
	}
	ivHex := parseAESIV(raw)

	segPrefix := prefix + defaultVariant + "/"
	segments := make([]Segment, 0, len(segNames))
	for _, name := range segNames {
		url, err := s.stream.PresignObject(ctx, segPrefix+name, s.cfg.SegmentPresignTTL)
		if err != nil {
			return Package{}, err
		}
		segments = append(segments, Segment{Name: name, URL: url})
	}

	key, err := s.stream.GetHLSKey(ctx, trackID)
	if err != nil {
		return Package{}, fmt.Errorf("hls key unavailable: %w", err)
	}

	if err := s.repo.Record(ctx, userID, trackID); err != nil {
		return Package{}, err
	}

	return Package{
		TrackID:    trackID.String(),
		Format:     "hls_offline",
		AESKeyB64:  base64.StdEncoding.EncodeToString(key),
		AESIVHex:   ivHex,
		Segments:   segments,
		ExpiresAt:  expires,
		DurationMs: t.DurationMs,
	}, nil
}

func (s *Service) Remove(ctx context.Context, userID, trackID uuid.UUID) error {
	return s.repo.Remove(ctx, userID, trackID)
}

func hlsObjectPrefix(meta json.RawMessage) string {
	manifestKey, _ := streaming.HLSManifestKey(meta)
	if manifestKey == "" {
		return ""
	}
	if i := strings.LastIndex(manifestKey, "/"); i >= 0 {
		return manifestKey[:i+1]
	}
	return ""
}

func parseTSSegments(raw []byte) []string {
	var out []string
	sc := bufio.NewScanner(bytes.NewReader(raw))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasSuffix(strings.ToLower(line), ".ts") {
			out = append(out, line)
		}
	}
	return out
}

func parseAESIV(raw []byte) string {
	sc := bufio.NewScanner(bytes.NewReader(raw))
	for sc.Scan() {
		line := sc.Text()
		if !strings.Contains(line, "EXT-X-KEY") {
			continue
		}
		if idx := strings.Index(line, "IV=0x"); idx >= 0 {
			rest := line[idx+5:]
			if j := strings.IndexAny(rest, "\","); j >= 0 {
				return strings.TrimSpace(rest[:j])
			}
			return strings.TrimSpace(rest)
		}
	}
	return ""
}

package streaming

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/platform/storage"
	streamtoken "github.com/gachify/gachify/internal/platform/streaming"
	"github.com/google/uuid"
)

type Service struct {
	catalog *catalog.Repository
	storage *storage.Client
	signer  *streamtoken.TokenSigner
	segTTL  time.Duration
}

func NewService(cat *catalog.Repository, st *storage.Client, signer *streamtoken.TokenSigner, segTTL time.Duration) *Service {
	return &Service{catalog: cat, storage: st, signer: signer, segTTL: segTTL}
}

type PlaybackResponse struct {
	Format      string `json:"format"`
	PlaylistURL string `json:"playlist_url"`
	ExpiresIn   int64  `json:"expires_in"`
	DurationMs  int    `json:"duration_ms"`
	FallbackURL string `json:"fallback_url,omitempty"`
}

func (s *Service) PlaybackURL(trackID string, token string) string {
	return fmt.Sprintf("/api/v1/stream/playlist.m3u8?track_id=%s&pt=%s", trackID, token)
}

func (s *Service) GetPlayback(_ context.Context, _ string, track domain.Track, userID *uuid.UUID) (PlaybackResponse, error) {
	manifestKey, fallback := hlsManifestKey(track.GachiMetadata)
	if manifestKey == "" {
		if fallback == "" {
			return PlaybackResponse{}, fmt.Errorf("track has no streaming package")
		}
		return PlaybackResponse{
			Format:      "mp3",
			FallbackURL: fallback,
			DurationMs:  track.DurationMs,
		}, nil
	}

	token, exp, err := s.signer.Issue(track.ID, userID)
	if err != nil {
		return PlaybackResponse{}, err
	}

	return PlaybackResponse{
		Format:      "hls",
		PlaylistURL: s.PlaybackURL(track.ID.String(), token),
		ExpiresIn:   int64(time.Until(exp).Seconds()),
		DurationMs:  track.DurationMs,
		FallbackURL: fallback,
	}, nil
}

func hlsManifestKey(meta json.RawMessage) (manifestKey, previewURL string) {
	if len(meta) == 0 {
		return "", ""
	}
	var m map[string]any
	if err := json.Unmarshal(meta, &m); err != nil {
		return "", ""
	}
	if h, ok := m["hls"].(map[string]any); ok {
		if k, ok := h["manifest_key"].(string); ok {
			manifestKey = k
		}
	}
	if p, ok := m["preview_url"].(string); ok {
		previewURL = p
	}
	return manifestKey, previewURL
}

func (s *Service) ServePlaylist(ctx context.Context, track domain.Track, manifestKey string) ([]byte, error) {
	raw, err := s.storage.GetObjectBytes(ctx, manifestKey)
	if err != nil {
		return nil, err
	}
	prefix := manifestKey
	if i := strings.LastIndex(prefix, "/"); i >= 0 {
		prefix = prefix[:i+1]
	}

	var out bytes.Buffer
	sc := bufio.NewScanner(bytes.NewReader(raw))
	for sc.Scan() {
		line := sc.Text()
		trim := strings.TrimSpace(line)
		if trim == "" || strings.HasPrefix(trim, "#") {
			out.WriteString(line)
			out.WriteByte('\n')
			continue
		}
		segKey := prefix + trim
		if strings.Contains(trim, "://") {
			out.WriteString(line)
			out.WriteByte('\n')
			continue
		}
		signed, err := s.storage.PresignGet(ctx, segKey, s.segTTL)
		if err != nil {
			return nil, err
		}
		out.WriteString(signed)
		out.WriteByte('\n')
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

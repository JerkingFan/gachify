package streaming

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/platform/queue"
	"github.com/gachify/gachify/internal/platform/storage"
	streamtoken "github.com/gachify/gachify/internal/platform/streaming"
	"github.com/gachify/gachify/internal/platform/transcode"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type Service struct {
	catalog *catalog.Repository
	storage *storage.Client
	signer  *streamtoken.TokenSigner
	redis   *redis.Client
	segTTL  time.Duration
}

func NewService(cat *catalog.Repository, st *storage.Client, signer *streamtoken.TokenSigner, redisClient *redis.Client, segTTL time.Duration) *Service {
	return &Service{catalog: cat, storage: st, signer: signer, redis: redisClient, segTTL: segTTL}
}

type PlaybackResponse struct {
	Format      string `json:"format"`
	PlaylistURL string `json:"playlist_url"`
	DirectURL   string `json:"direct_url,omitempty"`
	ExpiresIn   int64  `json:"expires_in"`
	DurationMs  int    `json:"duration_ms"`
	FallbackURL string `json:"fallback_url,omitempty"`
}

func (s *Service) PlaylistURL(trackID, token, relPath string) string {
	return playlistURL("/api/v1/stream", trackID, token, relPath)
}

func (s *Service) KeyURL(trackID, token string) string {
	return KeyURL("/api/v1/stream", trackID, token)
}

func (s *Service) SegmentURL(trackID, token, objectKey string) string {
	return segmentURL("/api/v1/stream", trackID, token, objectKey)
}

func (s *Service) AudioURL(trackID, token string) string {
	return audioURL("/api/v1/stream", trackID, token)
}

// AdminPlaylistURL is the moderation preview entry playlist (pending_review only).
func AdminPlaylistURL(trackID, token, relPath string) string {
	return playlistURL("/internal/admin/stream", trackID, token, relPath)
}

// AdminKeyURL is the moderation preview AES-128 key endpoint.
func AdminKeyURL(trackID, token string) string {
	return KeyURL("/internal/admin/stream", trackID, token)
}

// AdminAudioURL is the moderation preview MP3 proxy (pending_review only).
func AdminAudioURL(trackID, token string) string {
	return audioURL("/internal/admin/stream", trackID, token)
}

func playlistURL(basePath, trackID, token, relPath string) string {
	u := fmt.Sprintf("%s/playlist.m3u8?track_id=%s&pt=%s", basePath, trackID, url.QueryEscape(token))
	if relPath != "" {
		u += "&path=" + url.QueryEscape(relPath)
	}
	return u
}

func KeyURL(basePath, trackID, token string) string {
	return fmt.Sprintf("%s/hls.key?track_id=%s&pt=%s", basePath, trackID, url.QueryEscape(token))
}

func segmentURL(basePath, trackID, token, objectKey string) string {
	return fmt.Sprintf("%s/segment?track_id=%s&pt=%s&object=%s", basePath, trackID, url.QueryEscape(token), url.QueryEscape(objectKey))
}

func audioURL(basePath, trackID, token string) string {
	return fmt.Sprintf("%s/audio?track_id=%s&pt=%s", basePath, trackID, url.QueryEscape(token))
}

// AdminSegmentURL is the moderation preview segment proxy path.
func AdminSegmentURL(trackID, token, objectKey string) string {
	return segmentURL("/internal/admin/stream", trackID, token, objectKey)
}

func (s *Service) GetPlayback(_ context.Context, _ string, track domain.Track, userID *uuid.UUID) (PlaybackResponse, error) {
	manifestKey, fallback := hlsManifestKey(track.GachiMetadata)
	masterKey := ""
	if track.MasterObjectKey != nil {
		masterKey = strings.TrimSpace(*track.MasterObjectKey)
	}

	if manifestKey == "" {
		if masterKey == "" && fallback == "" {
			return PlaybackResponse{}, fmt.Errorf("track has no streaming package")
		}
		if masterKey != "" {
			token, exp, err := s.signer.Issue(track.ID, userID)
			if err != nil {
				return PlaybackResponse{}, err
			}
			return PlaybackResponse{
				Format:      "mp3",
				DirectURL:   s.AudioURL(track.ID.String(), token),
				ExpiresIn:   int64(time.Until(exp).Seconds()),
				DurationMs:  track.DurationMs,
				FallbackURL: fallback,
			}, nil
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

	out := PlaybackResponse{
		Format:      "hls",
		PlaylistURL: s.PlaylistURL(track.ID.String(), token, ""),
		ExpiresIn:   int64(time.Until(exp).Seconds()),
		DurationMs:  track.DurationMs,
		FallbackURL: fallback,
	}
	if masterKey != "" {
		out.DirectURL = s.AudioURL(track.ID.String(), token)
	}
	return out, nil
}

// HLSManifestKey returns the object-store manifest key and optional preview URL from track metadata.
func HLSManifestKey(meta json.RawMessage) (manifestKey, previewURL string) {
	return hlsManifestKey(meta)
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

func hlsPrefix(meta json.RawMessage) string {
	manifestKey, _ := hlsManifestKey(meta)
	if manifestKey == "" {
		return ""
	}
	if i := strings.LastIndex(manifestKey, "/"); i >= 0 {
		return manifestKey[:i+1]
	}
	return ""
}

type rewriteOpts struct {
	TrackID       uuid.UUID
	PlaybackToken string
	ObjectPrefix  string
}

func (s *Service) ServePlaylist(ctx context.Context, track domain.Track, relPath, playbackToken string) ([]byte, error) {
	return s.servePlaylistRewritten(ctx, track, relPath, playbackToken, s.PlaylistURL, s.KeyURL, s.SegmentURL)
}

func (s *Service) ServeAdminPlaylist(ctx context.Context, track domain.Track, relPath, playbackToken string) ([]byte, error) {
	return s.servePlaylistRewritten(ctx, track, relPath, playbackToken, AdminPlaylistURL, AdminKeyURL, AdminSegmentURL)
}

func (s *Service) servePlaylistRewritten(ctx context.Context, track domain.Track, relPath, playbackToken string, playlistURL playlistURLFn, keyURL keyURLFn, segmentURL segmentURLFn) ([]byte, error) {
	basePrefix := hlsPrefix(track.GachiMetadata)
	if basePrefix == "" {
		return nil, fmt.Errorf("missing hls prefix")
	}
	manifestKey := basePrefix + "master.m3u8"
	if relPath != "" {
		manifestKey = basePrefix + relPath
	}

	raw, err := s.storage.GetObjectBytes(ctx, manifestKey)
	if err != nil {
		return nil, err
	}

	prefix := manifestKey
	if i := strings.LastIndex(prefix, "/"); i >= 0 {
		prefix = prefix[:i+1]
	}

	opts := rewriteOpts{
		TrackID:       track.ID,
		PlaybackToken: playbackToken,
		ObjectPrefix:  prefix,
	}
	return rewritePlaylist(ctx, raw, opts, segmentURL, playlistURL, keyURL)
}

func (s *Service) GetHLSKey(ctx context.Context, trackID uuid.UUID) ([]byte, error) {
	if s.redis == nil {
		return nil, redis.Nil
	}
	return s.redis.Get(ctx, queue.HLSKeyPrefix+":"+trackID.String()).Bytes()
}

func (s *Service) GetObjectBytes(ctx context.Context, objectKey string) ([]byte, error) {
	return s.storage.GetObjectBytes(ctx, objectKey)
}

func (s *Service) OpenObject(ctx context.Context, objectKey string) (storage.ObjectStream, error) {
	return s.storage.OpenObject(ctx, objectKey)
}

func (s *Service) OpenObjectRange(ctx context.Context, objectKey string, start, end int64) (storage.ObjectStream, error) {
	return s.storage.OpenObjectRange(ctx, objectKey, start, end)
}

func (s *Service) HeadObject(ctx context.Context, objectKey string) (storage.ObjectInfo, error) {
	return s.storage.HeadObject(ctx, objectKey)
}

func (s *Service) PresignObject(ctx context.Context, objectKey string, ttl time.Duration) (string, error) {
	return s.storage.PresignGet(ctx, objectKey, ttl)
}

type segmentURLFn func(trackID, token, objectKey string) string
type playlistURLFn func(trackID, token, relPath string) string
type keyURLFn func(trackID, token string) string

func rewritePlaylist(_ context.Context, raw []byte, opts rewriteOpts, segmentURL segmentURLFn, playlistURL playlistURLFn, keyURL keyURLFn) ([]byte, error) {
	basePrefix := opts.ObjectPrefix
	if i := strings.LastIndex(strings.TrimSuffix(basePrefix, "/"), "/"); i >= 0 {
		// master prefix is hls/{id}/; variant prefix is hls/{id}/128k/
		_ = i
	}
	hlsRoot := basePrefix
	if strings.Count(strings.Trim(basePrefix, "/"), "/") >= 2 {
		// variant playlist — root is hls/{trackID}/
		parts := strings.Split(strings.Trim(basePrefix, "/"), "/")
		if len(parts) >= 2 {
			hlsRoot = parts[0] + "/" + parts[1] + "/"
		}
	}

	var out bytes.Buffer
	sc := bufio.NewScanner(bytes.NewReader(raw))
	for sc.Scan() {
		line := sc.Text()
		trim := strings.TrimSpace(line)
		if trim == "" {
			out.WriteByte('\n')
			continue
		}
		if strings.HasPrefix(trim, "#EXT-X-KEY") {
			out.WriteString(rewriteKeyLine(line, opts, keyURL))
			out.WriteByte('\n')
			continue
		}
		if strings.HasPrefix(trim, "#") {
			out.WriteString(line)
			out.WriteByte('\n')
			continue
		}
		if strings.Contains(trim, "://") {
			out.WriteString(line)
			out.WriteByte('\n')
			continue
		}
		if strings.HasSuffix(strings.ToLower(trim), ".m3u8") {
			rel := trim
			if !strings.Contains(rel, "/") && hlsRoot != basePrefix {
				rel = strings.TrimPrefix(basePrefix, hlsRoot) + rel
			}
			out.WriteString(playlistURL(opts.TrackID.String(), opts.PlaybackToken, rel))
			out.WriteByte('\n')
			continue
		}
		segKey := opts.ObjectPrefix + trim
		out.WriteString(segmentURL(opts.TrackID.String(), opts.PlaybackToken, segKey))
		out.WriteByte('\n')
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func rewriteKeyLine(line string, opts rewriteOpts, keyURL keyURLFn) string {
	uri := keyURL(opts.TrackID.String(), opts.PlaybackToken)
	if strings.Contains(line, transcode.HLSKeyURIPlaceholder) {
		return strings.ReplaceAll(line, transcode.HLSKeyURIPlaceholder, uri)
	}
	if idx := strings.Index(line, "URI="); idx >= 0 {
		prefix := line[:idx+4]
		if strings.HasPrefix(line[idx+4:], `"`) {
			return prefix + `"` + uri + `"`
		}
		return prefix + uri
	}
	return line
}

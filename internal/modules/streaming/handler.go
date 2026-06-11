package streaming

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	platformauth "github.com/gachify/gachify/internal/platform/auth"
	streamtoken "github.com/gachify/gachify/internal/platform/streaming"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type Handler struct {
	svc     *Service
	catalog *catalog.Repository
	signer  *streamtoken.TokenSigner
	baseURL string
}

func NewHandler(svc *Service, cat *catalog.Repository, signer *streamtoken.TokenSigner, baseURL string) *Handler {
	return &Handler{svc: svc, catalog: cat, signer: signer, baseURL: baseURL}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/tracks/{id}/playback", h.playback)
	r.Get("/playlist.m3u8", h.playlist)
	r.Get("/hls.key", h.hlsKey)
	r.Get("/segment", h.segment)
	r.Get("/audio", h.audio)
	return r
}

func (h *Handler) playback(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	track, err := h.catalog.GetByID(r.Context(), id)
	if errors.Is(err, catalog.ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load track")
		return
	}
	if track.Status != domain.TrackPublished {
		httpserver.Error(w, http.StatusForbidden, "not_available", "track is not published")
		return
	}

	var userID *uuid.UUID
	if uid, ok := platformauth.UserIDFromContext(r.Context()); ok {
		userID = &uid
	}

	out, err := h.svc.GetPlayback(r.Context(), "", track, userID)
	if err != nil {
		httpserver.Error(w, http.StatusNotFound, "no_stream", err.Error())
		return
	}
	httpserver.JSON(w, http.StatusOK, out)
}

func (h *Handler) verifyPlaybackToken(w http.ResponseWriter, r *http.Request) (streamtoken.PlaybackClaims, uuid.UUID, bool) {
	pt := r.URL.Query().Get("pt")
	if pt == "" {
		httpserver.Error(w, http.StatusUnauthorized, "missing_token", "playback token required")
		return streamtoken.PlaybackClaims{}, uuid.Nil, false
	}
	claims, err := h.signer.Verify(pt)
	if err != nil {
		httpserver.Error(w, http.StatusUnauthorized, "invalid_token", "playback token invalid or expired")
		return streamtoken.PlaybackClaims{}, uuid.Nil, false
	}
	trackID, err := streamtoken.ParseTrackID(claims)
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_token", "bad track id in token")
		return streamtoken.PlaybackClaims{}, uuid.Nil, false
	}
	qTrack := r.URL.Query().Get("track_id")
	if qTrack != "" && qTrack != trackID.String() {
		httpserver.Error(w, http.StatusBadRequest, "token_mismatch", "track_id does not match token")
		return streamtoken.PlaybackClaims{}, uuid.Nil, false
	}
	return claims, trackID, true
}

func (h *Handler) loadPublishedTrack(w http.ResponseWriter, r *http.Request, trackID uuid.UUID) (domain.Track, bool) {
	track, err := h.catalog.GetByID(r.Context(), trackID)
	if errors.Is(err, catalog.ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return domain.Track{}, false
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load track")
		return domain.Track{}, false
	}
	if track.Status != domain.TrackPublished {
		httpserver.Error(w, http.StatusForbidden, "not_available", "track not published")
		return domain.Track{}, false
	}
	return track, true
}

func (h *Handler) playlist(w http.ResponseWriter, r *http.Request) {
	_, trackID, ok := h.verifyPlaybackToken(w, r)
	if !ok {
		return
	}
	track, ok := h.loadPublishedTrack(w, r, trackID)
	if !ok {
		return
	}

	manifestKey, _ := hlsManifestKey(track.GachiMetadata)
	if manifestKey == "" {
		httpserver.Error(w, http.StatusNotFound, "no_hls", "HLS manifest not found")
		return
	}

	pt := r.URL.Query().Get("pt")
	relPath := r.URL.Query().Get("path")
	body, err := h.svc.ServePlaylist(r.Context(), track, relPath, pt)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "playlist_error", "failed to build playlist")
		return
	}

	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func (h *Handler) hlsKey(w http.ResponseWriter, r *http.Request) {
	_, trackID, ok := h.verifyPlaybackToken(w, r)
	if !ok {
		return
	}
	if _, ok := h.loadPublishedTrack(w, r, trackID); !ok {
		return
	}

	key, err := h.svc.GetHLSKey(r.Context(), trackID)
	if errors.Is(err, redis.Nil) || len(key) == 0 {
		httpserver.Error(w, http.StatusNotFound, "no_key", "encryption key not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "key_error", "failed to load encryption key")
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(key)
}

func (h *Handler) segment(w http.ResponseWriter, r *http.Request) {
	_, trackID, ok := h.verifyPlaybackToken(w, r)
	if !ok {
		return
	}
	track, ok := h.loadPublishedTrack(w, r, trackID)
	if !ok {
		return
	}
	objectKey := r.URL.Query().Get("object")
	if objectKey == "" {
		httpserver.Error(w, http.StatusBadRequest, "missing_object", "object key required")
		return
	}
	prefix := hlsPrefix(track.GachiMetadata)
	if prefix == "" || !strings.HasPrefix(objectKey, prefix) {
		httpserver.Error(w, http.StatusForbidden, "invalid_object", "object not allowed for this track")
		return
	}
	data, err := h.svc.GetObjectBytes(r.Context(), objectKey)
	if err != nil {
		httpserver.Error(w, http.StatusNotFound, "not_found", "segment not found")
		return
	}
	w.Header().Set("Content-Type", "video/mp2t")
	w.Header().Set("Cache-Control", "private, max-age=120")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (h *Handler) audio(w http.ResponseWriter, r *http.Request) {
	_, trackID, ok := h.verifyPlaybackToken(w, r)
	if !ok {
		return
	}
	track, ok := h.loadPublishedTrack(w, r, trackID)
	if !ok {
		return
	}
	if track.MasterObjectKey == nil || strings.TrimSpace(*track.MasterObjectKey) == "" {
		httpserver.Error(w, http.StatusNotFound, "no_audio", "source file not found")
		return
	}
	objectKey := strings.TrimSpace(*track.MasterObjectKey)

	head, err := h.svc.HeadObject(r.Context(), objectKey)
	if err != nil {
		httpserver.Error(w, http.StatusNotFound, "not_found", "audio not found")
		return
	}
	totalSize := head.Size
	if totalSize <= 0 {
		httpserver.Error(w, http.StatusNotFound, "not_found", "audio not found")
		return
	}

	ct := head.ContentType
	if track.SourceContentType != nil && strings.TrimSpace(*track.SourceContentType) != "" {
		ct = strings.TrimSpace(*track.SourceContentType)
	}

	w.Header().Set("Content-Type", ct)
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "private, max-age=120")

	rangeHdr := r.Header.Get("Range")
	if rangeHdr == "" {
		stream, err := h.svc.OpenObject(r.Context(), objectKey)
		if err != nil {
			httpserver.Error(w, http.StatusNotFound, "not_found", "audio not found")
			return
		}
		defer stream.Body.Close()
		w.Header().Set("Content-Length", fmt.Sprintf("%d", totalSize))
		w.WriteHeader(http.StatusOK)
		_, _ = io.Copy(w, stream.Body)
		return
	}

	br, ok := parseByteRange(rangeHdr, totalSize)
	if !ok {
		writeRangeNotSatisfiable(w, totalSize)
		return
	}

	stream, err := h.svc.OpenObjectRange(r.Context(), objectKey, br.start, br.end)
	if err != nil {
		httpserver.Error(w, http.StatusNotFound, "not_found", "audio not found")
		return
	}
	defer stream.Body.Close()

	partLen := br.end - br.start + 1
	w.Header().Set("Content-Length", fmt.Sprintf("%d", partLen))
	w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", br.start, br.end, totalSize))
	w.WriteHeader(http.StatusPartialContent)
	_, _ = io.Copy(w, stream.Body)
}

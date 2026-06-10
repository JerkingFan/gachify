package admin

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/modules/streaming"
	"github.com/gachify/gachify/internal/platform/httpserver"
	streamtoken "github.com/gachify/gachify/internal/platform/streaming"
	"github.com/gachify/gachify/internal/platform/trackcover"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

func (h *Handler) getTrack(w http.ResponseWriter, r *http.Request) {
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
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "load failed")
		return
	}
	trackcover.Enrich(r.Context(), h.storage, &track)
	httpserver.JSON(w, http.StatusOK, track)
}

func (h *Handler) updateTrack(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	var body updateTrackBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		httpserver.Error(w, http.StatusBadRequest, "invalid_title", "title is required")
		return
	}
	track, err := h.catalog.GetByID(r.Context(), id)
	if errors.Is(err, catalog.ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "load failed")
		return
	}
	if track.Status != domain.TrackPendingReview {
		httpserver.Error(w, http.StatusConflict, "invalid_state", "only pending_review tracks can be edited")
		return
	}
	meta, err := mergeGachiMetadata(track.GachiMetadata, body)
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_metadata", "invalid metadata")
		return
	}
	if err := h.catalog.UpdateModeration(r.Context(), id, title, meta); err != nil {
		if errors.Is(err, catalog.ErrNotFound) {
			httpserver.Error(w, http.StatusConflict, "invalid_state", "track is not pending review")
			return
		}
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "update failed")
		return
	}
	updated, err := h.catalog.GetByID(r.Context(), id)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "load failed")
		return
	}
	httpserver.JSON(w, http.StatusOK, updated)
}

func (h *Handler) previewPlayback(w http.ResponseWriter, r *http.Request) {
	if h.stream == nil || h.signer == nil {
		httpserver.Error(w, http.StatusServiceUnavailable, "unavailable", "streaming not configured")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	track, ok := h.loadPendingReviewTrack(w, r, id)
	if !ok {
		return
	}
	out, err := h.stream.GetPlayback(r.Context(), "", track, nil)
	if err != nil {
		httpserver.Error(w, http.StatusNotFound, "no_stream", err.Error())
		return
	}
	if out.Format == "hls" && out.PlaylistURL != "" {
		token := extractPlaybackToken(out.PlaylistURL)
		if token != "" {
			out.PlaylistURL = streaming.AdminPlaylistURL(id.String(), token, "")
		}
	}
	httpserver.JSON(w, http.StatusOK, out)
}

func (h *Handler) adminPlaylist(w http.ResponseWriter, r *http.Request) {
	if h.stream == nil || h.signer == nil {
		httpserver.Error(w, http.StatusServiceUnavailable, "unavailable", "streaming not configured")
		return
	}
	claims, trackID, ok := h.verifyPlaybackToken(w, r)
	if !ok {
		return
	}
	track, ok := h.loadPendingReviewTrack(w, r, trackID)
	if !ok {
		return
	}
	manifestKey, _ := streaming.HLSManifestKey(track.GachiMetadata)
	if manifestKey == "" {
		httpserver.Error(w, http.StatusNotFound, "no_hls", "HLS manifest not found")
		return
	}
	pt := r.URL.Query().Get("pt")
	relPath := r.URL.Query().Get("path")
	body, err := h.stream.ServeAdminPlaylist(r.Context(), track, relPath, pt)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "playlist_error", "failed to build playlist")
		return
	}
	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
	_ = claims
}

func (h *Handler) adminHLSKey(w http.ResponseWriter, r *http.Request) {
	if h.stream == nil || h.signer == nil {
		httpserver.Error(w, http.StatusServiceUnavailable, "unavailable", "streaming not configured")
		return
	}
	_, trackID, ok := h.verifyPlaybackToken(w, r)
	if !ok {
		return
	}
	if _, ok := h.loadPendingReviewTrack(w, r, trackID); !ok {
		return
	}
	key, err := h.stream.GetHLSKey(r.Context(), trackID)
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

func (h *Handler) adminSegment(w http.ResponseWriter, r *http.Request) {
	if h.stream == nil || h.signer == nil {
		httpserver.Error(w, http.StatusServiceUnavailable, "unavailable", "streaming not configured")
		return
	}
	_, trackID, ok := h.verifyPlaybackToken(w, r)
	if !ok {
		return
	}
	track, ok := h.loadPendingReviewTrack(w, r, trackID)
	if !ok {
		return
	}
	objectKey := r.URL.Query().Get("object")
	if objectKey == "" {
		httpserver.Error(w, http.StatusBadRequest, "missing_object", "object key required")
		return
	}
	manifestKey, _ := streaming.HLSManifestKey(track.GachiMetadata)
	if manifestKey == "" {
		httpserver.Error(w, http.StatusForbidden, "invalid_object", "track has no hls package")
		return
	}
	prefix := manifestKey[:strings.LastIndex(manifestKey, "/")+1]
	if !strings.HasPrefix(objectKey, prefix) {
		httpserver.Error(w, http.StatusForbidden, "invalid_object", "object not allowed for this track")
		return
	}
	data, err := h.stream.GetObjectBytes(r.Context(), objectKey)
	if err != nil {
		httpserver.Error(w, http.StatusNotFound, "not_found", "segment not found")
		return
	}
	w.Header().Set("Content-Type", "video/mp2t")
	w.Header().Set("Cache-Control", "private, max-age=120")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (h *Handler) loadPendingReviewTrack(w http.ResponseWriter, r *http.Request, trackID uuid.UUID) (domain.Track, bool) {
	track, err := h.catalog.GetByID(r.Context(), trackID)
	if errors.Is(err, catalog.ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return domain.Track{}, false
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load track")
		return domain.Track{}, false
	}
	if track.Status != domain.TrackPendingReview {
		httpserver.Error(w, http.StatusForbidden, "not_available", "track is not pending review")
		return domain.Track{}, false
	}
	return track, true
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

func extractPlaybackToken(playlistURL string) string {
	u, err := url.Parse(playlistURL)
	if err != nil {
		return ""
	}
	return u.Query().Get("pt")
}

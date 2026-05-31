package streaming

import (
	"errors"
	"net/http"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	platformauth "github.com/gachify/gachify/internal/platform/auth"
	streamtoken "github.com/gachify/gachify/internal/platform/streaming"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
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

func (h *Handler) playlist(w http.ResponseWriter, r *http.Request) {
	pt := r.URL.Query().Get("pt")
	if pt == "" {
		httpserver.Error(w, http.StatusUnauthorized, "missing_token", "playback token required")
		return
	}
	claims, err := h.signer.Verify(pt)
	if err != nil {
		httpserver.Error(w, http.StatusUnauthorized, "invalid_token", "playback token invalid or expired")
		return
	}
	trackID, err := streamtoken.ParseTrackID(claims)
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_token", "bad track id in token")
		return
	}
	qTrack := r.URL.Query().Get("track_id")
	if qTrack != "" && qTrack != trackID.String() {
		httpserver.Error(w, http.StatusBadRequest, "token_mismatch", "track_id does not match token")
		return
	}

	track, err := h.catalog.GetByID(r.Context(), trackID)
	if errors.Is(err, catalog.ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	if track.Status != domain.TrackPublished {
		httpserver.Error(w, http.StatusForbidden, "not_available", "track not published")
		return
	}

	manifestKey, _ := hlsManifestKey(track.GachiMetadata)
	if manifestKey == "" {
		httpserver.Error(w, http.StatusNotFound, "no_hls", "HLS manifest not found")
		return
	}

	body, err := h.svc.ServePlaylist(r.Context(), track, manifestKey)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "playlist_error", "failed to build playlist")
		return
	}

	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

package admin

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type publishTrackBody struct {
	updateTrackBody
	ArtistDisplayName string `json:"artist_display_name"`
	ArtistHandle      string `json:"artist_handle,omitempty"`
}

func (h *Handler) publishTrack(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	var body publishTrackBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	artistName := strings.TrimSpace(body.ArtistDisplayName)
	if artistName == "" {
		httpserver.Error(w, http.StatusBadRequest, "invalid_artist", "artist_display_name is required")
		return
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		httpserver.Error(w, http.StatusBadRequest, "invalid_title", "title is required")
		return
	}
	if h.users == nil {
		httpserver.Error(w, http.StatusServiceUnavailable, "unavailable", "users not configured")
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
	if track.Status != domain.TrackPendingReview && track.Status != domain.TrackDraft {
		httpserver.Error(w, http.StatusConflict, "invalid_state", "only pending_review or draft tracks can be published")
		return
	}

	handleHint := strings.TrimSpace(body.ArtistHandle)
	artist, err := h.users.FindOrCreateArtist(r.Context(), artistName, handleHint)
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_artist", err.Error())
		return
	}

	meta, err := mergeGachiMetadata(track.GachiMetadata, body.updateTrackBody)
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_metadata", "invalid metadata")
		return
	}
	if err := h.catalog.AdminPublish(r.Context(), id, artist.ID, title, meta); err != nil {
		if errors.Is(err, catalog.ErrNotFound) {
			httpserver.Error(w, http.StatusConflict, "invalid_state", "track cannot be published")
			return
		}
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "publish failed")
		return
	}

	updated, err := h.catalog.GetByID(r.Context(), id)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "load failed")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{
		"status":  "published",
		"track":   updated,
		"creator": artist,
	})
}

package catalog

import (
	"errors"
	"net/http"

	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/gachify/gachify/internal/platform/trackcover"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (h *Handler) trackCover(w http.ResponseWriter, r *http.Request) {
	if h.storage == nil {
		httpserver.Error(w, http.StatusServiceUnavailable, "unavailable", "storage not configured")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "track id must be a UUID")
		return
	}
	track, err := h.repo.GetByID(r.Context(), id)
	if errors.Is(err, ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load track")
		return
	}
	if track.CoverObjectKey == nil || *track.CoverObjectKey == "" {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track has no cover")
		return
	}

	base := httpserver.PublicBaseURL(r)
	if base == "" {
		base = h.storage.PublicBaseURL()
	}
	url, err := h.storage.PresignGetWithBase(r.Context(), *track.CoverObjectKey, base, trackcover.PresignTTL)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to sign cover url")
		return
	}
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

package catalog

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (h *Handler) lyrics(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	t, err := h.repo.GetByID(r.Context(), id)
	if errors.Is(err, ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load track")
		return
	}
	if t.Status != domain.TrackPublished {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	var meta map[string]any
	if len(t.GachiMetadata) > 0 {
		_ = json.Unmarshal(t.GachiMetadata, &meta)
	}
	lyrics, _ := meta["lyrics"]
	if lyrics == nil {
		httpserver.JSON(w, http.StatusOK, map[string]any{
			"lines":  []any{},
			"format": "none",
			"source": "none",
		})
		return
	}
	httpserver.JSON(w, http.StatusOK, lyrics)
}

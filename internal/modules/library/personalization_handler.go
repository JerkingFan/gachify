package library

import (
	"encoding/json"
	"errors"
	"net/http"

	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (h *Handler) forYou(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}

	var seeds []uuid.UUID
	if h.recent != nil {
		recentIDs, _ := h.recent.List(r.Context(), uid, 15)
		seeds = append(seeds, recentIDs...)
	}
	likedIDs, _ := h.repo.ListLikedTrackIDs(r.Context(), uid)
	seeds = append(seeds, likedIDs...)
	following, _ := h.repo.ListFollowingIDs(r.Context(), uid)
	if len(following) > 0 {
		feed, _ := h.catalog.ListPublishedByCreators(r.Context(), following, 10, 0)
		for _, t := range feed {
			seeds = append(seeds, t.ID)
		}
	}

	items, err := h.catalog.ListForYou(r.Context(), seeds, 20)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load recommendations")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) listFilterPresets(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	items, err := h.repo.ListFilterPresets(r.Context(), uid)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load presets")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) createFilterPreset(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	var body struct {
		Name    string          `json:"name"`
		Filters json.RawMessage `json:"filters"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	p, err := h.repo.CreateFilterPreset(r.Context(), uid, body.Name, body.Filters)
	if errors.Is(err, ErrPresetNameTaken) {
		httpserver.Error(w, http.StatusConflict, "name_taken", "preset name already exists")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	httpserver.JSON(w, http.StatusCreated, p)
}

func (h *Handler) deleteFilterPreset(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	presetID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid preset id")
		return
	}
	if err := h.repo.DeleteFilterPreset(r.Context(), uid, presetID); err != nil {
		if errors.Is(err, ErrPresetNotFound) {
			httpserver.Error(w, http.StatusNotFound, "not_found", "preset not found")
			return
		}
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to delete preset")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

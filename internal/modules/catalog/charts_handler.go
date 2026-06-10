package catalog

import (
	"net/http"
	"strconv"

	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/gachify/gachify/internal/platform/trackcover"
	"github.com/go-chi/chi/v5"
)

func (h *Handler) ChartsRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/weekly", h.topWeekly)
	r.Get("/moods", h.listMoods)
	return r
}

func (h *Handler) topWeekly(w http.ResponseWriter, r *http.Request) {
	limit := parseIntDefault(r.URL.Query().Get("limit"), 50)
	offset := parseIntDefault(r.URL.Query().Get("offset"), 0)
	items, err := h.repo.ListTopWeekly(r.Context(), limit, offset)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load charts")
		return
	}
	trackcover.EnrichChartSlice(r.Context(), h.storage, items)
	httpserver.JSON(w, http.StatusOK, map[string]any{
		"items":    items,
		"period":   "7d",
		"limit":    limit,
		"offset":   offset,
		"has_more": len(items) >= limit,
	})
}

func (h *Handler) listMoods(w http.ResponseWriter, r *http.Request) {
	limit := 100
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	tags, err := h.repo.ListDistinctMoodTags(r.Context(), limit)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load moods")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"items": tags})
}

func (h *Handler) listByMood(w http.ResponseWriter, r *http.Request) {
	mood := chi.URLParam(r, "slug")
	if mood == "" {
		httpserver.Error(w, http.StatusBadRequest, "invalid_mood", "mood required")
		return
	}
	limit := parseIntDefault(r.URL.Query().Get("limit"), 40)
	offset := parseIntDefault(r.URL.Query().Get("offset"), 0)
	items, err := h.repo.ListByMoodTag(r.Context(), mood, limit, offset)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to list tracks")
		return
	}
	trackcover.EnrichWithCreatorSlice(r.Context(), h.storage, items)
	httpserver.JSON(w, http.StatusOK, map[string]any{
		"mood":     mood,
		"items":    items,
		"limit":    limit,
		"offset":   offset,
		"has_more": len(items) >= limit,
	})
}

func (h *Handler) TagRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/{slug}", h.listByMood)
	return r
}

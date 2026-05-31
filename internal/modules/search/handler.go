package search

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/users"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/gachify/gachify/internal/platform/ratelimit"
	"github.com/gachify/gachify/internal/platform/validate"
	"github.com/go-chi/chi/v5"
)

type Handler struct {
	users       *users.Repository
	rl          *ratelimit.Limiter
	searchLimit int
}

func NewHandler(users *users.Repository, rl *ratelimit.Limiter, searchLimit int) *Handler {
	return &Handler{users: users, rl: rl, searchLimit: searchLimit}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(h.rl.Middleware("search:artists", h.searchLimit, time.Minute, ratelimit.ByIP)).Get("/artists", h.searchArtists)
	return r
}

func (h *Handler) searchArtists(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	if err := validate.SearchQuery(q); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_query", err.Error())
		return
	}
	if q == "" {
		httpserver.JSON(w, http.StatusOK, map[string]any{
			"items":    []domain.ArtistSearchResult{},
			"total":    0,
			"limit":    20,
			"offset":   0,
			"has_more": false,
		})
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	f := domain.SearchArtistsFilter{Query: q, Limit: limit, Offset: offset}

	total, err := h.users.CountSearchCreators(r.Context(), f)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "search failed")
		return
	}
	items, err := h.users.SearchCreators(r.Context(), f)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "search failed")
		return
	}
	if items == nil {
		items = []domain.ArtistSearchResult{}
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{
		"items":    items,
		"total":    total,
		"limit":    f.Limit,
		"offset":   f.Offset,
		"has_more": f.Offset+len(items) < total,
	})
}

package catalog

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/platform/cache"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/gachify/gachify/internal/platform/ratelimit"
	"github.com/gachify/gachify/internal/platform/validate"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	repo        *Repository
	rl          *ratelimit.Limiter
	searchLimit int
	cache       *cache.Store
}

func NewHandler(repo *Repository, rl *ratelimit.Limiter, searchLimit int, cacheStore *cache.Store) *Handler {
	return &Handler{repo: repo, rl: rl, searchLimit: searchLimit, cache: cacheStore}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(h.rl.Middleware("tracks:search", h.searchLimit, time.Minute, ratelimit.ByIP)).Get("/", h.list)
	r.Get("/{id}/similar", h.similar)
	r.Get("/{id}", h.getByID)
	r.Post("/{id}/play", h.recordPlay)
	return r
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var in domain.CreateTrackInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "request body must be valid JSON")
		return
	}
	if in.CreatorID == uuid.Nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_creator", "creator_id is required")
		return
	}
	if strings.TrimSpace(in.Title) == "" {
		httpserver.Error(w, http.StatusBadRequest, "invalid_title", "title is required")
		return
	}

	t, err := h.repo.Create(r.Context(), in)
	if err != nil {
		if strings.Contains(err.Error(), "foreign key") {
			httpserver.Error(w, http.StatusBadRequest, "unknown_creator", "creator_id does not exist")
			return
		}
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to create track")
		return
	}
	httpserver.JSON(w, http.StatusCreated, t)
}

func (h *Handler) getByID(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "track id must be a UUID")
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
	httpserver.JSON(w, http.StatusOK, t)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	f := domain.ListTracksFilter{
		Limit:  parseIntDefault(r.URL.Query().Get("limit"), 20),
		Offset: parseIntDefault(r.URL.Query().Get("offset"), 0),
	}
	if s := r.URL.Query().Get("status"); s != "" {
		st := domain.TrackStatus(s)
		f.Status = &st
	}
	if c := r.URL.Query().Get("creator_id"); c != "" {
		id, err := uuid.Parse(c)
		if err != nil {
			httpserver.Error(w, http.StatusBadRequest, "invalid_creator_id", "creator_id must be a UUID")
			return
		}
		f.CreatorID = &id
	}
	f.Query = strings.TrimSpace(r.URL.Query().Get("q"))
	f.Sort = strings.TrimSpace(r.URL.Query().Get("sort"))
	if err := validate.SearchQuery(f.Query); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_query", err.Error())
		return
	}
	// Default feed: published tracks only
	if f.Status == nil {
		st := domain.TrackPublished
		f.Status = &st
	}

	creatorKey := ""
	if f.CreatorID != nil {
		creatorKey = f.CreatorID.String()
	}
	statusKey := ""
	if f.Status != nil {
		statusKey = string(*f.Status)
	}

	var cached map[string]any
	if h.cache != nil {
		cacheKey := h.cache.TracksListKey(statusKey, f.Query, f.Sort, f.Limit, f.Offset, creatorKey)
		if ok, _ := h.cache.GetJSON(r.Context(), cacheKey, &cached); ok {
			httpserver.JSON(w, http.StatusOK, cached)
			return
		}
	}

	total, err := h.repo.Count(r.Context(), f)
	if err != nil {
		slog.Error("count tracks", "error", err)
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to count tracks")
		return
	}
	tracks, err := h.repo.List(r.Context(), f)
	if err != nil {
		slog.Error("list tracks", "error", err)
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to list tracks")
		return
	}
	response := map[string]any{
		"items":    tracks,
		"total":    total,
		"limit":    f.Limit,
		"offset":   f.Offset,
		"has_more": f.Offset+len(tracks) < total,
	}
	if h.cache != nil {
		cacheKey := h.cache.TracksListKey(statusKey, f.Query, f.Sort, f.Limit, f.Offset, creatorKey)
		_ = h.cache.SetJSON(r.Context(), cacheKey, response, 0)
	}
	httpserver.JSON(w, http.StatusOK, response)
}

func (h *Handler) recordPlay(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	if err := h.repo.IncrementPlayCount(r.Context(), id); errors.Is(err, ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	} else if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to record play")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) similar(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "track id must be a UUID")
		return
	}
	limit := parseIntDefault(r.URL.Query().Get("limit"), 10)
	tracks, err := h.repo.ListSimilar(r.Context(), id, limit)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to list similar tracks")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"items": tracks})
}

func parseIntDefault(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}

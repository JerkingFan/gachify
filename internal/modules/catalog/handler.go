package catalog

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/platform/cache"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/gachify/gachify/internal/platform/ratelimit"
	"github.com/gachify/gachify/internal/platform/storage"
	"github.com/gachify/gachify/internal/platform/trackcover"
	"github.com/gachify/gachify/internal/platform/validate"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	repo        *Repository
	storage     *storage.Client
	rl          *ratelimit.Limiter
	searchLimit int
	cache       *cache.Store
}

func NewHandler(repo *Repository, st *storage.Client, rl *ratelimit.Limiter, searchLimit int, cacheStore *cache.Store) *Handler {
	return &Handler{repo: repo, storage: st, rl: rl, searchLimit: searchLimit, cache: cacheStore}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(h.rl.Middleware("tracks:search", h.searchLimit, time.Minute, ratelimit.ByIP)).Get("/", h.list)
	r.Get("/{id}/similar", h.similar)
	r.Get("/{id}/next", h.recommendNext)
	r.Get("/{id}/lyrics", h.lyrics)
	r.Get("/{id}/cover", h.trackCover)
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
	t, err := h.repo.GetByIDWithCreator(r.Context(), id)
	if errors.Is(err, ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load track")
		return
	}
	trackcover.Enrich(r.Context(), h.storage, &t.Track)
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
	f.MoodTag = strings.TrimSpace(r.URL.Query().Get("mood"))
	f.Sample = strings.TrimSpace(r.URL.Query().Get("sample"))
	if v := r.URL.Query().Get("min_power"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			f.MinPower = &n
		}
	}
	if v := r.URL.Query().Get("max_power"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			f.MaxPower = &n
		}
	}
	if v := r.URL.Query().Get("min_deepness"); v != "" {
		if x, err := strconv.ParseFloat(v, 32); err == nil {
			f32 := float32(x)
			f.MinDeepness = &f32
		}
	}
	if v := r.URL.Query().Get("max_deepness"); v != "" {
		if x, err := strconv.ParseFloat(v, 32); err == nil {
			f32 := float32(x)
			f.MaxDeepness = &f32
		}
	}
	if v := r.URL.Query().Get("min_bpm"); v != "" {
		if x, err := strconv.ParseFloat(v, 32); err == nil {
			f32 := float32(x)
			f.MinBPM = &f32
		}
	}
	if v := r.URL.Query().Get("max_bpm"); v != "" {
		if x, err := strconv.ParseFloat(v, 32); err == nil {
			f32 := float32(x)
			f.MaxBPM = &f32
		}
	}
	if v := r.URL.Query().Get("has_lyrics"); v == "true" || v == "1" {
		t := true
		f.HasLyrics = &t
	}
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

	metaKey := listFilterMetaKey(f)

	var cached map[string]any
	if h.cache != nil {
		cacheKey := h.cache.TracksListKey(statusKey, f.Query, f.Sort, f.Limit, f.Offset, creatorKey, metaKey)
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
	trackcover.EnrichWithCreatorSlice(r.Context(), h.storage, tracks)
	response := map[string]any{
		"items":    tracks,
		"total":    total,
		"limit":    f.Limit,
		"offset":   f.Offset,
		"has_more": f.Offset+len(tracks) < total,
	}
	if h.cache != nil {
		cacheKey := h.cache.TracksListKey(statusKey, f.Query, f.Sort, f.Limit, f.Offset, creatorKey, metaKey)
		_ = h.cache.SetJSON(r.Context(), cacheKey, response, 0)
	}
	httpserver.JSON(w, http.StatusOK, response)
}

func listFilterMetaKey(f domain.ListTracksFilter) string {
	var parts []string
	if f.MoodTag != "" {
		parts = append(parts, "mood:"+f.MoodTag)
	}
	if f.Sample != "" {
		parts = append(parts, "sample:"+f.Sample)
	}
	if f.MinPower != nil {
		parts = append(parts, fmt.Sprintf("pmin:%d", *f.MinPower))
	}
	if f.MaxPower != nil {
		parts = append(parts, fmt.Sprintf("pmax:%d", *f.MaxPower))
	}
	if f.MinDeepness != nil {
		parts = append(parts, fmt.Sprintf("dmin:%g", *f.MinDeepness))
	}
	if f.MaxDeepness != nil {
		parts = append(parts, fmt.Sprintf("dmax:%g", *f.MaxDeepness))
	}
	if f.MinBPM != nil {
		parts = append(parts, fmt.Sprintf("bmin:%g", *f.MinBPM))
	}
	if f.MaxBPM != nil {
		parts = append(parts, fmt.Sprintf("bmax:%g", *f.MaxBPM))
	}
	if f.HasLyrics != nil && *f.HasLyrics {
		parts = append(parts, "lyrics:1")
	}
	return strings.Join(parts, "|")
}

func (h *Handler) recordPlay(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	var in domain.RecordPlayInput
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&in)
	}
	if err := h.repo.IncrementPlayCount(r.Context(), id, in.Source); errors.Is(err, ErrNotFound) {
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
	trackcover.EnrichWithCreatorSlice(r.Context(), h.storage, tracks)
	httpserver.JSON(w, http.StatusOK, map[string]any{"items": tracks})
}

func (h *Handler) recommendNext(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "track id must be a UUID")
		return
	}
	limit := parseIntDefault(r.URL.Query().Get("limit"), 1)
	exclude := parseUUIDList(r.URL.Query().Get("exclude"))
	exclude = append(exclude, id)
	tracks, err := h.repo.ListRecommendNext(r.Context(), id, exclude, limit)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to recommend next tracks")
		return
	}
	trackcover.EnrichWithCreatorSlice(r.Context(), h.storage, tracks)
	httpserver.JSON(w, http.StatusOK, map[string]any{"items": tracks})
}

func parseUUIDList(raw string) []uuid.UUID {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]uuid.UUID, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		id, err := uuid.Parse(p)
		if err != nil {
			continue
		}
		out = append(out, id)
	}
	return out
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

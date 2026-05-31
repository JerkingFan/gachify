package catalog

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.create)
	r.Get("/", h.list)
	r.Get("/{id}", h.getByID)
	return r
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
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
	// Default feed: published tracks only
	if f.Status == nil {
		st := domain.TrackPublished
		f.Status = &st
	}

	total, err := h.repo.Count(r.Context(), f)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to count tracks")
		return
	}
	tracks, err := h.repo.List(r.Context(), f)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to list tracks")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{
		"items":    tracks,
		"total":    total,
		"limit":    f.Limit,
		"offset":   f.Offset,
		"has_more": f.Offset+len(tracks) < total,
	})
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

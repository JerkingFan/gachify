package users

import (
	"encoding/json"
	"errors"
	"net/http"
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
	r.Get("/{id}", h.getByID)
	r.Get("/by-handle/{handle}", h.getByHandle)
	return r
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var in domain.CreateUserInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "request body must be valid JSON")
		return
	}
	in.Handle = strings.TrimSpace(strings.ToLower(in.Handle))
	if in.Handle == "" {
		httpserver.Error(w, http.StatusBadRequest, "invalid_handle", "handle is required")
		return
	}
	if in.DisplayName == "" {
		in.DisplayName = in.Handle
	}

	u, err := h.repo.Create(r.Context(), in)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			httpserver.Error(w, http.StatusConflict, "handle_taken", "handle already exists")
			return
		}
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to create user")
		return
	}
	httpserver.JSON(w, http.StatusCreated, u)
}

func (h *Handler) getByID(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "user id must be a UUID")
		return
	}
	u, err := h.repo.GetByID(r.Context(), id)
	if errors.Is(err, ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "user not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load user")
		return
	}
	httpserver.JSON(w, http.StatusOK, u)
}

func (h *Handler) getByHandle(w http.ResponseWriter, r *http.Request) {
	handle := strings.TrimSpace(strings.ToLower(chi.URLParam(r, "handle")))
	u, err := h.repo.GetByHandle(r.Context(), handle)
	if errors.Is(err, ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "user not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load user")
		return
	}
	httpserver.JSON(w, http.StatusOK, u)
}

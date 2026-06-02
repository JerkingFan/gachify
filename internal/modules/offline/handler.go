package offline

import (
	"errors"
	"net/http"

	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.list)
	r.Post("/tracks/{trackID}", h.packageTrack)
	r.Delete("/tracks/{trackID}", h.remove)
	return r
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	ids, err := h.svc.ListDownloaded(r.Context(), uid)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to list offline tracks")
		return
	}
	strs := make([]string, len(ids))
	for i, id := range ids {
		strs[i] = id.String()
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"track_ids": strs, "limit": h.svc.MaxDownloadsPerUser()})
}

func (h *Handler) packageTrack(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	trackID, err := uuid.Parse(chi.URLParam(r, "trackID"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	pkg, err := h.svc.BuildPackage(r.Context(), uid, trackID)
	if errors.Is(err, ErrNotAllowed) {
		httpserver.Error(w, http.StatusForbidden, "not_liked", "like the track before downloading for offline")
		return
	}
	if errors.Is(err, ErrLimitReached) {
		httpserver.Error(w, http.StatusForbidden, "limit_reached", "offline download limit reached")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "unavailable", err.Error())
		return
	}
	httpserver.JSON(w, http.StatusOK, pkg)
}

func (h *Handler) remove(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	trackID, err := uuid.Parse(chi.URLParam(r, "trackID"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	if err := h.svc.Remove(r.Context(), uid, trackID); err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to remove offline track")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "removed"})
}

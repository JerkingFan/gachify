package creator

import (
	"encoding/json"
	"errors"
	"net/http"

	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (h *Handler) initCoverUpload(w http.ResponseWriter, r *http.Request) {
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
	var in domain.PresignUploadInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	out, err := h.svc.InitCoverUpload(r.Context(), uid, trackID, in)
	if errors.Is(err, ErrInvalidCoverFile) {
		httpserver.Error(w, http.StatusBadRequest, "invalid_file", "allowed: jpeg, png, webp")
		return
	}
	if errors.Is(err, catalog.ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "init_failed", err.Error())
		return
	}
	httpserver.JSON(w, http.StatusOK, out)
}

func (h *Handler) completeCoverUpload(w http.ResponseWriter, r *http.Request) {
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
	track, err := h.svc.CompleteCoverUpload(r.Context(), uid, trackID)
	if errors.Is(err, catalog.ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	if errors.Is(err, ErrObjectMissing) {
		httpserver.Error(w, http.StatusBadRequest, "upload_missing", "cover not found — upload to presigned URL first")
		return
	}
	if errors.Is(err, ErrCoverTooLarge) {
		httpserver.Error(w, http.StatusBadRequest, "file_too_large", "cover exceeds 5MB limit")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "complete_failed", "failed to save cover")
		return
	}
	httpserver.JSON(w, http.StatusOK, track)
}

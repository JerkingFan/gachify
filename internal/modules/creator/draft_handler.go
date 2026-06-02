package creator

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/gachify/gachify/internal/domain"
	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (h *Handler) createDraft(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	var in domain.CreateDraftInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	track, err := h.svc.CreateDraft(r.Context(), uid, in)
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	httpserver.JSON(w, http.StatusCreated, track)
}

func (h *Handler) updateDraft(w http.ResponseWriter, r *http.Request) {
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
	var in domain.UpdateDraftInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	track, err := h.svc.UpdateDraft(r.Context(), uid, trackID, in)
	if errors.Is(err, catalog.ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	if errors.Is(err, ErrInvalidState) {
		httpserver.Error(w, http.StatusConflict, "invalid_state", "only draft tracks can be edited")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	httpserver.JSON(w, http.StatusOK, track)
}

func (h *Handler) presignDraft(w http.ResponseWriter, r *http.Request) {
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
	out, err := h.svc.PresignDraftUpload(r.Context(), uid, trackID, in)
	if errors.Is(err, catalog.ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	if errors.Is(err, ErrInvalidState) {
		httpserver.Error(w, http.StatusConflict, "invalid_state", "track is not a draft")
		return
	}
	if errors.Is(err, ErrInvalidFile) {
		httpserver.Error(w, http.StatusBadRequest, "invalid_file", "allowed: flac, wav, mp3")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "presign_failed", err.Error())
		return
	}
	httpserver.JSON(w, http.StatusOK, out)
}

func (h *Handler) schedulePublish(w http.ResponseWriter, r *http.Request) {
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
	var in domain.SchedulePublishInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	if in.ScheduledPublishAt.IsZero() {
		httpserver.Error(w, http.StatusBadRequest, "invalid_input", "scheduled_publish_at required")
		return
	}
	track, err := h.svc.SchedulePublish(r.Context(), uid, trackID, in.ScheduledPublishAt)
	if errors.Is(err, catalog.ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found or not approved")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	httpserver.JSON(w, http.StatusOK, track)
}

func (h *Handler) publishNow(w http.ResponseWriter, r *http.Request) {
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
	track, err := h.svc.PublishNow(r.Context(), uid, trackID)
	if errors.Is(err, catalog.ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found or not approved")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "publish_failed", "failed to publish")
		return
	}
	if h.notify != nil {
		h.notify.NotifyPublished(r.Context(), uid, trackID, track.Title)
	}
	httpserver.JSON(w, http.StatusOK, track)
}

func (h *Handler) trackStats(w http.ResponseWriter, r *http.Request) {
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
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	stats, err := h.svc.TrackStats(r.Context(), uid, trackID, days)
	if errors.Is(err, catalog.ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load stats")
		return
	}
	httpserver.JSON(w, http.StatusOK, stats)
}

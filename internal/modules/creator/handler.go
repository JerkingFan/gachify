package creator

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gachify/gachify/internal/domain"
	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/gachify/gachify/internal/platform/ratelimit"
	"github.com/gachify/gachify/internal/platform/validate"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type PublishNotifier interface {
	NotifyPublished(ctx context.Context, creatorID, trackID uuid.UUID, title string)
}

type Handler struct {
	svc         *Service
	rl          *ratelimit.Limiter
	uploadLimit int
	notify      PublishNotifier
}

func NewHandler(svc *Service, rl *ratelimit.Limiter, uploadLimit int, notify PublishNotifier) *Handler {
	return &Handler{svc: svc, rl: rl, uploadLimit: uploadLimit, notify: notify}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/drafts", h.createDraft)
	r.Patch("/tracks/{trackID}/draft", h.updateDraft)
	r.Post("/tracks/{trackID}/presign", h.presignDraft)
	r.With(h.rl.Middleware("creator:upload_init", h.uploadLimit, time.Hour, ratelimit.ByUser)).Post("/uploads/init", h.initUpload)
	r.Post("/uploads/{trackID}/complete", h.completeUpload)
	r.Post("/uploads/{trackID}/retry", h.retryUpload)
	r.Get("/uploads/{trackID}/status", h.uploadStatus)
	r.Get("/tracks", h.listMyTracks)
	r.Get("/tracks/{trackID}/stats", h.trackStats)
	r.Patch("/tracks/{trackID}/lyrics", h.updateTrackLyrics)
	r.Post("/tracks/{trackID}/cover/init", h.initCoverUpload)
	r.Post("/tracks/{trackID}/cover/complete", h.completeCoverUpload)
	r.Patch("/tracks/{trackID}/schedule", h.schedulePublish)
	r.Post("/tracks/{trackID}/publish", h.publishNow)
	r.Get("/analytics", h.analytics)
	return r
}

func (h *Handler) initUpload(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	var in domain.UploadInitInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	if err := validate.UploadInit(in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	out, err := h.svc.InitUpload(r.Context(), uid, in)
	if errors.Is(err, ErrInvalidFile) {
		httpserver.Error(w, http.StatusBadRequest, "invalid_file", "allowed: flac, wav, mp3")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "init_failed", err.Error())
		return
	}
	httpserver.JSON(w, http.StatusCreated, out)
}

func (h *Handler) completeUpload(w http.ResponseWriter, r *http.Request) {
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
	var in domain.UploadCompleteInput
	_ = json.NewDecoder(r.Body).Decode(&in)

	track, err := h.svc.CompleteUpload(r.Context(), uid, trackID, in.DurationMs)
	if errors.Is(err, catalog.ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	if errors.Is(err, ErrInvalidState) {
		httpserver.Error(w, http.StatusConflict, "invalid_state", "track is not in draft state")
		return
	}
	if errors.Is(err, ErrObjectMissing) {
		httpserver.Error(w, http.StatusBadRequest, "upload_missing", "file not found — upload to presigned URL first")
		return
	}
	if errors.Is(err, ErrFileTooLarge) {
		httpserver.Error(w, http.StatusBadRequest, "file_too_large", "file exceeds 100MB limit")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "complete_failed", "failed to complete upload")
		return
	}
	httpserver.JSON(w, http.StatusOK, track)
}

func (h *Handler) retryUpload(w http.ResponseWriter, r *http.Request) {
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
	track, err := h.svc.RetryTranscode(r.Context(), uid, trackID)
	if errors.Is(err, catalog.ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	if errors.Is(err, ErrNotRetryable) {
		httpserver.Error(w, http.StatusConflict, "not_retryable", "track is not in a failed state")
		return
	}
	if errors.Is(err, ErrObjectMissing) {
		httpserver.Error(w, http.StatusBadRequest, "upload_missing", "master file not found in storage")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "retry_failed", "failed to retry transcode")
		return
	}
	httpserver.JSON(w, http.StatusAccepted, track)
}

func (h *Handler) uploadStatus(w http.ResponseWriter, r *http.Request) {
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
	track, err := h.svc.GetUploadStatus(r.Context(), uid, trackID)
	if errors.Is(err, catalog.ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to get status")
		return
	}
	httpserver.JSON(w, http.StatusOK, track)
}

func (h *Handler) listMyTracks(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 {
		limit = 50
	}
	tracks, err := h.svc.ListMyTracks(r.Context(), uid, limit, offset)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to list tracks")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"items": tracks})
}

func (h *Handler) updateTrackLyrics(w http.ResponseWriter, r *http.Request) {
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
	var in domain.UpdateTrackLyricsInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	track, err := h.svc.UpdateTrackLyrics(r.Context(), uid, trackID, in.LyricsLRC)
	if errors.Is(err, catalog.ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found or cannot edit lyrics")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to update lyrics")
		return
	}
	httpserver.JSON(w, http.StatusOK, track)
}

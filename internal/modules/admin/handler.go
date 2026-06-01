package admin

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/modules/streaming"
	"github.com/gachify/gachify/internal/modules/users"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/gachify/gachify/internal/platform/queue"
	streamtoken "github.com/gachify/gachify/internal/platform/streaming"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	catalog *catalog.Repository
	users   *users.Repository
	queue   *queue.RedisQueue
	stream  *streaming.Service
	signer  *streamtoken.TokenSigner
}

func NewHandler(cat *catalog.Repository, userRepo *users.Repository, q *queue.RedisQueue, stream *streaming.Service, signer *streamtoken.TokenSigner) *Handler {
	return &Handler{catalog: cat, users: userRepo, queue: q, stream: stream, signer: signer}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/tracks", h.listTracks)
	r.Get("/tracks/{id}", h.getTrack)
	r.Patch("/tracks/{id}", h.updateTrack)
	r.Get("/tracks/{id}/playback", h.previewPlayback)
	r.Get("/stream/playlist.m3u8", h.adminPlaylist)
	r.Get("/stream/hls.key", h.adminHLSKey)
	r.Post("/tracks/{id}/publish", h.publishTrack)
	r.Post("/tracks/{id}/approve", h.approveTrack)
	r.Post("/tracks/{id}/reject", h.rejectTrack)
	r.Get("/queue/dlq", h.listDLQ)
	r.Get("/queue/depths", h.queueDepths)
	r.Post("/queue/dlq/retry", h.retryDLQ)
	return r
}

func (h *Handler) listTracks(w http.ResponseWriter, r *http.Request) {
	status := domain.TrackStatus(r.URL.Query().Get("status"))
	if status == "" {
		status = domain.TrackPendingReview
	}
	st := status
	f := domain.ListTracksFilter{Status: &st, Limit: 50, Offset: 0}
	total, err := h.catalog.Count(r.Context(), f)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "count failed")
		return
	}
	tracks, err := h.catalog.List(r.Context(), f)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "list failed")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"items": tracks, "total": total})
}

func (h *Handler) approveTrack(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	track, err := h.catalog.GetByID(r.Context(), id)
	if errors.Is(err, catalog.ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	if track.Status != domain.TrackPendingReview {
		httpserver.Error(w, http.StatusConflict, "invalid_state", "track is not pending review")
		return
	}
	if err := h.catalog.UpdateStatus(r.Context(), id, domain.TrackPublished, nil); err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "approve failed")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "published"})
}

func (h *Handler) rejectTrack(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	reason := body.Reason
	if reason == "" {
		reason = "rejected by moderator"
	}
	if err := h.catalog.UpdateStatus(r.Context(), id, domain.TrackDraft, &reason); err != nil {
		if errors.Is(err, catalog.ErrNotFound) {
			httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
			return
		}
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "reject failed")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "rejected"})
}

func (h *Handler) listDLQ(w http.ResponseWriter, r *http.Request) {
	if h.queue == nil {
		httpserver.JSON(w, http.StatusOK, map[string]any{"items": []any{}})
		return
	}
	items, err := h.queue.ListDLQ(r.Context(), 50)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "dlq read failed")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) queueDepths(w http.ResponseWriter, r *http.Request) {
	if h.queue == nil {
		httpserver.JSON(w, http.StatusOK, map[string]any{
			"pending": 0, "processing": 0, "retry": 0, "dlq": 0,
		})
		return
	}
	depths, err := h.queue.Depths(r.Context())
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "queue depths failed")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{
		"pending":    depths.Pending,
		"processing": depths.Processing,
		"retry":      depths.Retry,
		"dlq":        depths.DLQ,
	})
}

func (h *Handler) retryDLQ(w http.ResponseWriter, r *http.Request) {
	if h.queue == nil {
		httpserver.Error(w, http.StatusServiceUnavailable, "unavailable", "queue not configured")
		return
	}
	var body struct {
		TrackID string `json:"track_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	trackID, err := uuid.Parse(body.TrackID)
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	job, err := h.queue.RetryDLQJob(r.Context(), trackID)
	if errors.Is(err, queue.ErrDLQNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "dlq entry not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "retry failed")
		return
	}
	if err := h.catalog.UpdateStatus(r.Context(), trackID, domain.TrackProcessing, nil); err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to mark processing")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{
		"status":   "requeued",
		"track_id": job.TrackID.String(),
		"job_id":   job.JobID.String(),
	})
}

package admin

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/modules/social"
	"github.com/gachify/gachify/internal/modules/streaming"
	"github.com/gachify/gachify/internal/modules/users"
	"github.com/gachify/gachify/internal/platform/cache"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/gachify/gachify/internal/platform/queue"
	"github.com/gachify/gachify/internal/platform/storage"
	"github.com/gachify/gachify/internal/platform/trackcover"
	streamtoken "github.com/gachify/gachify/internal/platform/streaming"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	catalog  *catalog.Repository
	users    *users.Repository
	queue    *queue.RedisQueue
	stream   *streaming.Service
	storage  *storage.Client
	signer   *streamtoken.TokenSigner
	notify   *social.PublishNotifier
	social   *social.Repository
	cache    *cache.Store
}

func NewHandler(cat *catalog.Repository, userRepo *users.Repository, q *queue.RedisQueue, stream *streaming.Service, st *storage.Client, signer *streamtoken.TokenSigner, notify *social.PublishNotifier, socialRepo *social.Repository, cacheStore *cache.Store) *Handler {
	return &Handler{catalog: cat, users: userRepo, queue: q, stream: stream, storage: st, signer: signer, notify: notify, social: socialRepo, cache: cacheStore}
}

func (h *Handler) invalidateTrackCache(ctx context.Context) {
	if h.cache != nil {
		_ = h.cache.InvalidateTracks(ctx)
	}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/tracks", h.listTracks)
	r.Get("/tracks/{id}", h.getTrack)
	r.Patch("/tracks/{id}", h.updateTrack)
	r.Get("/tracks/{id}/playback", h.previewPlayback)
	r.Get("/stream/playlist.m3u8", h.adminPlaylist)
	r.Get("/stream/hls.key", h.adminHLSKey)
	r.Get("/stream/segment", h.adminSegment)
	r.Get("/stream/audio", h.adminAudio)
	r.Post("/tracks/{id}/publish", h.publishTrack)
	r.Post("/tracks/{id}/approve", h.approveTrack)
	r.Post("/tracks/{id}/reject", h.rejectTrack)
	r.Get("/queue/dlq", h.listDLQ)
	r.Get("/queue/depths", h.queueDepths)
	r.Post("/queue/dlq/retry", h.retryDLQ)
	r.Get("/reports/tracks", h.listTrackReports)
	return r
}

func (h *Handler) listTrackReports(w http.ResponseWriter, r *http.Request) {
	if h.social == nil {
		httpserver.JSON(w, http.StatusOK, map[string]any{"items": []any{}})
		return
	}
	items, err := h.social.ListTrackReports(r.Context(), 50)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load reports")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"items": items})
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
	trackcover.EnrichWithCreatorSlice(r.Context(), h.storage, tracks)
	httpserver.JSON(w, http.StatusOK, map[string]any{"items": tracks, "total": total})
}

func (h *Handler) approveTrack(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	if err := h.catalog.AdminApprove(r.Context(), id); err != nil {
		if errors.Is(err, catalog.ErrNotFound) {
			httpserver.Error(w, http.StatusConflict, "invalid_state", "track is not pending review")
			return
		}
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "approve failed")
		return
	}
	h.invalidateTrackCache(r.Context())
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "approved"})
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

package social

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	repo    *Repository
	catalog *catalog.Repository
}

func NewHandler(repo *Repository, cat *catalog.Repository) *Handler {
	return &Handler{repo: repo, catalog: cat}
}

func (h *Handler) ListNotifications(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	items, err := h.repo.ListNotifications(r.Context(), uid, 40)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load notifications")
		return
	}
	unread, _ := h.repo.CountUnread(r.Context(), uid)
	httpserver.JSON(w, http.StatusOK, map[string]any{"items": items, "unread": unread})
}

func (h *Handler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	if err := h.repo.MarkAllRead(r.Context(), uid); err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to update notifications")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) GetReactions(w http.ResponseWriter, r *http.Request) {
	trackID, err := uuid.Parse(chi.URLParam(r, "trackID"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	var viewer *uuid.UUID
	if id, ok := platformauth.UserIDFromContext(r.Context()); ok {
		viewer = &id
	}
	summary, err := h.repo.GetReactions(r.Context(), trackID, viewer)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load reactions")
		return
	}
	httpserver.JSON(w, http.StatusOK, summary)
}

func (h *Handler) SetReaction(w http.ResponseWriter, r *http.Request) {
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
	var in domain.SetReactionInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	rx := strings.TrimSpace(strings.ToLower(in.Reaction))
	if rx != "power" && rx != "fire" && rx != "brotherhood" {
		httpserver.Error(w, http.StatusBadRequest, "invalid_reaction", "reaction must be power, fire, or brotherhood")
		return
	}
	if err := h.repo.SetReaction(r.Context(), uid, trackID, rx); err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to save reaction")
		return
	}
	summary, _ := h.repo.GetReactions(r.Context(), trackID, &uid)
	httpserver.JSON(w, http.StatusOK, summary)
}

func (h *Handler) ClearReaction(w http.ResponseWriter, r *http.Request) {
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
	_ = h.repo.ClearReaction(r.Context(), uid, trackID)
	summary, _ := h.repo.GetReactions(r.Context(), trackID, &uid)
	httpserver.JSON(w, http.StatusOK, summary)
}

func (h *Handler) ListComments(w http.ResponseWriter, r *http.Request) {
	trackID, err := uuid.Parse(chi.URLParam(r, "trackID"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	items, err := h.repo.ListComments(r.Context(), trackID, 50)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load comments")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) AddComment(w http.ResponseWriter, r *http.Request) {
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
	t, err := h.catalog.GetByID(r.Context(), trackID)
	if errors.Is(err, catalog.ErrNotFound) || t.Status != domain.TrackPublished {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	var in domain.AddCommentInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	body := strings.TrimSpace(in.Body)
	if body == "" || len(body) > 500 {
		httpserver.Error(w, http.StatusBadRequest, "invalid_body", "comment must be 1–500 characters")
		return
	}

	var parentID *uuid.UUID
	if in.ParentID != nil && *in.ParentID != uuid.Nil {
		parent, err := h.repo.GetComment(r.Context(), *in.ParentID)
		if err != nil {
			httpserver.Error(w, http.StatusBadRequest, "invalid_parent", "parent comment not found")
			return
		}
		if parent.TrackID != trackID {
			httpserver.Error(w, http.StatusBadRequest, "invalid_parent", "parent comment belongs to another track")
			return
		}
		if parent.ParentID != nil {
			httpserver.Error(w, http.StatusBadRequest, "invalid_parent", "only one reply level allowed")
			return
		}
		parentID = in.ParentID
	}

	c, err := h.repo.AddComment(r.Context(), uid, trackID, body, parentID)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to post comment")
		return
	}

	handle := c.Author.Handle
	if handle == "" {
		handle = "user"
	}
	if parentID != nil {
		if parent, err := h.repo.GetComment(r.Context(), *parentID); err == nil {
			_ = h.repo.NotifyCommentReply(r.Context(), parent.UserID, uid, trackID, t.Title, handle)
		}
	}
	_ = h.repo.NotifyMentions(r.Context(), uid, trackID, ParseMentionHandles(body), t.Title, handle)

	httpserver.JSON(w, http.StatusCreated, c)
}

func (h *Handler) ReportTrack(w http.ResponseWriter, r *http.Request) {
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
	t, err := h.catalog.GetByID(r.Context(), trackID)
	if errors.Is(err, catalog.ErrNotFound) || t.Status != domain.TrackPublished {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	if t.CreatorID == uid {
		httpserver.Error(w, http.StatusBadRequest, "invalid_report", "cannot report your own track")
		return
	}
	var in domain.ReportTrackInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	reason := strings.TrimSpace(strings.ToLower(in.Reason))
	switch reason {
	case "spam", "copyright", "offensive", "other":
	default:
		httpserver.Error(w, http.StatusBadRequest, "invalid_reason", "reason must be spam, copyright, offensive, or other")
		return
	}
	detail := strings.TrimSpace(in.Detail)
	if len(detail) > 500 {
		httpserver.Error(w, http.StatusBadRequest, "invalid_detail", "detail max 500 characters")
		return
	}
	if err := h.repo.AddTrackReport(r.Context(), uid, trackID, reason, detail); err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to submit report")
		return
	}
	httpserver.JSON(w, http.StatusCreated, map[string]string{"status": "reported"})
}

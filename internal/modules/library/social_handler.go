package library

import (
	"net/http"
	"strconv"

	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (h *Handler) feed(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 {
		limit = 20
	}
	following, err := h.repo.ListFollowingIDs(r.Context(), uid)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load follows")
		return
	}
	items, err := h.catalog.ListPublishedByCreators(r.Context(), following, limit, offset)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load feed")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{
		"items":    items,
		"limit":    limit,
		"offset":   offset,
		"has_more": len(items) >= limit,
	})
}

func (h *Handler) listFollowing(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	ids, err := h.repo.ListFollowingIDs(r.Context(), uid)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to list follows")
		return
	}
	out := map[string]any{"user_ids": []string{}}
	if len(ids) == 0 {
		httpserver.JSON(w, http.StatusOK, out)
		return
	}
	strs := make([]string, len(ids))
	for i, id := range ids {
		strs[i] = id.String()
	}
	out["user_ids"] = strs
	if h.users != nil {
		items, err := h.users.ListPublicSummaries(r.Context(), ids)
		if err != nil {
			httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load users")
			return
		}
		out["items"] = items
	}
	httpserver.JSON(w, http.StatusOK, out)
}

func (h *Handler) follow(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	target, err := uuid.Parse(chi.URLParam(r, "userID"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid user id")
		return
	}
	if target == uid {
		httpserver.Error(w, http.StatusBadRequest, "invalid_target", "cannot follow yourself")
		return
	}
	if err := h.repo.Follow(r.Context(), uid, target); err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "follow failed")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "following"})
}

func (h *Handler) unfollow(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	target, err := uuid.Parse(chi.URLParam(r, "userID"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid user id")
		return
	}
	if err := h.repo.Unfollow(r.Context(), uid, target); err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "unfollow failed")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "unfollowed"})
}

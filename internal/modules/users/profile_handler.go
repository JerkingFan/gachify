package users

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (h *Handler) publicProfile(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "user id must be a UUID")
		return
	}
	p, err := h.repo.GetPublicProfile(r.Context(), id)
	if errors.Is(err, ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "user not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load profile")
		return
	}
	httpserver.JSON(w, http.StatusOK, p)
}

func (h *Handler) publicPlaylists(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid user id")
		return
	}
	if _, err := h.repo.GetByID(r.Context(), id); errors.Is(err, ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "user not found")
		return
	}
	limit, offset := parseLimitOffset(r)
	list, err := h.lib.ListPublicPlaylistsByOwner(r.Context(), id, limit, offset)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to list playlists")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"items": list})
}

func (h *Handler) publicFollowing(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid user id")
		return
	}
	if _, err := h.repo.GetByID(r.Context(), id); errors.Is(err, ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "user not found")
		return
	}
	ids, err := h.lib.ListFollowingIDs(r.Context(), id)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to list following")
		return
	}
	items, err := h.repo.ListPublicSummaries(r.Context(), ids)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load users")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) publicLiked(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid user id")
		return
	}
	if _, err := h.repo.GetByID(r.Context(), id); errors.Is(err, ErrNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "user not found")
		return
	}
	public, err := h.lib.UserLikesArePublic(r.Context(), id)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to check profile")
		return
	}
	if !public {
		httpserver.Error(w, http.StatusForbidden, "private", "liked tracks are private")
		return
	}
	trackIDs, err := h.lib.ListLikedTrackIDs(r.Context(), id)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load likes")
		return
	}
	if len(trackIDs) == 0 {
		httpserver.JSON(w, http.StatusOK, map[string]any{"items": []any{}})
		return
	}
	tracks, err := h.cat.ListPublishedByIDs(r.Context(), trackIDs)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load tracks")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"items": tracks})
}

func parseLimitOffset(r *http.Request) (int, int) {
	limit := 20
	offset := 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 50 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}
	return limit, offset
}

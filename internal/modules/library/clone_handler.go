package library

import (
	"encoding/json"
	"net/http"

	"github.com/gachify/gachify/internal/domain"
	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/google/uuid"
)

func (h *Handler) clonePlaylist(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	var in domain.ClonePlaylistInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	if in.PlaylistID == uuid.Nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "playlist_id required")
		return
	}
	p, err := h.repo.ClonePlaylist(r.Context(), uid, in.PlaylistID)
	if err != nil {
		httpserver.Error(w, http.StatusNotFound, "not_found", "playlist not found or not accessible")
		return
	}
	httpserver.JSON(w, http.StatusCreated, p)
}

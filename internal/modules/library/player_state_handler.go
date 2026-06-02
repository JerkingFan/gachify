package library

import (
	"encoding/json"
	"net/http"

	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/google/uuid"
)

type playerStateInput struct {
	TrackIDs   []string `json:"track_ids"`
	QueueIndex int      `json:"queue_index"`
	ProgressMs int      `json:"progress_ms"`
}

func (h *Handler) getPlayerState(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	row, err := h.repo.GetPlayerState(r.Context(), uid)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load player state")
		return
	}
	strs := make([]string, len(row.TrackIDs))
	for i, id := range row.TrackIDs {
		strs[i] = id.String()
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{
		"track_ids":   strs,
		"queue_index": row.QueueIndex,
		"progress_ms": row.ProgressMs,
	})
}

func (h *Handler) putPlayerState(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	var in playerStateInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_body", "invalid JSON")
		return
	}
	if len(in.TrackIDs) > 100 {
		httpserver.Error(w, http.StatusBadRequest, "queue_too_long", "queue limited to 100 tracks")
		return
	}
	ids := make([]uuid.UUID, 0, len(in.TrackIDs))
	for _, s := range in.TrackIDs {
		id, err := uuid.Parse(s)
		if err != nil {
			continue
		}
		ids = append(ids, id)
	}
	idx := in.QueueIndex
	if idx < 0 {
		idx = 0
	}
	if idx >= len(ids) {
		idx = max(0, len(ids)-1)
	}
	progress := in.ProgressMs
	if progress < 0 {
		progress = 0
	}
	if err := h.repo.UpsertPlayerState(r.Context(), uid, ids, idx, progress); err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to save player state")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

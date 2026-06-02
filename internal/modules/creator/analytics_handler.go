package creator

import (
	"net/http"

	"github.com/gachify/gachify/internal/domain"
	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/platform/httpserver"
)

func (h *Handler) analytics(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	tracks, err := h.svc.ListMyTracks(r.Context(), uid, 200, 0)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load analytics")
		return
	}
	var totalPlays int64
	published := 0
	items := make([]map[string]any, 0, len(tracks))
	for _, t := range tracks {
		totalPlays += t.PlayCount
		if t.Status == domain.TrackPublished {
			published++
		}
		items = append(items, map[string]any{
			"id":          t.ID.String(),
			"title":       t.Title,
			"status":      t.Status,
			"play_count":  t.PlayCount,
			"duration_ms": t.DurationMs,
		})
	}
	followers, _ := h.svc.FollowerCount(r.Context(), uid)
	httpserver.JSON(w, http.StatusOK, map[string]any{
		"total_plays":       totalPlays,
		"published_tracks":  published,
		"total_tracks":      len(tracks),
		"follower_count":    followers,
		"items":             items,
	})
}

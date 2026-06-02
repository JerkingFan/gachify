package library

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gachify/gachify/internal/domain"
	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type exportTrack struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Artist     string `json:"artist"`
	DurationMs int    `json:"duration_ms"`
	URL        string `json:"url"`
	Position   int    `json:"position"`
}

func (h *Handler) exportPlaylist(w http.ResponseWriter, r *http.Request) {
	pid, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid playlist id")
		return
	}
	format := strings.ToLower(r.URL.Query().Get("format"))
	if format == "" {
		format = "json"
	}

	var title, description string
	var items []domain.PlaylistItem
	frontend := strings.TrimRight(h.frontend, "/")

	uid, authed := platformauth.UserIDFromContext(r.Context())
	if authed {
		pl, err := h.repo.GetPlaylist(r.Context(), uid, pid)
		if err != nil {
			httpserver.Error(w, http.StatusNotFound, "not_found", "playlist not found")
			return
		}
		title, description = pl.Title, pl.Description
		items, err = parseItems(pl.Items)
		if err != nil {
			httpserver.Error(w, http.StatusInternalServerError, "internal_error", "invalid playlist items")
			return
		}
	} else {
		pub, err := h.repo.GetPublicPlaylist(r.Context(), pid)
		if err != nil {
			httpserver.Error(w, http.StatusNotFound, "not_found", "playlist not found")
			return
		}
		title, description = pub.Title, pub.Description
		items, err = parseItems(pub.Items)
		if err != nil {
			httpserver.Error(w, http.StatusInternalServerError, "internal_error", "invalid playlist items")
			return
		}
	}

	creatorNames := map[uuid.UUID]string{}
	trackRows := make([]exportTrack, 0, len(items))
	for i, item := range items {
		t, err := h.catalog.GetByID(r.Context(), item.TrackID)
		if err != nil || t.Status != domain.TrackPublished {
			continue
		}
		artist, ok := creatorNames[t.CreatorID]
		if !ok {
			summaries, _ := h.users.ListPublicSummaries(r.Context(), []uuid.UUID{t.CreatorID})
			if len(summaries) > 0 {
				artist = summaries[0].DisplayName
				if artist == "" {
					artist = summaries[0].Handle
				}
			}
			creatorNames[t.CreatorID] = artist
		}
		trackRows = append(trackRows, exportTrack{
			ID:         t.ID.String(),
			Title:      t.Title,
			Artist:     artist,
			DurationMs: t.DurationMs,
			URL:        fmt.Sprintf("%s/track/%s", frontend, t.ID),
			Position:   i,
		})
	}

	switch format {
	case "m3u", "m3u8":
		w.Header().Set("Content-Type", "audio/x-mpegurl; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.m3u"`, sanitizeFilename(title)))
		var b strings.Builder
		b.WriteString("#EXTM3U\n")
		b.WriteString(fmt.Sprintf("#PLAYLIST:%s\n", title))
		for _, tr := range trackRows {
			sec := tr.DurationMs / 1000
			if sec <= 0 {
				sec = -1
			}
			label := tr.Title
			if tr.Artist != "" {
				label = tr.Artist + " — " + tr.Title
			}
			b.WriteString(fmt.Sprintf("#EXTINF:%d,%s\n", sec, label))
			b.WriteString(tr.URL + "\n")
		}
		_, _ = w.Write([]byte(b.String()))
	case "json":
		payload := map[string]any{
			"exported_at": time.Now().UTC().Format(time.RFC3339),
			"playlist": map[string]any{
				"title":       title,
				"description": description,
			},
			"tracks": trackRows,
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.json"`, sanitizeFilename(title)))
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		_ = enc.Encode(payload)
	default:
		httpserver.Error(w, http.StatusBadRequest, "invalid_format", "format must be m3u or json")
	}
}

func sanitizeFilename(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "playlist"
	}
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		} else if r == ' ' {
			b.WriteRune('_')
		}
	}
	out := b.String()
	if out == "" {
		return "playlist"
	}
	return out
}

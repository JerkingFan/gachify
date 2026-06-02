package share

import (
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/google/uuid"
)

var trackURLPatterns = []*regexp.Regexp{
	regexp.MustCompile(`/track/([0-9a-fA-F-]{36})`),
	regexp.MustCompile(`/share/track/([0-9a-fA-F-]{36})`),
	regexp.MustCompile(`/embed/track/([0-9a-fA-F-]{36})`),
}

func (h *Handler) oembed(w http.ResponseWriter, r *http.Request) {
	pageURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if pageURL == "" {
		httpserver.Error(w, http.StatusBadRequest, "invalid_url", "url query parameter required")
		return
	}
	trackID, err := parseTrackIDFromPageURL(pageURL)
	if err != nil {
		httpserver.Error(w, http.StatusNotFound, "not_found", "unsupported or invalid url")
		return
	}
	t, err := h.catalog.GetByID(r.Context(), trackID)
	if errors.Is(err, catalog.ErrNotFound) || t.Status != domain.TrackPublished {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "load failed")
		return
	}

	title := html.EscapeString(t.Title)
	canonical := h.frontend + "/track/" + t.ID.String()
	embedURL := h.frontend + "/embed/track/" + t.ID.String() + "?autoplay=1"
	thumb := h.siteURL + "/share/og/track/" + t.ID.String() + ".svg"
	iframe := fmt.Sprintf(
		`<iframe src="%s" width="460" height="152" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen loading="lazy" title="%s"></iframe>`,
		html.EscapeString(embedURL), title,
	)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"version":        "1.0",
		"type":           "rich",
		"provider_name":  "Gachify",
		"provider_url":   h.frontend + "/",
		"title":          t.Title,
		"author_name":    "Gachify",
		"author_url":     h.frontend + "/",
		"html":           iframe,
		"width":          460,
		"height":         152,
		"thumbnail_url":  thumb,
		"thumbnail_width":  1200,
		"thumbnail_height": 630,
		"cache_age":      3600,
		"referrer":       "no-referrer-when-downgrade",
		"_canonical_url": canonical,
	})
}

func parseTrackIDFromPageURL(raw string) (uuid.UUID, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return uuid.Nil, err
	}
	path := u.Path
	if path == "" {
		path = raw
	}
	for _, re := range trackURLPatterns {
		if m := re.FindStringSubmatch(path); len(m) == 2 {
			return uuid.Parse(m[1])
		}
	}
	return uuid.Nil, fmt.Errorf("no track id in url")
}

package share

import (
	"errors"
	"fmt"
	"html"
	"net/http"
	"strings"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/modules/library"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	catalog  *catalog.Repository
	library  *library.Repository
	siteURL  string
	frontend string
}

func NewHandler(cat *catalog.Repository, lib *library.Repository, siteURL, frontend string) *Handler {
	return &Handler{catalog: cat, library: lib, siteURL: stringsTrimRight(siteURL), frontend: stringsTrimRight(frontend)}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/track/{id}", h.track)
	r.Get("/playlist/{id}", h.playlist)
	return r
}

func (h *Handler) track(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	t, err := h.catalog.GetByID(r.Context(), id)
	if errors.Is(err, catalog.ErrNotFound) || t.Status != domain.TrackPublished {
		httpserver.Error(w, http.StatusNotFound, "not_found", "track not found")
		return
	}
	title := html.EscapeString(t.Title)
	desc := fmt.Sprintf("Listen to %s on Gachify", t.Title)
	url := h.frontend + "/track/" + t.ID.String()
	image := h.siteURL + "/favicon.svg"
	writeOG(w, title, desc, url, image, h.frontend+"/")
}

func (h *Handler) playlist(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid playlist id")
		return
	}
	p, err := h.library.GetPublicPlaylist(r.Context(), id)
	if err != nil {
		httpserver.Error(w, http.StatusNotFound, "not_found", "playlist not found")
		return
	}
	title := html.EscapeString(p.Title)
	desc := html.EscapeString(p.Description)
	if desc == "" {
		desc = "Playlist on Gachify"
	}
	url := h.frontend + "/playlist/" + p.ID.String()
	image := h.siteURL + "/favicon.svg"
	writeOG(w, title, desc, url, image, h.frontend+"/")
}

func writeOG(w http.ResponseWriter, title, desc, url, image, redirect string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<title>%s</title>
<meta property="og:title" content="%s"/>
<meta property="og:description" content="%s"/>
<meta property="og:url" content="%s"/>
<meta property="og:image" content="%s"/>
<meta property="og:type" content="music.song"/>
<meta http-equiv="refresh" content="0;url=%s"/>
</head><body><p><a href="%s">Continue to Gachify</a></p></body></html>`,
		title, title, desc, url, image, html.EscapeString(redirect), html.EscapeString(redirect))
}

func stringsTrimRight(s string) string {
	return strings.TrimRight(s, "/")
}

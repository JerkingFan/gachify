package share

import (
	"errors"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"strconv"
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
	r.Get("/oembed", h.oembed)
	r.Get("/og/track/{id}.svg", h.trackOGImage)
	r.Get("/track/{id}", h.track)
	r.Get("/playlist/{id}", h.playlist)
	r.Get("/tag/{slug}", h.tagLanding)
	r.Get("/mood/{slug}", h.tagLanding)
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
	desc := fmt.Sprintf("Listen to %s on Gachify — deep dark fantasy remix", t.Title)
	pageURL := h.frontend + "/track/" + t.ID.String()
	redirect := pageURL
	if tParam := r.URL.Query().Get("t"); tParam != "" {
		if sec, err := strconv.Atoi(tParam); err == nil && sec >= 0 {
			redirect = pageURL + "?t=" + url.QueryEscape(tParam)
			_ = sec
		}
	}
	shareURL := h.siteURL + "/share/track/" + t.ID.String()
	if tParam := r.URL.Query().Get("t"); tParam != "" {
		if _, err := strconv.Atoi(tParam); err == nil {
			shareURL += "?t=" + url.QueryEscape(tParam)
		}
	}
	image := h.siteURL + "/share/og/track/" + t.ID.String() + ".svg"
	oembedURL := h.siteURL + "/share/oembed?url=" + url.QueryEscape(pageURL) + "&format=json"
	writeOG(w, title, desc, shareURL, image, redirect, oembedURL)
}

func (h *Handler) tagLanding(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		httpserver.Error(w, http.StatusBadRequest, "invalid_tag", "tag required")
		return
	}
	label := strings.ReplaceAll(slug, "_", " ")
	title := html.EscapeString("♂️ " + strings.Title(label) + " remixes")
	desc := html.EscapeString("Discover " + label + " gachi remixes on Gachify — charts, filters, and deep dark fantasy.")
	pageURL := h.frontend + "/tag/" + slug
	if strings.HasPrefix(r.URL.Path, "/share/mood/") {
		pageURL = h.frontend + "/mood/" + slug
	}
	shareURL := h.siteURL + r.URL.Path
	image := h.siteURL + "/favicon.svg"
	writeOG(w, title, desc, shareURL, image, pageURL, "", "website")
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
	writeOG(w, title, desc, url, image, h.frontend+"/", "", "music.playlist")
}

func writeOG(w http.ResponseWriter, title, desc, url, image, redirect string, oembedURL string, ogType ...string) {
	kind := "music.song"
	if len(ogType) > 0 && ogType[0] != "" {
		kind = ogType[0]
	}
	oembedLink := ""
	if oembedURL != "" {
		oembedLink = fmt.Sprintf(`<link rel="alternate" type="application/json+oembed" href="%s" title="Gachify oEmbed"/>`, html.EscapeString(oembedURL))
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<title>%s</title>
<meta name="description" content="%s"/>
%s
<meta property="og:site_name" content="Gachify"/>
<meta property="og:title" content="%s"/>
<meta property="og:description" content="%s"/>
<meta property="og:url" content="%s"/>
<meta property="og:image" content="%s"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:type" content="%s"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="%s"/>
<meta name="twitter:description" content="%s"/>
<meta name="twitter:image" content="%s"/>
<meta http-equiv="refresh" content="0;url=%s"/>
</head><body><p><a href="%s">Continue to Gachify</a></p></body></html>`,
		title, desc, oembedLink, title, desc, url, image, kind, title, desc, image, html.EscapeString(redirect), html.EscapeString(redirect))
}

func stringsTrimRight(s string) string {
	return strings.TrimRight(s, "/")
}

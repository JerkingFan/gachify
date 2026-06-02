package library

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/imports"
	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/google/uuid"
)

func (h *Handler) importCapabilities(w http.ResponseWriter, r *http.Request) {
	if h.imports == nil {
		httpserver.JSON(w, http.StatusOK, imports.Capabilities{PasteLines: true})
		return
	}
	httpserver.JSON(w, http.StatusOK, h.imports.Capabilities())
}

func (h *Handler) previewPlaylistImport(w http.ResponseWriter, r *http.Request) {
	if _, ok := platformauth.UserIDFromContext(r.Context()); !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	if h.imports == nil {
		httpserver.Error(w, http.StatusServiceUnavailable, "unavailable", "import service not configured")
		return
	}
	var body struct {
		URL         string `json:"url"`
		Lines       string `json:"lines"`
		TitleHint   string `json:"title_hint"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	var (
		out imports.PreviewResult
		err error
	)
	if strings.TrimSpace(body.Lines) != "" {
		out, err = h.imports.PreviewLines(r.Context(), body.Lines, body.TitleHint)
	} else if strings.TrimSpace(body.URL) != "" {
		out, err = h.imports.PreviewURL(r.Context(), body.URL)
	} else {
		httpserver.Error(w, http.StatusBadRequest, "invalid_input", "url or lines required")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "preview_failed", err.Error())
		return
	}
	httpserver.JSON(w, http.StatusOK, out)
}

func (h *Handler) confirmPlaylistImport(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	var body struct {
		Title       string   `json:"title"`
		Description string   `json:"description"`
		TrackIDs    []string `json:"track_ids"`
		IsPublic    bool     `json:"is_public"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		httpserver.Error(w, http.StatusBadRequest, "invalid_input", "title is required")
		return
	}
	if len(body.TrackIDs) == 0 {
		httpserver.Error(w, http.StatusBadRequest, "invalid_input", "at least one track required")
		return
	}
	if len(body.TrackIDs) > 500 {
		httpserver.Error(w, http.StatusBadRequest, "invalid_input", "maximum 500 tracks per import")
		return
	}
	pl, err := h.repo.CreatePlaylist(r.Context(), uid, domain.CreatePlaylistInput{
		Title:       title,
		Description: body.Description,
		IsPublic:    body.IsPublic,
	})
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to create playlist")
		return
	}
	ids := make([]uuid.UUID, 0, len(body.TrackIDs))
	for _, s := range body.TrackIDs {
		id, err := uuid.Parse(s)
		if err != nil {
			continue
		}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		httpserver.Error(w, http.StatusBadRequest, "invalid_input", "no valid track ids")
		return
	}
	updated, err := h.repo.SetPlaylistItems(r.Context(), uid, pl.ID, ids)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to add tracks")
		return
	}
	httpserver.JSON(w, http.StatusCreated, updated)
}

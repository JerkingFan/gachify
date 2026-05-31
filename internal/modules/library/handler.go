package library

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gachify/gachify/internal/domain"
	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/gachify/gachify/internal/platform/recent"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	repo   *Repository
	recent *recent.Store
}

func NewHandler(repo *Repository, recentStore *recent.Store) *Handler {
	return &Handler{repo: repo, recent: recentStore}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/liked", h.listLiked)
	r.Put("/liked/{trackID}", h.addLiked)
	r.Delete("/liked/{trackID}", h.removeLiked)
	r.Get("/playlists", h.listPlaylists)
	r.Post("/playlists", h.createPlaylist)
	r.Get("/playlists/{id}", h.getPlaylist)
	r.Patch("/playlists/{id}", h.updatePlaylist)
	r.Delete("/playlists/{id}", h.deletePlaylist)
	r.Post("/playlists/{id}/tracks", h.addTracks)
	r.Post("/library/import", h.importLibrary)
	r.Get("/recent", h.listRecent)
	r.Post("/recent", h.addRecent)
	return r
}

func (h *Handler) listLiked(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	ids, err := h.repo.ListLikedTrackIDs(r.Context(), uid)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load liked tracks")
		return
	}
	strs := make([]string, len(ids))
	for i, id := range ids {
		strs[i] = id.String()
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"track_ids": strs})
}

func (h *Handler) addLiked(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	tid, err := uuid.Parse(chi.URLParam(r, "trackID"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	if err := h.repo.AddLiked(r.Context(), uid, tid); err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to like track")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "liked"})
}

func (h *Handler) removeLiked(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	tid, err := uuid.Parse(chi.URLParam(r, "trackID"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	_ = h.repo.RemoveLiked(r.Context(), uid, tid)
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "unliked"})
}

func (h *Handler) listPlaylists(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	list, err := h.repo.ListPlaylists(r.Context(), uid)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load playlists")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"items": list})
}

func (h *Handler) createPlaylist(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	var in domain.CreatePlaylistInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	if in.Title == "" {
		httpserver.Error(w, http.StatusBadRequest, "invalid_title", "title required")
		return
	}
	p, err := h.repo.CreatePlaylist(r.Context(), uid, in)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to create playlist")
		return
	}
	httpserver.JSON(w, http.StatusCreated, p)
}

func (h *Handler) getPlaylist(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	pid, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid playlist id")
		return
	}
	p, err := h.repo.GetPlaylist(r.Context(), uid, pid)
	if errors.Is(err, ErrPlaylistNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "playlist not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load playlist")
		return
	}
	httpserver.JSON(w, http.StatusOK, p)
}

func (h *Handler) updatePlaylist(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	pid, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid playlist id")
		return
	}
	var in domain.UpdatePlaylistInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	p, err := h.repo.UpdatePlaylist(r.Context(), uid, pid, in)
	if errors.Is(err, ErrPlaylistNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "playlist not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to update playlist")
		return
	}
	httpserver.JSON(w, http.StatusOK, p)
}

func (h *Handler) deletePlaylist(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	pid, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid playlist id")
		return
	}
	if err := h.repo.DeletePlaylist(r.Context(), uid, pid); errors.Is(err, ErrPlaylistNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "playlist not found")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) addTracks(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	pid, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid playlist id")
		return
	}
	var in domain.AddPlaylistTracksInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	p, err := h.repo.AddTracksToPlaylist(r.Context(), uid, pid, in.TrackIDs)
	if errors.Is(err, ErrPlaylistNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "playlist not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to add tracks")
		return
	}
	httpserver.JSON(w, http.StatusOK, p)
}

func (h *Handler) importLibrary(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	var in domain.LibraryImportInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	if err := h.repo.ImportLibrary(r.Context(), uid, in); err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "import failed")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "imported"})
}

func (h *Handler) listRecent(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	if h.recent == nil {
		httpserver.JSON(w, http.StatusOK, map[string]any{"track_ids": []string{}})
		return
	}
	ids, err := h.recent.List(r.Context(), uid, 50)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to load recent tracks")
		return
	}
	strs := make([]string, len(ids))
	for i, id := range ids {
		strs[i] = id.String()
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{"track_ids": strs})
}

func (h *Handler) addRecent(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	var in struct {
		TrackID string `json:"track_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	tid, err := uuid.Parse(in.TrackID)
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	if h.recent != nil {
		if err := h.recent.Add(r.Context(), uid, tid); err != nil {
			httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to record play")
			return
		}
	}
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

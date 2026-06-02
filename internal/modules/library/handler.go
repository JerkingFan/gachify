package library

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/modules/imports"
	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/gachify/gachify/internal/platform/recent"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	repo     *Repository
	catalog  *catalog.Repository
	recent   *recent.Store
	users    PublicUserLister
	imports  *imports.Service
	frontend string
}

func NewHandler(repo *Repository, cat *catalog.Repository, recentStore *recent.Store, users PublicUserLister, importSvc *imports.Service, frontendURL string) *Handler {
	return &Handler{repo: repo, catalog: cat, recent: recentStore, users: users, imports: importSvc, frontend: frontendURL}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/liked", h.listLiked)
	r.Put("/liked/{trackID}", h.addLiked)
	r.Delete("/liked/{trackID}", h.removeLiked)
	r.Post("/playlists/join", h.joinPlaylist)
	r.Post("/playlists/{id}/collaborate", h.enableCollaborative)
	r.Delete("/playlists/{id}/collaborators/me", h.leaveCollaboration)
	r.Get("/playlists", h.listPlaylists)
	r.Post("/playlists", h.createPlaylist)
	r.Get("/playlists/{id}/export", h.exportPlaylist)
	r.Get("/playlists/{id}", h.getPlaylist)
	r.Patch("/playlists/{id}", h.updatePlaylist)
	r.Delete("/playlists/{id}", h.deletePlaylist)
	r.Post("/playlists/{id}/tracks", h.addTracks)
	r.Put("/playlists/{id}/tracks", h.setTracks)
	r.Delete("/playlists/{id}/tracks/{trackID}", h.removeTrack)
	r.Post("/playlists/import/preview", h.previewPlaylistImport)
	r.Post("/playlists/import/confirm", h.confirmPlaylistImport)
	r.Get("/playlists/import/capabilities", h.importCapabilities)
	r.Post("/playlists/clone", h.clonePlaylist)
	r.Post("/library/import", h.importLibrary)
	r.Get("/recent", h.listRecent)
	r.Post("/recent", h.addRecent)
	r.Get("/feed", h.feed)
	r.Get("/following", h.listFollowing)
	r.Put("/following/{userID}", h.follow)
	r.Delete("/following/{userID}", h.unfollow)
	r.Get("/for-you", h.forYou)
	r.Get("/filter-presets", h.listFilterPresets)
	r.Post("/filter-presets", h.createFilterPreset)
	r.Delete("/filter-presets/{id}", h.deleteFilterPreset)
	r.Get("/player/state", h.getPlayerState)
	r.Put("/player/state", h.putPlayerState)
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

func (h *Handler) joinPlaylist(w http.ResponseWriter, r *http.Request) {
	uid, ok := platformauth.UserIDFromContext(r.Context())
	if !ok {
		httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	var in domain.JoinPlaylistInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.InviteToken == "" {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invite_token required")
		return
	}
	p, err := h.repo.JoinPlaylistByInvite(r.Context(), uid, in.InviteToken)
	if errors.Is(err, ErrPlaylistNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "invalid or expired invite")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to join playlist")
		return
	}
	httpserver.JSON(w, http.StatusOK, p)
}

func (h *Handler) enableCollaborative(w http.ResponseWriter, r *http.Request) {
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
	p, err := h.repo.EnableCollaborative(r.Context(), uid, pid)
	if errors.Is(err, ErrPlaylistNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "playlist not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to enable collaboration")
		return
	}
	httpserver.JSON(w, http.StatusOK, p)
}

func (h *Handler) leaveCollaboration(w http.ResponseWriter, r *http.Request) {
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
	if err := h.repo.LeaveCollaboration(r.Context(), uid, pid); errors.Is(err, ErrPlaylistNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "not a collaborator on this playlist")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to leave playlist")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]string{"status": "left"})
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

func (h *Handler) removeTrack(w http.ResponseWriter, r *http.Request) {
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
	tid, err := uuid.Parse(chi.URLParam(r, "trackID"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid track id")
		return
	}
	p, err := h.repo.RemoveTrackFromPlaylist(r.Context(), uid, pid, tid)
	if errors.Is(err, ErrPlaylistNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "playlist not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to remove track")
		return
	}
	httpserver.JSON(w, http.StatusOK, p)
}

func (h *Handler) setTracks(w http.ResponseWriter, r *http.Request) {
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
	var in domain.SetPlaylistItemsInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_json", "invalid body")
		return
	}
	p, err := h.repo.SetPlaylistItems(r.Context(), uid, pid, in.TrackIDs)
	if errors.Is(err, ErrPlaylistNotFound) {
		httpserver.Error(w, http.StatusNotFound, "not_found", "playlist not found")
		return
	}
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to update tracks")
		return
	}
	httpserver.JSON(w, http.StatusOK, p)
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

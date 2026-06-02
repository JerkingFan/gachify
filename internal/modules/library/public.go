package library

import (
	"context"
	"net/http"
	"strconv"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (h *Handler) PublicRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.listPublicPlaylists)
	r.Get("/{id}/export", h.exportPlaylist)
	r.Get("/{id}", h.getPublicPlaylist)
	return r
}

func (h *Handler) listPublicPlaylists(w http.ResponseWriter, r *http.Request) {
	limit := 20
	offset := 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 50 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}
	list, total, err := h.repo.ListPublicPlaylists(r.Context(), limit, offset)
	if err != nil {
		httpserver.Error(w, http.StatusInternalServerError, "internal_error", "failed to list playlists")
		return
	}
	httpserver.JSON(w, http.StatusOK, map[string]any{
		"items":    list,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
		"has_more": offset+len(list) < total,
	})
}

func (h *Handler) getPublicPlaylist(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpserver.Error(w, http.StatusBadRequest, "invalid_id", "invalid playlist id")
		return
	}
	p, err := h.repo.GetPublicPlaylist(r.Context(), id)
	if err != nil {
		httpserver.Error(w, http.StatusNotFound, "not_found", "public playlist not found")
		return
	}
	httpserver.JSON(w, http.StatusOK, p)
}

func (r *Repository) ListPublicPlaylists(ctx context.Context, limit, offset int) ([]domain.PublicPlaylist, int, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}
	var total int
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM playlists WHERE is_public = true`).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.pool.Query(ctx, `
		SELECT p.id, p.owner_id, p.title, p.description, p.is_public, p.items, p.created_at, p.updated_at,
			u.handle, u.display_name
		FROM playlists p
		JOIN users u ON u.id = p.owner_id
		WHERE p.is_public = true
		ORDER BY p.created_at DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []domain.PublicPlaylist
	for rows.Next() {
		item, err := scanPublicPlaylist(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, item)
	}
	if out == nil {
		out = []domain.PublicPlaylist{}
	}
	return out, total, rows.Err()
}

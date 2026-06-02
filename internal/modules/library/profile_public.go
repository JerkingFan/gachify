package library

import (
	"context"

	"github.com/gachify/gachify/internal/domain"
	"github.com/google/uuid"
)

func (r *Repository) ListPublicPlaylistsByOwner(ctx context.Context, ownerID uuid.UUID, limit, offset int) ([]domain.PublicPlaylist, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT p.id, p.owner_id, p.title, p.description, p.is_public, p.items, p.created_at, p.updated_at,
			u.handle, u.display_name
		FROM playlists p
		JOIN users u ON u.id = p.owner_id
		WHERE p.owner_id = $1 AND p.is_public = true
		ORDER BY p.created_at DESC
		LIMIT $2 OFFSET $3
	`, ownerID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.PublicPlaylist
	for rows.Next() {
		item, err := scanPublicPlaylist(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	if out == nil {
		out = []domain.PublicPlaylist{}
	}
	return out, rows.Err()
}

func (r *Repository) UserLikesArePublic(ctx context.Context, userID uuid.UUID) (bool, error) {
	var public bool
	err := r.pool.QueryRow(ctx, `SELECT liked_tracks_public FROM users WHERE id = $1`, userID).Scan(&public)
	return public, err
}

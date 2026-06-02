package library

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/gachify/gachify/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (r *Repository) GetPublicPlaylist(ctx context.Context, playlistID uuid.UUID) (domain.PublicPlaylist, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT p.id, p.owner_id, p.title, p.description, p.is_public, p.items, p.created_at, p.updated_at,
			u.handle, u.display_name
		FROM playlists p
		JOIN users u ON u.id = p.owner_id
		WHERE p.id = $1 AND p.is_public = true
	`, playlistID)
	p, err := scanPublicPlaylistRow(row)
	if err == pgx.ErrNoRows {
		return domain.PublicPlaylist{}, ErrPlaylistNotFound
	}
	return p, err
}

func scanPublicPlaylist(rows interface {
	Scan(dest ...any) error
}) (domain.PublicPlaylist, error) {
	var p domain.PublicPlaylist
	err := rows.Scan(
		&p.ID, &p.OwnerID, &p.Title, &p.Description, &p.IsPublic, &p.Items,
		&p.CreatedAt, &p.UpdatedAt, &p.OwnerHandle, &p.OwnerDisplayName,
	)
	return p, err
}

func scanPublicPlaylistRow(row interface {
	Scan(dest ...any) error
}) (domain.PublicPlaylist, error) {
	return scanPublicPlaylist(row)
}

func (r *Repository) RemoveTrackFromPlaylist(ctx context.Context, userID, playlistID, trackID uuid.UUID) (domain.Playlist, error) {
	acc, err := r.resolvePlaylistAccess(ctx, userID, playlistID)
	if err != nil || !acc.canEdit {
		return domain.Playlist{}, ErrPlaylistNotFound
	}
	p := acc.playlist
	items, err := parseItems(p.Items)
	if err != nil {
		return domain.Playlist{}, err
	}
	filtered := make([]domain.PlaylistItem, 0, len(items))
	for _, it := range items {
		if it.TrackID != trackID {
			filtered = append(filtered, it)
		}
	}
	return r.savePlaylistItems(ctx, userID, playlistID, filtered)
}

func (r *Repository) SetPlaylistItems(ctx context.Context, userID, playlistID uuid.UUID, trackIDs []uuid.UUID) (domain.Playlist, error) {
	acc, err := r.resolvePlaylistAccess(ctx, userID, playlistID)
	if err != nil || !acc.canEdit {
		return domain.Playlist{}, ErrPlaylistNotFound
	}
	now := time.Now()
	items := make([]domain.PlaylistItem, 0, len(trackIDs))
	for i, tid := range trackIDs {
		items = append(items, domain.PlaylistItem{
			TrackID: tid, Position: i, AddedAt: now,
		})
	}
	return r.savePlaylistItems(ctx, userID, playlistID, items)
}

func (r *Repository) savePlaylistItems(ctx context.Context, userID, playlistID uuid.UUID, items []domain.PlaylistItem) (domain.Playlist, error) {
	acc, err := r.resolvePlaylistAccess(ctx, userID, playlistID)
	if err != nil {
		return domain.Playlist{}, err
	}
	if !acc.canEdit {
		return domain.Playlist{}, ErrPlaylistNotFound
	}
	for i := range items {
		items[i].Position = i
	}
	raw, err := json.Marshal(items)
	if err != nil {
		return domain.Playlist{}, fmt.Errorf("marshal items: %w", err)
	}
	_, err = r.pool.Exec(ctx, `
		UPDATE playlists SET items = $2, updated_at = now() WHERE id = $1
	`, playlistID, raw)
	if err != nil {
		return domain.Playlist{}, err
	}
	return r.GetPlaylist(ctx, userID, playlistID)
}

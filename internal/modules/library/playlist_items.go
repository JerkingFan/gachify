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

func (r *Repository) GetPublicPlaylist(ctx context.Context, playlistID uuid.UUID) (domain.Playlist, error) {
	var p domain.Playlist
	err := r.pool.QueryRow(ctx, `
		SELECT id, owner_id, title, description, is_public, items, created_at, updated_at
		FROM playlists WHERE id = $1 AND is_public = true
	`, playlistID).Scan(
		&p.ID, &p.OwnerID, &p.Title, &p.Description, &p.IsPublic, &p.Items,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return domain.Playlist{}, ErrPlaylistNotFound
	}
	return p, err
}

func (r *Repository) RemoveTrackFromPlaylist(ctx context.Context, userID, playlistID, trackID uuid.UUID) (domain.Playlist, error) {
	p, err := r.GetPlaylist(ctx, userID, playlistID)
	if err != nil {
		return domain.Playlist{}, err
	}
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
	if _, err := r.GetPlaylist(ctx, userID, playlistID); err != nil {
		return domain.Playlist{}, err
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
	for i := range items {
		items[i].Position = i
	}
	raw, err := json.Marshal(items)
	if err != nil {
		return domain.Playlist{}, fmt.Errorf("marshal items: %w", err)
	}
	var p domain.Playlist
	err = r.pool.QueryRow(ctx, `
		UPDATE playlists SET items = $3, updated_at = now()
		WHERE id = $1 AND owner_id = $2
		RETURNING id, owner_id, title, description, is_public, items, created_at, updated_at
	`, playlistID, userID, raw).Scan(
		&p.ID, &p.OwnerID, &p.Title, &p.Description, &p.IsPublic, &p.Items,
		&p.CreatedAt, &p.UpdatedAt,
	)
	return p, err
}

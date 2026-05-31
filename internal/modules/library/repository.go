package library

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/gachify/gachify/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrPlaylistNotFound = errors.New("playlist not found")

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) ListLikedTrackIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT track_id FROM liked_tracks
		WHERE user_id = $1 ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if ids == nil {
		ids = []uuid.UUID{}
	}
	return ids, rows.Err()
}

func (r *Repository) AddLiked(ctx context.Context, userID, trackID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO liked_tracks (user_id, track_id) VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, userID, trackID)
	return err
}

func (r *Repository) RemoveLiked(ctx context.Context, userID, trackID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM liked_tracks WHERE user_id = $1 AND track_id = $2
	`, userID, trackID)
	return err
}

func (r *Repository) IsLiked(ctx context.Context, userID, trackID uuid.UUID) (bool, error) {
	var n int
	err := r.pool.QueryRow(ctx, `
		SELECT 1 FROM liked_tracks WHERE user_id = $1 AND track_id = $2
	`, userID, trackID).Scan(&n)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return n == 1, err
}

func (r *Repository) ListPlaylists(ctx context.Context, userID uuid.UUID) ([]domain.Playlist, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, owner_id, title, description, is_public, items, created_at, updated_at
		FROM playlists WHERE owner_id = $1 ORDER BY created_at ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanPlaylists(rows)
}

func (r *Repository) GetPlaylist(ctx context.Context, userID, playlistID uuid.UUID) (domain.Playlist, error) {
	var p domain.Playlist
	err := r.pool.QueryRow(ctx, `
		SELECT id, owner_id, title, description, is_public, items, created_at, updated_at
		FROM playlists WHERE id = $1 AND owner_id = $2
	`, playlistID, userID).Scan(
		&p.ID, &p.OwnerID, &p.Title, &p.Description, &p.IsPublic, &p.Items,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Playlist{}, ErrPlaylistNotFound
	}
	return p, err
}

func (r *Repository) CreatePlaylist(ctx context.Context, userID uuid.UUID, in domain.CreatePlaylistInput) (domain.Playlist, error) {
	items := json.RawMessage(`[]`)
	const q = `
		INSERT INTO playlists (owner_id, title, description, is_public, items)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, owner_id, title, description, is_public, items, created_at, updated_at
	`
	var p domain.Playlist
	err := r.pool.QueryRow(ctx, q, userID, in.Title, in.Description, in.IsPublic, items).Scan(
		&p.ID, &p.OwnerID, &p.Title, &p.Description, &p.IsPublic, &p.Items,
		&p.CreatedAt, &p.UpdatedAt,
	)
	return p, err
}

func (r *Repository) UpdatePlaylist(ctx context.Context, userID, playlistID uuid.UUID, in domain.UpdatePlaylistInput) (domain.Playlist, error) {
	p, err := r.GetPlaylist(ctx, userID, playlistID)
	if err != nil {
		return domain.Playlist{}, err
	}
	if in.Title != nil {
		p.Title = *in.Title
	}
	if in.Description != nil {
		p.Description = *in.Description
	}
	if in.IsPublic != nil {
		p.IsPublic = *in.IsPublic
	}
	err = r.pool.QueryRow(ctx, `
		UPDATE playlists SET title = $3, description = $4, is_public = $5
		WHERE id = $1 AND owner_id = $2
		RETURNING id, owner_id, title, description, is_public, items, created_at, updated_at
	`, playlistID, userID, p.Title, p.Description, p.IsPublic).Scan(
		&p.ID, &p.OwnerID, &p.Title, &p.Description, &p.IsPublic, &p.Items,
		&p.CreatedAt, &p.UpdatedAt,
	)
	return p, err
}

func (r *Repository) DeletePlaylist(ctx context.Context, userID, playlistID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM playlists WHERE id = $1 AND owner_id = $2`, playlistID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrPlaylistNotFound
	}
	return nil
}

func (r *Repository) AddTracksToPlaylist(ctx context.Context, userID, playlistID uuid.UUID, trackIDs []uuid.UUID) (domain.Playlist, error) {
	p, err := r.GetPlaylist(ctx, userID, playlistID)
	if err != nil {
		return domain.Playlist{}, err
	}
	items, err := parseItems(p.Items)
	if err != nil {
		return domain.Playlist{}, err
	}
	existing := map[uuid.UUID]bool{}
	for _, it := range items {
		existing[it.TrackID] = true
	}
	pos := len(items)
	now := time.Now()
	for _, tid := range trackIDs {
		if existing[tid] {
			continue
		}
		items = append(items, domain.PlaylistItem{
			TrackID:  tid,
			Position: pos,
			AddedAt:  now,
		})
		pos++
	}
	raw, err := json.Marshal(items)
	if err != nil {
		return domain.Playlist{}, err
	}
	err = r.pool.QueryRow(ctx, `
		UPDATE playlists SET items = $3 WHERE id = $1 AND owner_id = $2
		RETURNING id, owner_id, title, description, is_public, items, created_at, updated_at
	`, playlistID, userID, raw).Scan(
		&p.ID, &p.OwnerID, &p.Title, &p.Description, &p.IsPublic, &p.Items,
		&p.CreatedAt, &p.UpdatedAt,
	)
	return p, err
}

func (r *Repository) ImportLibrary(ctx context.Context, userID uuid.UUID, in domain.LibraryImportInput) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, tidStr := range in.LikedTrackIDs {
		tid, err := uuid.Parse(tidStr)
		if err != nil {
			continue
		}
		_, _ = tx.Exec(ctx, `
			INSERT INTO liked_tracks (user_id, track_id) VALUES ($1, $2) ON CONFLICT DO NOTHING
		`, userID, tid)
	}

	for _, pl := range in.Playlists {
		if pl.Name == "" {
			continue
		}
		var playlistID uuid.UUID
		err := tx.QueryRow(ctx, `
			INSERT INTO playlists (owner_id, title, description, items)
			VALUES ($1, $2, $3, '[]') RETURNING id
		`, userID, pl.Name, pl.Description).Scan(&playlistID)
		if err != nil {
			continue
		}
		var ids []uuid.UUID
		for _, s := range pl.TrackIDs {
			id, err := uuid.Parse(s)
			if err == nil {
				ids = append(ids, id)
			}
		}
		if len(ids) > 0 {
			items := make([]domain.PlaylistItem, 0, len(ids))
			now := time.Now()
			for i, id := range ids {
				items = append(items, domain.PlaylistItem{
					TrackID: id, Position: i, AddedAt: now,
				})
			}
			raw, _ := json.Marshal(items)
			_, _ = tx.Exec(ctx, `UPDATE playlists SET items = $2 WHERE id = $1`, playlistID, raw)
		}
	}

	return tx.Commit(ctx)
}

func parseItems(raw json.RawMessage) ([]domain.PlaylistItem, error) {
	if len(raw) == 0 || string(raw) == "[]" {
		return []domain.PlaylistItem{}, nil
	}
	var items []domain.PlaylistItem
	if err := json.Unmarshal(raw, &items); err != nil {
		return nil, fmt.Errorf("parse playlist items: %w", err)
	}
	return items, nil
}

func scanPlaylists(rows pgx.Rows) ([]domain.Playlist, error) {
	var list []domain.Playlist
	for rows.Next() {
		var p domain.Playlist
		if err := rows.Scan(
			&p.ID, &p.OwnerID, &p.Title, &p.Description, &p.IsPublic, &p.Items,
			&p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	if list == nil {
		list = []domain.Playlist{}
	}
	return list, rows.Err()
}

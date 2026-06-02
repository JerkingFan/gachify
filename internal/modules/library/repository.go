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
		SELECT `+playlistSelectCols+`,
			(p.owner_id = $1) AS is_owner,
			true AS can_edit
		FROM playlists p
		WHERE p.owner_id = $1
		UNION
		SELECT `+playlistSelectCols+`,
			false AS is_owner,
			true AS can_edit
		FROM playlists p
		INNER JOIN playlist_collaborators c ON c.playlist_id = p.id AND c.user_id = $1
		WHERE p.owner_id <> $1
		ORDER BY updated_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanPlaylistsWithAccess(rows)
}

func scanPlaylistsWithAccess(rows pgx.Rows) ([]domain.Playlist, error) {
	var list []domain.Playlist
	for rows.Next() {
		var p domain.Playlist
		var inviteToken *string
		if err := rows.Scan(
			&p.ID, &p.OwnerID, &p.Title, &p.Description, &p.IsPublic, &p.IsCollaborative, &inviteToken,
			&p.Items, &p.CreatedAt, &p.UpdatedAt,
			&p.IsOwner, &p.CanEdit,
		); err != nil {
			return nil, err
		}
		if inviteToken != nil && p.IsOwner {
			p.InviteToken = *inviteToken
		}
		list = append(list, p)
	}
	if list == nil {
		list = []domain.Playlist{}
	}
	return list, rows.Err()
}

func (r *Repository) CreatePlaylist(ctx context.Context, userID uuid.UUID, in domain.CreatePlaylistInput) (domain.Playlist, error) {
	items := json.RawMessage(`[]`)
	var inviteToken *string
	if in.IsCollaborative {
		t, err := newInviteToken()
		if err != nil {
			return domain.Playlist{}, err
		}
		inviteToken = &t
	}
	const q = `
		INSERT INTO playlists (owner_id, title, description, is_public, is_collaborative, invite_token, items)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING ` + playlistSelectCols
	var p domain.Playlist
	var tokenOut *string
	err := r.pool.QueryRow(ctx, q, userID, in.Title, in.Description, in.IsPublic, in.IsCollaborative, inviteToken, items).Scan(
		&p.ID, &p.OwnerID, &p.Title, &p.Description, &p.IsPublic, &p.IsCollaborative, &tokenOut,
		&p.Items, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return domain.Playlist{}, err
	}
	if tokenOut != nil {
		p.InviteToken = *tokenOut
	}
	p.IsOwner = true
	p.CanEdit = true
	return p, err
}

func (r *Repository) UpdatePlaylist(ctx context.Context, userID, playlistID uuid.UUID, in domain.UpdatePlaylistInput) (domain.Playlist, error) {
	acc, err := r.resolvePlaylistAccess(ctx, userID, playlistID)
	if err != nil {
		return domain.Playlist{}, err
	}
	if !acc.isOwner {
		return domain.Playlist{}, ErrPlaylistNotFound
	}
	p := acc.playlist
	if in.Title != nil {
		p.Title = *in.Title
	}
	if in.Description != nil {
		p.Description = *in.Description
	}
	if in.IsPublic != nil {
		p.IsPublic = *in.IsPublic
	}
	if in.IsCollaborative != nil {
		p.IsCollaborative = *in.IsCollaborative
		if !*in.IsCollaborative {
			p.InviteToken = ""
		} else if p.InviteToken == "" {
			t, err := newInviteToken()
			if err != nil {
				return domain.Playlist{}, err
			}
			p.InviteToken = t
		}
	}
	var tokenParam *string
	if p.InviteToken != "" {
		tokenParam = &p.InviteToken
	}
	var tokenOut *string
	err = r.pool.QueryRow(ctx, `
		UPDATE playlists SET title = $3, description = $4, is_public = $5,
			is_collaborative = $6, invite_token = $7
		WHERE id = $1 AND owner_id = $2
		RETURNING `+playlistSelectCols,
		playlistID, userID, p.Title, p.Description, p.IsPublic, p.IsCollaborative, tokenParam,
	).Scan(
		&p.ID, &p.OwnerID, &p.Title, &p.Description, &p.IsPublic, &p.IsCollaborative, &tokenOut,
		&p.Items, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return domain.Playlist{}, err
	}
	if tokenOut != nil {
		p.InviteToken = *tokenOut
	}
	return r.playlistForUser(playlistAccess{playlist: p, isOwner: true, canEdit: true}), nil
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
	acc, err := r.resolvePlaylistAccess(ctx, userID, playlistID)
	if err != nil {
		return domain.Playlist{}, err
	}
	if !acc.canEdit {
		return domain.Playlist{}, ErrPlaylistNotFound
	}
	p := acc.playlist
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
	return r.savePlaylistItems(ctx, userID, playlistID, items)
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

type PlayerStateRow struct {
	TrackIDs   []uuid.UUID
	QueueIndex int
	ProgressMs int
}

func (r *Repository) GetPlayerState(ctx context.Context, userID uuid.UUID) (PlayerStateRow, error) {
	var raw []byte
	var idx, progress int
	err := r.pool.QueryRow(ctx, `
		SELECT track_ids, queue_index, progress_ms
		FROM user_player_state WHERE user_id = $1
	`, userID).Scan(&raw, &idx, &progress)
	if errors.Is(err, pgx.ErrNoRows) {
		return PlayerStateRow{TrackIDs: []uuid.UUID{}}, nil
	}
	if err != nil {
		return PlayerStateRow{}, err
	}
	var ids []string
	if err := json.Unmarshal(raw, &ids); err != nil {
		return PlayerStateRow{}, err
	}
	out := PlayerStateRow{QueueIndex: idx, ProgressMs: progress}
	for _, s := range ids {
		id, err := uuid.Parse(s)
		if err != nil {
			continue
		}
		out.TrackIDs = append(out.TrackIDs, id)
	}
	return out, nil
}

func (r *Repository) UpsertPlayerState(ctx context.Context, userID uuid.UUID, trackIDs []uuid.UUID, queueIndex, progressMs int) error {
	strs := make([]string, len(trackIDs))
	for i, id := range trackIDs {
		strs[i] = id.String()
	}
	raw, err := json.Marshal(strs)
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx, `
		INSERT INTO user_player_state (user_id, track_ids, queue_index, progress_ms, updated_at)
		VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (user_id) DO UPDATE SET
			track_ids = EXCLUDED.track_ids,
			queue_index = EXCLUDED.queue_index,
			progress_ms = EXCLUDED.progress_ms,
			updated_at = now()
	`, userID, raw, queueIndex, progressMs)
	return err
}

package library

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"

	"github.com/gachify/gachify/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const playlistSelectCols = `
	id, owner_id, title, description, is_public, is_collaborative, invite_token,
	items, created_at, updated_at`

type playlistAccess struct {
	playlist domain.Playlist
	isOwner  bool
	canEdit  bool
}

func newInviteToken() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func (r *Repository) resolvePlaylistAccess(ctx context.Context, userID, playlistID uuid.UUID) (playlistAccess, error) {
	var acc playlistAccess
	var inviteToken *string
	err := r.pool.QueryRow(ctx, `
		SELECT `+playlistSelectCols+`,
			(p.owner_id = $2) AS is_owner,
			(p.owner_id = $2 OR c.user_id IS NOT NULL) AS can_edit
		FROM playlists p
		LEFT JOIN playlist_collaborators c
			ON c.playlist_id = p.id AND c.user_id = $2
		WHERE p.id = $1
			AND (p.owner_id = $2 OR c.user_id IS NOT NULL)
	`, playlistID, userID).Scan(
		&acc.playlist.ID, &acc.playlist.OwnerID, &acc.playlist.Title, &acc.playlist.Description,
		&acc.playlist.IsPublic, &acc.playlist.IsCollaborative, &inviteToken,
		&acc.playlist.Items, &acc.playlist.CreatedAt, &acc.playlist.UpdatedAt,
		&acc.isOwner, &acc.canEdit,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return playlistAccess{}, ErrPlaylistNotFound
	}
	if err != nil {
		return playlistAccess{}, err
	}
	if inviteToken != nil {
		acc.playlist.InviteToken = *inviteToken
	}
	return acc, nil
}

func (r *Repository) playlistForUser(acc playlistAccess) domain.Playlist {
	p := acc.playlist
	p.IsOwner = acc.isOwner
	p.CanEdit = acc.canEdit
	if !acc.isOwner {
		p.InviteToken = ""
	}
	return p
}

func (r *Repository) GetPlaylist(ctx context.Context, userID, playlistID uuid.UUID) (domain.Playlist, error) {
	acc, err := r.resolvePlaylistAccess(ctx, userID, playlistID)
	if err != nil {
		return domain.Playlist{}, err
	}
	return r.playlistForUser(acc), nil
}

func (r *Repository) JoinPlaylistByInvite(ctx context.Context, userID uuid.UUID, token string) (domain.Playlist, error) {
	var playlistID uuid.UUID
	var ownerID uuid.UUID
	err := r.pool.QueryRow(ctx, `
		SELECT id, owner_id FROM playlists
		WHERE invite_token = $1 AND is_collaborative = true
	`, token).Scan(&playlistID, &ownerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Playlist{}, ErrPlaylistNotFound
	}
	if err != nil {
		return domain.Playlist{}, err
	}
	if ownerID == userID {
		return r.GetPlaylist(ctx, userID, playlistID)
	}
	_, err = r.pool.Exec(ctx, `
		INSERT INTO playlist_collaborators (playlist_id, user_id)
		VALUES ($1, $2) ON CONFLICT DO NOTHING
	`, playlistID, userID)
	if err != nil {
		return domain.Playlist{}, err
	}
	return r.GetPlaylist(ctx, userID, playlistID)
}

func (r *Repository) LeaveCollaboration(ctx context.Context, userID, playlistID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM playlist_collaborators
		WHERE playlist_id = $1 AND user_id = $2
	`, playlistID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrPlaylistNotFound
	}
	return nil
}

func (r *Repository) EnableCollaborative(ctx context.Context, ownerID, playlistID uuid.UUID) (domain.Playlist, error) {
	p, err := r.GetPlaylist(ctx, ownerID, playlistID)
	if err != nil {
		return domain.Playlist{}, err
	}
	if p.OwnerID != ownerID {
		return domain.Playlist{}, ErrPlaylistNotFound
	}
	token := p.InviteToken
	if token == "" {
		token, err = newInviteToken()
		if err != nil {
			return domain.Playlist{}, err
		}
	}
	var tokenOut *string
	err = r.pool.QueryRow(ctx, `
		UPDATE playlists
		SET is_collaborative = true, invite_token = $3
		WHERE id = $1 AND owner_id = $2
		RETURNING `+playlistSelectCols,
		playlistID, ownerID, token,
	).Scan(
		&p.ID, &p.OwnerID, &p.Title, &p.Description, &p.IsPublic, &p.IsCollaborative,
		&tokenOut, &p.Items, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return domain.Playlist{}, err
	}
	if tokenOut != nil {
		p.InviteToken = *tokenOut
	}
	p.IsOwner = true
	p.CanEdit = true
	return p, nil
}

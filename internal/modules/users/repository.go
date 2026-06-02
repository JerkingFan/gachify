package users

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/gachify/gachify/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("user not found")
var ErrHandleTaken = errors.New("handle already taken")

const userColumns = `id, email, handle, display_name, tier, trash_tolerance, gachi_persona, region,
	avatar_url, liked_tracks_public, profile_bio, push_notifications, created_at, updated_at`

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func scanUser(row pgx.Row) (domain.User, error) {
	var u domain.User
	var emailPtr, avatarPtr *string
	err := row.Scan(
		&u.ID, &emailPtr, &u.Handle, &u.DisplayName, &u.Tier, &u.TrashTolerance,
		&u.GachiPersona, &u.Region, &avatarPtr, &u.LikedTracksPublic, &u.ProfileBio,
		&u.PushNotifications, &u.CreatedAt, &u.UpdatedAt,
	)
	if emailPtr != nil {
		u.Email = *emailPtr
	}
	u.AvatarURL = avatarPtr
	return u, err
}

func (r *Repository) Create(ctx context.Context, in domain.CreateUserInput) (domain.User, error) {
	tier := in.Tier
	if tier == "" {
		tier = domain.TierFree
	}
	trash := float32(0.5)
	if in.TrashTolerance != nil {
		trash = *in.TrashTolerance
	}
	persona := in.GachiPersona
	if len(persona) == 0 {
		persona = json.RawMessage(`{}`)
	}

	const q = `
		INSERT INTO users (handle, display_name, tier, trash_tolerance, gachi_persona, region)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING ` + userColumns
	row := r.pool.QueryRow(ctx, q, in.Handle, in.DisplayName, string(tier), trash, persona, in.Region)
	u, err := scanUser(row)
	if err != nil {
		return domain.User{}, fmt.Errorf("insert user: %w", err)
	}
	return u, nil
}

func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (domain.User, error) {
	q := `SELECT ` + userColumns + ` FROM users WHERE id = $1`
	u, err := scanUser(r.pool.QueryRow(ctx, q, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, ErrNotFound
	}
	if err != nil {
		return domain.User{}, fmt.Errorf("get user: %w", err)
	}
	u.Email = ""
	return u, nil
}

func (r *Repository) GetAccountByID(ctx context.Context, id uuid.UUID) (domain.AccountUser, error) {
	const q = `
		SELECT ` + userColumns + `, email_verified_at IS NOT NULL, COALESCE(password_hash, '') <> ''
		FROM users WHERE id = $1
	`
	var u domain.User
	var emailPtr, avatarPtr *string
	var emailVerified, hasPassword bool
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&u.ID, &emailPtr, &u.Handle, &u.DisplayName, &u.Tier, &u.TrashTolerance,
		&u.GachiPersona, &u.Region, &avatarPtr, &u.LikedTracksPublic, &u.ProfileBio,
		&u.CreatedAt, &u.UpdatedAt, &emailVerified, &hasPassword,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.AccountUser{}, ErrNotFound
	}
	if err != nil {
		return domain.AccountUser{}, fmt.Errorf("get account: %w", err)
	}
	if emailPtr != nil {
		u.Email = *emailPtr
	}
	u.AvatarURL = avatarPtr
	return domain.AccountUser{
		User:          u,
		EmailVerified: emailVerified,
		HasPassword:   hasPassword,
	}, nil
}

func (r *Repository) GetByHandle(ctx context.Context, handle string) (domain.User, error) {
	q := `SELECT ` + userColumns + ` FROM users WHERE handle = $1`
	u, err := scanUser(r.pool.QueryRow(ctx, q, handle))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, ErrNotFound
	}
	if err != nil {
		return domain.User{}, fmt.Errorf("get user by handle: %w", err)
	}
	u.Email = ""
	return u, nil
}

func (r *Repository) IsHandleTaken(ctx context.Context, handle string, excludeID uuid.UUID) (bool, error) {
	var id uuid.UUID
	err := r.pool.QueryRow(ctx, `
		SELECT id FROM users WHERE handle = $1 AND id <> $2 LIMIT 1
	`, handle, excludeID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (r *Repository) UpdateProfile(ctx context.Context, userID uuid.UUID, in domain.UpdateProfileInput) (domain.AccountUser, error) {
	displayName := in.DisplayName
	handle := in.Handle
	avatarURL := in.AvatarURL
	bio := in.ProfileBio
	likedPublic := in.LikedTracksPublic
	pushPref := in.PushNotifications

	const q = `
		UPDATE users SET
			display_name = COALESCE($2, display_name),
			handle = COALESCE($3, handle),
			avatar_url = CASE WHEN $4::text IS NOT NULL THEN NULLIF(trim($4), '') ELSE avatar_url END,
			profile_bio = COALESCE($5, profile_bio),
			liked_tracks_public = COALESCE($6, liked_tracks_public),
			push_notifications = COALESCE($7, push_notifications),
			updated_at = now()
		WHERE id = $1
	`
	tag, err := r.pool.Exec(ctx, q, userID, displayName, handle, avatarURL, bio, likedPublic, pushPref)
	if err != nil {
		if strings.Contains(err.Error(), "users_handle_key") {
			return domain.AccountUser{}, ErrHandleTaken
		}
		return domain.AccountUser{}, fmt.Errorf("update profile: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.AccountUser{}, ErrNotFound
	}
	return r.GetAccountByID(ctx, userID)
}

func (r *Repository) CountFollowers(ctx context.Context, userID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM user_follows WHERE followee_id = $1
	`, userID).Scan(&n)
	return n, err
}

func (r *Repository) GetPublicProfile(ctx context.Context, id uuid.UUID) (domain.PublicProfile, error) {
	const q = `
		SELECT u.id, u.handle, u.display_name, u.avatar_url, u.profile_bio, u.liked_tracks_public,
			(SELECT COUNT(*)::int FROM tracks t WHERE t.creator_id = u.id AND t.status = 'published'),
			(SELECT COUNT(*)::int FROM playlists p WHERE p.owner_id = u.id AND p.is_public = true),
			(SELECT COUNT(*)::int FROM user_follows f WHERE f.follower_id = u.id),
			(SELECT COUNT(*)::int FROM user_follows f WHERE f.followee_id = u.id)
		FROM users u WHERE u.id = $1
	`
	var p domain.PublicProfile
	var avatarPtr *string
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&p.ID, &p.Handle, &p.DisplayName, &avatarPtr, &p.ProfileBio, &p.LikedTracksPublic,
		&p.PublishedTracks, &p.PublicPlaylists, &p.FollowingCount, &p.FollowerCount,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.PublicProfile{}, ErrNotFound
	}
	if err != nil {
		return domain.PublicProfile{}, fmt.Errorf("get public profile: %w", err)
	}
	p.AvatarURL = avatarPtr
	return p, nil
}

func (r *Repository) ListPublicSummaries(ctx context.Context, ids []uuid.UUID) ([]domain.PublicUserSummary, error) {
	if len(ids) == 0 {
		return []domain.PublicUserSummary{}, nil
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, handle, display_name, avatar_url
		FROM users WHERE id = ANY($1)
		ORDER BY display_name ASC
	`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.PublicUserSummary
	for rows.Next() {
		var s domain.PublicUserSummary
		var avatarPtr *string
		if err := rows.Scan(&s.ID, &s.Handle, &s.DisplayName, &avatarPtr); err != nil {
			return nil, err
		}
		s.AvatarURL = avatarPtr
		out = append(out, s)
	}
	if out == nil {
		out = []domain.PublicUserSummary{}
	}
	return out, rows.Err()
}

func normalizeArtistSearch(f *domain.SearchArtistsFilter) {
	if f.Limit <= 0 || f.Limit > 50 {
		f.Limit = 20
	}
	if f.Offset < 0 {
		f.Offset = 0
	}
	f.Query = strings.TrimSpace(f.Query)
}

func artistSearchWhere(n int) (string, string) {
	q := fmt.Sprintf("$%d", n)
	where := fmt.Sprintf(` WHERE (
		u.display_name %% %s OR u.handle %% %s
	) AND EXISTS (
		SELECT 1 FROM tracks t
		WHERE t.creator_id = u.id AND t.status = 'published'
	)`, q, q)
	rank := fmt.Sprintf(`GREATEST(
		word_similarity(%s, u.display_name),
		word_similarity(%s, u.handle::text),
		similarity(u.display_name, %s),
		similarity(u.handle::text, %s)
	)`, q, q, q, q)
	return where, rank
}

func (r *Repository) CountSearchCreators(ctx context.Context, f domain.SearchArtistsFilter) (int, error) {
	normalizeArtistSearch(&f)
	where, _ := artistSearchWhere(1)
	q := `SELECT COUNT(*) FROM users u` + where
	var total int
	if err := r.pool.QueryRow(ctx, q, f.Query).Scan(&total); err != nil {
		return 0, fmt.Errorf("count artists: %w", err)
	}
	return total, nil
}

func (r *Repository) SearchCreators(ctx context.Context, f domain.SearchArtistsFilter) ([]domain.ArtistSearchResult, error) {
	normalizeArtistSearch(&f)
	where, rank := artistSearchWhere(1)
	q := fmt.Sprintf(`
		SELECT u.id, u.handle, u.display_name,
			(SELECT COUNT(*)::int FROM tracks t WHERE t.creator_id = u.id AND t.status = 'published')
		FROM users u
		%s
		ORDER BY %s DESC, u.display_name ASC
		LIMIT $2 OFFSET $3
	`, where, rank)

	rows, err := r.pool.Query(ctx, q, f.Query, f.Limit, f.Offset)
	if err != nil {
		return nil, fmt.Errorf("search artists: %w", err)
	}
	defer rows.Close()

	var out []domain.ArtistSearchResult
	for rows.Next() {
		var item domain.ArtistSearchResult
		if err := rows.Scan(&item.ID, &item.Handle, &item.DisplayName, &item.PublishedTracks); err != nil {
			return nil, fmt.Errorf("scan artist: %w", err)
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

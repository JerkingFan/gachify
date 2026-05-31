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

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
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
		RETURNING id, email, handle, display_name, tier, trash_tolerance, gachi_persona, region, created_at, updated_at
	`
	var u domain.User
	var emailPtr *string
	err := r.pool.QueryRow(ctx, q,
		in.Handle, in.DisplayName, string(tier), trash, persona, in.Region,
	).Scan(
		&u.ID, &emailPtr, &u.Handle, &u.DisplayName, &u.Tier, &u.TrashTolerance,
		&u.GachiPersona, &u.Region, &u.CreatedAt, &u.UpdatedAt,
	)
	if emailPtr != nil {
		u.Email = *emailPtr
	}
	if err != nil {
		return domain.User{}, fmt.Errorf("insert user: %w", err)
	}
	return u, nil
}

func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (domain.User, error) {
	const q = `
		SELECT id, email, handle, display_name, tier, trash_tolerance, gachi_persona, region, created_at, updated_at
		FROM users WHERE id = $1
	`
	var u domain.User
	var emailPtr *string
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&u.ID, &emailPtr, &u.Handle, &u.DisplayName, &u.Tier, &u.TrashTolerance,
		&u.GachiPersona, &u.Region, &u.CreatedAt, &u.UpdatedAt,
	)
	if emailPtr != nil {
		u.Email = *emailPtr
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, ErrNotFound
	}
	if err != nil {
		return domain.User{}, fmt.Errorf("get user: %w", err)
	}
	return u, nil
}

func (r *Repository) GetByHandle(ctx context.Context, handle string) (domain.User, error) {
	const q = `
		SELECT id, email, handle, display_name, tier, trash_tolerance, gachi_persona, region, created_at, updated_at
		FROM users WHERE handle = $1
	`
	var u domain.User
	var emailPtr *string
	err := r.pool.QueryRow(ctx, q, handle).Scan(
		&u.ID, &emailPtr, &u.Handle, &u.DisplayName, &u.Tier, &u.TrashTolerance,
		&u.GachiPersona, &u.Region, &u.CreatedAt, &u.UpdatedAt,
	)
	if emailPtr != nil {
		u.Email = *emailPtr
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, ErrNotFound
	}
	if err != nil {
		return domain.User{}, fmt.Errorf("get user by handle: %w", err)
	}
	return u, nil
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

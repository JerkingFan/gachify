package users

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

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

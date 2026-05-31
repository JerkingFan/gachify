package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"strings"

	"github.com/gachify/gachify/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrEmailTaken    = errors.New("email already registered")
	ErrHandleTaken   = errors.New("handle already taken")
	ErrInvalidLogin  = errors.New("invalid email or password")
	ErrInvalidRefresh = errors.New("invalid refresh token")
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func HashRefreshToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (r *Repository) CreateUserWithAuth(ctx context.Context, email, passwordHash, handle, displayName string) (domain.User, error) {
	persona := json.RawMessage(`{}`)
	const q = `
		INSERT INTO users (email, password_hash, handle, display_name, gachi_persona)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, email, handle, display_name, tier, trash_tolerance, gachi_persona, region, created_at, updated_at
	`
	var u domain.User
	var emailPtr *string
	err := r.pool.QueryRow(ctx, q, email, passwordHash, handle, displayName, persona).Scan(
		&u.ID, &emailPtr, &u.Handle, &u.DisplayName, &u.Tier, &u.TrashTolerance,
		&u.GachiPersona, &u.Region, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if isUniqueViolation(err, "users_email_key") {
			return domain.User{}, ErrEmailTaken
		}
		if isUniqueViolation(err, "users_handle_key") {
			return domain.User{}, ErrHandleTaken
		}
		return domain.User{}, fmt.Errorf("insert user: %w", err)
	}
	if emailPtr != nil {
		u.Email = *emailPtr
	}
	return u, nil
}

func (r *Repository) GetByEmail(ctx context.Context, email string) (domain.User, string, error) {
	const q = `
		SELECT id, email, handle, display_name, tier, trash_tolerance, gachi_persona, region,
		       password_hash, created_at, updated_at
		FROM users WHERE email = $1
	`
	var u domain.User
	var emailPtr *string
	var passwordHash *string
	err := r.pool.QueryRow(ctx, q, email).Scan(
		&u.ID, &emailPtr, &u.Handle, &u.DisplayName, &u.Tier, &u.TrashTolerance,
		&u.GachiPersona, &u.Region, &passwordHash, &u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, "", ErrInvalidLogin
	}
	if err != nil {
		return domain.User{}, "", fmt.Errorf("get by email: %w", err)
	}
	if emailPtr != nil {
		u.Email = *emailPtr
	}
	hash := ""
	if passwordHash != nil {
		hash = *passwordHash
	}
	return u, hash, nil
}

func (r *Repository) StoreRefreshToken(ctx context.Context, userID uuid.UUID, token string, expiresAt time.Time) error {
	const q = `
		INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		VALUES ($1, $2, $3)
	`
	_, err := r.pool.Exec(ctx, q, userID, HashRefreshToken(token), expiresAt)
	return err
}

func (r *Repository) RevokeRefreshToken(ctx context.Context, token string) error {
	const q = `UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`
	_, err := r.pool.Exec(ctx, q, HashRefreshToken(token))
	return err
}

func (r *Repository) UserIDForRefreshToken(ctx context.Context, token string) (uuid.UUID, error) {
	const q = `
		SELECT user_id FROM refresh_tokens
		WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
	`
	var id uuid.UUID
	err := r.pool.QueryRow(ctx, q, HashRefreshToken(token)).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrInvalidRefresh
	}
	if err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

func (r *Repository) CreateDefaultPlaylists(ctx context.Context, userID uuid.UUID) error {
	defaults := []struct{ title, desc string }{
		{"Dungeon Mix Vol.1", "Deep dark fantasy only"},
		{"Battle Winners", "Community picks"},
	}
	for _, d := range defaults {
		_, err := r.pool.Exec(ctx, `
			INSERT INTO playlists (owner_id, title, description, items)
			VALUES ($1, $2, $3, '[]')
		`, userID, d.title, d.desc)
		if err != nil {
			return err
		}
	}
	return nil
}

func isUniqueViolation(err error, constraint string) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, constraint) || strings.Contains(msg, "duplicate key")
}

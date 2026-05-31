package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func newRawToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func (r *Repository) CreateEmailVerification(ctx context.Context, userID uuid.UUID, ttl time.Duration) (string, error) {
	raw, err := newRawToken()
	if err != nil {
		return "", err
	}
	_, _ = r.pool.Exec(ctx, `DELETE FROM email_verification_tokens WHERE user_id = $1`, userID)
	_, err = r.pool.Exec(ctx, `
		INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
		VALUES ($1, $2, $3)
	`, userID, hashToken(raw), time.Now().Add(ttl))
	return raw, err
}

func (r *Repository) VerifyEmail(ctx context.Context, token string) error {
	var userID uuid.UUID
	err := r.pool.QueryRow(ctx, `
		SELECT user_id FROM email_verification_tokens
		WHERE token_hash = $1 AND expires_at > now()
	`, hashToken(token)).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidLogin
	}
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx, `UPDATE users SET email_verified_at = now() WHERE id = $1`, userID)
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx, `DELETE FROM email_verification_tokens WHERE user_id = $1`, userID)
	return err
}

func (r *Repository) CreatePasswordReset(ctx context.Context, email string, ttl time.Duration) (string, uuid.UUID, error) {
	u, _, err := r.GetByEmail(ctx, email)
	if errors.Is(err, ErrInvalidLogin) {
		return "", uuid.Nil, nil
	}
	if err != nil {
		return "", uuid.Nil, err
	}
	raw, err := newRawToken()
	if err != nil {
		return "", uuid.Nil, err
	}
	_, _ = r.pool.Exec(ctx, `UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, u.ID)
	_, err = r.pool.Exec(ctx, `
		INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
		VALUES ($1, $2, $3)
	`, u.ID, hashToken(raw), time.Now().Add(ttl))
	return raw, u.ID, err
}

func (r *Repository) ResetPassword(ctx context.Context, token, passwordHash string) error {
	var userID uuid.UUID
	err := r.pool.QueryRow(ctx, `
		SELECT user_id FROM password_reset_tokens
		WHERE token_hash = $1 AND expires_at > now() AND used_at IS NULL
	`, hashToken(token)).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidLogin
	}
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx, `UPDATE users SET password_hash = $2 WHERE id = $1`, userID, passwordHash)
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx, `UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, userID)
	return err
}

func (r *Repository) UserEmail(ctx context.Context, userID uuid.UUID) (string, error) {
	var email *string
	err := r.pool.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, userID).Scan(&email)
	if err != nil {
		return "", fmt.Errorf("user email: %w", err)
	}
	if email == nil {
		return "", nil
	}
	return *email, nil
}

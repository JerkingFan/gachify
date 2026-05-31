package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/gachify/gachify/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (r *Repository) FindOrCreateGoogleUser(ctx context.Context, googleSub, email, displayName string) (domain.User, error) {
	if u, err := r.userByOAuth(ctx, "google", googleSub); err == nil {
		return u, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, err
	}

	if u, _, err := r.GetByEmail(ctx, email); err == nil {
		if err := r.linkOAuth(ctx, u.ID, "google", googleSub, email); err != nil {
			return domain.User{}, err
		}
		return u, nil
	} else if !errors.Is(err, ErrInvalidLogin) {
		return domain.User{}, err
	}

	persona := json.RawMessage(`{}`)
	unusableHash := randomUnusablePasswordHash()
	handle := uniqueHandle(email)
	for attempt := 0; attempt < 5; attempt++ {
		tryHandle := handle
		if attempt > 0 {
			tryHandle = fmt.Sprintf("%s_%s", handle, randomSuffix())
		}
		u, err := r.insertOAuthUser(ctx, email, unusableHash, tryHandle, displayName, persona)
		if err == nil {
			if err := r.linkOAuth(ctx, u.ID, "google", googleSub, email); err != nil {
				return domain.User{}, err
			}
			_ = r.CreateDefaultPlaylists(ctx, u.ID)
			return u, nil
		}
		if !isUniqueViolation(err, "users_handle_key") {
			return domain.User{}, err
		}
	}
	return domain.User{}, fmt.Errorf("could not allocate handle")
}

func (r *Repository) insertOAuthUser(ctx context.Context, email, passwordHash, handle, displayName string, persona json.RawMessage) (domain.User, error) {
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
		return domain.User{}, err
	}
	if emailPtr != nil {
		u.Email = *emailPtr
	}
	return u, nil
}

func (r *Repository) userByOAuth(ctx context.Context, provider, providerUserID string) (domain.User, error) {
	const q = `
		SELECT u.id, u.email, u.handle, u.display_name, u.tier, u.trash_tolerance,
		       u.gachi_persona, u.region, u.created_at, u.updated_at
		FROM oauth_accounts o
		JOIN users u ON u.id = o.user_id
		WHERE o.provider = $1 AND o.provider_user_id = $2
	`
	var u domain.User
	var emailPtr *string
	err := r.pool.QueryRow(ctx, q, provider, providerUserID).Scan(
		&u.ID, &emailPtr, &u.Handle, &u.DisplayName, &u.Tier, &u.TrashTolerance,
		&u.GachiPersona, &u.Region, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return domain.User{}, err
	}
	if emailPtr != nil {
		u.Email = *emailPtr
	}
	return u, nil
}

func (r *Repository) linkOAuth(ctx context.Context, userID uuid.UUID, provider, providerUserID, email string) error {
	const q = `
		INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (provider, provider_user_id) DO UPDATE SET user_id = EXCLUDED.user_id
	`
	_, err := r.pool.Exec(ctx, q, userID, provider, providerUserID, email)
	return err
}

func uniqueHandle(email string) string {
	local := strings.Split(email, "@")[0]
	local = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' {
			return r
		}
		if r >= 'A' && r <= 'Z' {
			return r + ('a' - 'A')
		}
		return '_'
	}, local)
	if len(local) < 3 {
		local = "user_" + randomSuffix()
	}
	if len(local) > 24 {
		local = local[:24]
	}
	return local
}

func randomSuffix() string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func randomUnusablePasswordHash() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return "oauth:" + hex.EncodeToString(b)
}

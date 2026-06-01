package users

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode"

	"github.com/gachify/gachify/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// FindOrCreateArtist resolves an artist by display name or handle hint, creating a catalog user if needed.
func (r *Repository) FindOrCreateArtist(ctx context.Context, displayName, handleHint string) (domain.User, error) {
	displayName = strings.TrimSpace(displayName)
	if displayName == "" {
		return domain.User{}, fmt.Errorf("artist display name is required")
	}

	const findByName = `
		SELECT id, email, handle, display_name, tier, trash_tolerance, gachi_persona, region, created_at, updated_at
		FROM users WHERE lower(trim(display_name)) = lower(trim($1))
		LIMIT 1
	`
	if u, err := r.scanUserRow(r.pool.QueryRow(ctx, findByName, displayName)); err == nil {
		return u, nil
	} else if !errors.Is(err, ErrNotFound) {
		return domain.User{}, err
	}

	handleHint = strings.TrimSpace(handleHint)
	if handleHint != "" {
		if u, err := r.GetByHandle(ctx, handleHint); err == nil {
			return u, nil
		} else if !errors.Is(err, ErrNotFound) {
			return domain.User{}, err
		}
	}

	base := slugifyHandle(displayName)
	if handleHint != "" {
		base = slugifyHandle(handleHint)
	}

	var lastErr error
	for i := 0; i < 32; i++ {
		handle := base
		if i > 0 {
			handle = fmt.Sprintf("%s_%d", base, i+1)
		}
		u, err := r.Create(ctx, domain.CreateUserInput{
			Handle:      handle,
			DisplayName: displayName,
			Tier:        domain.TierCreatorPro,
		})
		if err == nil {
			return u, nil
		}
		lastErr = err
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			continue
		}
		return domain.User{}, err
	}
	return domain.User{}, fmt.Errorf("create artist: %w", lastErr)
}

func slugifyHandle(name string) string {
	var b strings.Builder
	prevSep := false
	for _, r := range strings.ToLower(strings.TrimSpace(name)) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			prevSep = false
			continue
		}
		if !prevSep && b.Len() > 0 {
			b.WriteByte('_')
			prevSep = true
		}
	}
	s := strings.Trim(b.String(), "_")
	if s == "" {
		return "artist"
	}
	if len(s) > 32 {
		return s[:32]
	}
	return s
}

func (r *Repository) scanUserRow(row interface {
	Scan(dest ...any) error
}) (domain.User, error) {
	var u domain.User
	var emailPtr *string
	err := row.Scan(
		&u.ID, &emailPtr, &u.Handle, &u.DisplayName, &u.Tier, &u.TrashTolerance,
		&u.GachiPersona, &u.Region, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return domain.User{}, mapUserErr(err)
	}
	if emailPtr != nil {
		u.Email = *emailPtr
	}
	return u, nil
}

func mapUserErr(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

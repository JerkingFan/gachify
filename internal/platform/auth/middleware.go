package auth

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/google/uuid"
)

func Middleware(tokens *TokenService, blacklist *TokenBlacklist) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, jti, _, err := extractBearer(tokens, r)
			if err != nil {
				httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
				return
			}
			if blacklist != nil && jti != "" {
				revoked, err := blacklist.IsRevoked(r.Context(), jti)
				if err == nil && revoked {
					httpserver.Error(w, http.StatusUnauthorized, "token_revoked", "access token has been revoked")
					return
				}
			}
			next.ServeHTTP(w, r.WithContext(WithUserID(r.Context(), userID)))
		})
	}
}

func OptionalMiddleware(tokens *TokenService, blacklist *TokenBlacklist) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if userID, jti, _, err := extractBearer(tokens, r); err == nil {
				if blacklist == nil || jti == "" {
					r = r.WithContext(WithUserID(r.Context(), userID))
				} else if revoked, blErr := blacklist.IsRevoked(r.Context(), jti); blErr == nil && !revoked {
					r = r.WithContext(WithUserID(r.Context(), userID))
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

func extractBearer(tokens *TokenService, r *http.Request) (uuid.UUID, string, time.Time, error) {
	h := r.Header.Get("Authorization")
	if h == "" {
		return uuid.Nil, "", time.Time{}, errMissingToken
	}
	parts := strings.SplitN(h, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return uuid.Nil, "", time.Time{}, errMissingToken
	}
	meta, err := tokens.ParseAccessMeta(parts[1])
	if err != nil {
		return uuid.Nil, "", time.Time{}, errMissingToken
	}
	return meta.UserID, meta.JTI, meta.Exp, nil
}

// RevokeAccessFromRequest blacklists the bearer access token when present.
func RevokeAccessFromRequest(ctx context.Context, tokens *TokenService, blacklist *TokenBlacklist, r *http.Request) {
	if blacklist == nil || tokens == nil {
		return
	}
	h := r.Header.Get("Authorization")
	parts := strings.SplitN(h, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return
	}
	meta, err := tokens.ParseAccessMeta(parts[1])
	if err != nil || meta.JTI == "" {
		return
	}
	ttl := time.Until(meta.Exp)
	if ttl <= 0 {
		return
	}
	_ = blacklist.Revoke(ctx, meta.JTI, ttl)
}

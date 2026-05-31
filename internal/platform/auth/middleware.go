package auth

import (
	"net/http"
	"strings"

	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/google/uuid"
)

func Middleware(tokens *TokenService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, err := extractBearer(tokens, r)
			if err != nil {
				httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
				return
			}
			next.ServeHTTP(w, r.WithContext(WithUserID(r.Context(), userID)))
		})
	}
}

func OptionalMiddleware(tokens *TokenService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if userID, err := extractBearer(tokens, r); err == nil {
				r = r.WithContext(WithUserID(r.Context(), userID))
			}
			next.ServeHTTP(w, r)
		})
	}
}

func extractBearer(tokens *TokenService, r *http.Request) (uuid.UUID, error) {
	h := r.Header.Get("Authorization")
	if h == "" {
		return uuid.Nil, errMissingToken
	}
	parts := strings.SplitN(h, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return uuid.Nil, errMissingToken
	}
	return tokens.Parse(parts[1], TokenAccess)
}

package auth

import (
	"net/http"

	"github.com/gachify/gachify/internal/platform/httpserver"
)

const SeedKeyHeader = "X-Gachify-Seed-Key"

// SeedGuard allows seed write endpoints in development or when the seed secret matches.
func SeedGuard(env, secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if env == "development" {
				next.ServeHTTP(w, r)
				return
			}
			if secret != "" && r.Header.Get(SeedKeyHeader) == secret {
				next.ServeHTTP(w, r)
				return
			}
			httpserver.Error(w, http.StatusNotFound, "not_found", "not found")
		})
	}
}

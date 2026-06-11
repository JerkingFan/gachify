package admin

import (
	"net/http"
	"strings"

	"github.com/gachify/gachify/internal/platform/httpserver"
)

const AdminKeyHeader = "X-Gachify-Admin-Key"

func Guard(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if secret == "" {
				httpserver.Error(w, http.StatusNotFound, "not_found", "not found")
				return
			}
			// Stream URLs carry a signed playback token (pt); <audio>/HLS cannot send admin headers.
			if strings.Contains(r.URL.Path, "/stream/") {
				next.ServeHTTP(w, r)
				return
			}
			if r.Header.Get(AdminKeyHeader) != secret {
				httpserver.Error(w, http.StatusUnauthorized, "unauthorized", "invalid admin key")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

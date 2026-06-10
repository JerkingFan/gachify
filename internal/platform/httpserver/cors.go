package httpserver

import (
	"net/http"
	"strings"

	"github.com/go-chi/cors"
)

func CORS(allowedOrigins string) func(http.Handler) http.Handler {
	origins := []string{
		"http://localhost:5173",
		"http://127.0.0.1:5173",
		"https://localhost",      // Capacitor Android
		"capacitor://localhost",  // Capacitor iOS
		"http://localhost",       // Capacitor http scheme
	}
	if allowedOrigins != "" && allowedOrigins != "*" {
		for _, o := range strings.Split(allowedOrigins, ",") {
			o = strings.TrimSpace(o)
			if o != "" {
				origins = append(origins, o)
			}
		}
	}
	// Capacitor / WebView may send Origin: null on some Android builds.
	return cors.Handler(cors.Options{
		AllowedOrigins:   origins,
		AllowOriginFunc: func(r *http.Request, origin string) bool {
			if origin == "" || origin == "null" {
				return true
			}
			for _, o := range origins {
				if o == origin {
					return true
				}
			}
			return false
		},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID"},
		ExposedHeaders:   []string{"X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	})
}

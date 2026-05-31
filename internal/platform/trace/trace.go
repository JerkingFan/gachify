package trace

import (
	"context"

	"github.com/go-chi/chi/v5/middleware"
)

type ctxKey struct{}

// WithRequestID stores a request/correlation id in context (e.g. for worker jobs).
func WithRequestID(ctx context.Context, id string) context.Context {
	if id == "" {
		return ctx
	}
	return context.WithValue(ctx, ctxKey{}, id)
}

// RequestIDFromContext returns the correlation id when present.
func RequestIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(ctxKey{}).(string); ok {
		return v
	}
	if v := middleware.GetReqID(ctx); v != "" {
		return v
	}
	return ""
}

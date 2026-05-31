package observability

import (
	"log/slog"
	"time"

	"github.com/getsentry/sentry-go"
)

// InitSentry configures optional error reporting. Returns a flush function (no-op when disabled).
func InitSentry(dsn, env string, log *slog.Logger) func() {
	if dsn == "" {
		return func() {}
	}
	if err := sentry.Init(sentry.ClientOptions{
		Dsn:              dsn,
		Environment:      env,
		TracesSampleRate: 0.1,
	}); err != nil {
		log.Warn("sentry init failed", "error", err)
		return func() {}
	}
	log.Info("sentry enabled")
	return func() {
		sentry.Flush(2 * time.Second)
	}
}

// CaptureException reports an error when Sentry is configured.
func CaptureException(err error) {
	if err == nil {
		return
	}
	sentry.CaptureException(err)
}

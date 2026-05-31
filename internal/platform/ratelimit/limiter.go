package ratelimit

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"time"

	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/redis/go-redis/v9"
)

var incrScript = redis.NewScript(`
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[2])
end
if current > tonumber(ARGV[1]) then
  return {0, redis.call("TTL", KEYS[1])}
end
return {1, tonumber(ARGV[2])}
`)

type Limiter struct {
	client  *redis.Client
	prefix  string
	enabled bool
	log     *slog.Logger
}

func New(client *redis.Client, prefix string, enabled bool, log *slog.Logger) *Limiter {
	return &Limiter{client: client, prefix: prefix, enabled: enabled, log: log}
}

func (l *Limiter) Allow(ctx context.Context, bucket, key string, limit int, window time.Duration) (bool, time.Duration, error) {
	if !l.enabled || limit <= 0 {
		return true, 0, nil
	}
	redisKey := fmt.Sprintf("%s:%s:%s", l.prefix, bucket, key)
	sec := int(window.Seconds())
	if sec < 1 {
		sec = 1
	}
	res, err := incrScript.Run(ctx, l.client, []string{redisKey}, limit, sec).Int64Slice()
	if err != nil {
		return true, 0, err
	}
	if len(res) < 2 {
		return true, 0, fmt.Errorf("unexpected rate limit response")
	}
	if res[0] == 1 {
		return true, 0, nil
	}
	retry := time.Duration(res[1]) * time.Second
	if retry <= 0 {
		retry = window
	}
	return false, retry, nil
}

type KeyFunc func(*http.Request) string

func ByIP(r *http.Request) string {
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

func ByUser(r *http.Request) string {
	if uid, ok := platformauth.UserIDFromContext(r.Context()); ok {
		return uid.String()
	}
	return ByIP(r)
}

func (l *Limiter) Middleware(bucket string, limit int, window time.Duration, keyFn KeyFunc) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !l.enabled || limit <= 0 {
				next.ServeHTTP(w, r)
				return
			}
			key := keyFn(r)
			ok, retry, err := l.Allow(r.Context(), bucket, key, limit, window)
			if err != nil {
				l.log.Warn("rate limit check failed, allowing request", "bucket", bucket, "error", err)
				next.ServeHTTP(w, r)
				return
			}
			if !ok {
				w.Header().Set("Retry-After", strconv.Itoa(int(retry.Seconds())))
				httpserver.Error(w, http.StatusTooManyRequests, "rate_limit_exceeded", "too many requests")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

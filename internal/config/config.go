package config

import (
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gachify/gachify/internal/platform/email"
)

type Config struct {
	Env                string
	HTTPAddr           string
	DatabaseURL        string
	RedisURL           string
	CORSOrigins        string
	JWTSecret          string
	JWTAccessTTL       time.Duration
	JWTRefreshTTL      time.Duration
	GoogleClientID     string
	GoogleRedirectURL  string
	GoogleClientSecret string
	FrontendURL        string
	AdminSecret        string
	ModerationEnabled  bool
	CDNBaseURL         string
	S3Endpoint         string
	S3PublicEndpoint   string
	S3Region           string
	S3BucketMasters    string
	S3AccessKey        string
	S3SecretKey        string
	S3UsePathStyle     bool
	UploadMaxBytes     int64
	PlaybackTokenTTL   time.Duration
	PlaybackSegmentTTL time.Duration
	PublicAPIBaseURL   string
	SeedSecret         string
	RateLimit          RateLimitConfig
	TranscodeMaxAttempts int
	TranscodeRetryBase   time.Duration
	TranscodeVisibilityTimeout time.Duration
	WorkerShutdownTimeout      time.Duration
	SentryDSN                  string
	CacheEnabled               bool
	CacheTTL                   time.Duration
	MetricsEnabled             bool
	SpotifyClientID     string
	SpotifyClientSecret string
	YouTubeAPIKey       string
	VAPIDPublicKey      string
	VAPIDPrivateKey     string
	VAPIDSubject        string
	OfflineMaxDownloads int
	OfflineSegmentTTL   time.Duration
	SMTP                email.SMTPConfig
}

type RateLimitConfig struct {
	Enabled      bool
	AuthLogin    int
	AuthRegister int
	UploadInit   int
	Search       int
}

func Load() (Config, error) {
	cfg := Config{
		Env:              getEnv("GACHIFY_ENV", "development"),
		HTTPAddr:         getEnv("GACHIFY_HTTP_ADDR", ":8080"),
		DatabaseURL:      getEnv("GACHIFY_DATABASE_URL", "postgres://gachify:gachify@localhost:5432/gachify?sslmode=disable"),
		RedisURL:         getEnv("GACHIFY_REDIS_URL", "redis://localhost:6379/0"),
		CORSOrigins:      getEnv("GACHIFY_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"),
		JWTSecret:        getEnv("GACHIFY_JWT_SECRET", "dev-only-change-in-production-min-32-chars!!"),
		GoogleClientID:   os.Getenv("GACHIFY_GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GACHIFY_GOOGLE_CLIENT_SECRET"),
		GoogleRedirectURL: getEnv("GACHIFY_GOOGLE_REDIRECT_URL", "http://localhost:8080/api/v1/auth/oidc/google/callback"),
		FrontendURL:      getEnv("GACHIFY_FRONTEND_URL", "http://localhost:5173"),
		AdminSecret:      os.Getenv("GACHIFY_ADMIN_SECRET"),
		ModerationEnabled: getEnv("GACHIFY_MODERATION_ENABLED", "true") == "true",
		CDNBaseURL:       os.Getenv("GACHIFY_CDN_BASE_URL"),
		S3Endpoint:       getEnv("GACHIFY_S3_ENDPOINT", "http://localhost:9000"),
		S3PublicEndpoint: getEnv("GACHIFY_S3_PUBLIC_ENDPOINT", "http://localhost:9000"),
		S3Region:         getEnv("GACHIFY_S3_REGION", "us-east-1"),
		S3BucketMasters:  getEnv("GACHIFY_S3_BUCKET_MASTERS", "gachify-masters"),
		S3AccessKey:      getEnv("GACHIFY_S3_ACCESS_KEY", "gachify"),
		S3SecretKey:      getEnv("GACHIFY_S3_SECRET_KEY", "gachifysecret"),
		S3UsePathStyle:   getEnv("GACHIFY_S3_PATH_STYLE", "true") == "true",
		UploadMaxBytes:     100 * 1024 * 1024,
		PublicAPIBaseURL:   getEnv("GACHIFY_PUBLIC_API_URL", "http://localhost:8080"),
		SeedSecret:         os.Getenv("GACHIFY_SEED_SECRET"),
		RateLimit: RateLimitConfig{
			Enabled:      getEnv("GACHIFY_RATE_LIMIT_ENABLED", "true") == "true",
			AuthLogin:    parseIntDefault(getEnv("GACHIFY_RATE_LIMIT_AUTH_LOGIN", "10"), 10),
			AuthRegister: parseIntDefault(getEnv("GACHIFY_RATE_LIMIT_AUTH_REGISTER", "5"), 5),
			UploadInit:   parseIntDefault(getEnv("GACHIFY_RATE_LIMIT_UPLOAD_INIT", "20"), 20),
			Search:       parseIntDefault(getEnv("GACHIFY_RATE_LIMIT_SEARCH", "60"), 60),
		},
	}

	var err error
	cfg.JWTAccessTTL, err = time.ParseDuration(getEnv("GACHIFY_JWT_ACCESS_TTL", "15m"))
	if err != nil {
		return Config{}, fmt.Errorf("GACHIFY_JWT_ACCESS_TTL: %w", err)
	}
	cfg.JWTRefreshTTL, err = time.ParseDuration(getEnv("GACHIFY_JWT_REFRESH_TTL", "168h"))
	if err != nil {
		return Config{}, fmt.Errorf("GACHIFY_JWT_REFRESH_TTL: %w", err)
	}
	cfg.PlaybackTokenTTL, err = time.ParseDuration(getEnv("GACHIFY_PLAYBACK_TOKEN_TTL", "5m"))
	if err != nil {
		return Config{}, fmt.Errorf("GACHIFY_PLAYBACK_TOKEN_TTL: %w", err)
	}
	cfg.PlaybackSegmentTTL, err = time.ParseDuration(getEnv("GACHIFY_PLAYBACK_SEGMENT_TTL", "2m"))
	if err != nil {
		return Config{}, fmt.Errorf("GACHIFY_PLAYBACK_SEGMENT_TTL: %w", err)
	}
	if cdnTTL := os.Getenv("GACHIFY_HLS_SEGMENT_PRESIGN_TTL"); cdnTTL != "" {
		cfg.PlaybackSegmentTTL, err = time.ParseDuration(cdnTTL)
		if err != nil {
			return Config{}, fmt.Errorf("GACHIFY_HLS_SEGMENT_PRESIGN_TTL: %w", err)
		}
	} else if cfg.CDNBaseURL != "" {
		cfg.PlaybackSegmentTTL = 24 * time.Hour
	}
	cfg.TranscodeMaxAttempts = parseIntDefault(getEnv("GACHIFY_TRANSCODE_MAX_ATTEMPTS", "3"), 3)
	if cfg.TranscodeMaxAttempts < 1 {
		cfg.TranscodeMaxAttempts = 1
	}
	cfg.TranscodeRetryBase, err = time.ParseDuration(getEnv("GACHIFY_TRANSCODE_RETRY_BASE", "30s"))
	if err != nil {
		return Config{}, fmt.Errorf("GACHIFY_TRANSCODE_RETRY_BASE: %w", err)
	}
	cfg.TranscodeVisibilityTimeout, err = time.ParseDuration(getEnv("GACHIFY_TRANSCODE_VISIBILITY_TIMEOUT", "30m"))
	if err != nil {
		return Config{}, fmt.Errorf("GACHIFY_TRANSCODE_VISIBILITY_TIMEOUT: %w", err)
	}
	cfg.WorkerShutdownTimeout, err = time.ParseDuration(getEnv("GACHIFY_WORKER_SHUTDOWN_TIMEOUT", "2m"))
	if err != nil {
		return Config{}, fmt.Errorf("GACHIFY_WORKER_SHUTDOWN_TIMEOUT: %w", err)
	}
	cfg.SentryDSN = os.Getenv("GACHIFY_SENTRY_DSN")
	cfg.CacheEnabled = getEnv("GACHIFY_CACHE_ENABLED", "true") == "true"
	cfg.CacheTTL, err = time.ParseDuration(getEnv("GACHIFY_CACHE_TTL", "30s"))
	if err != nil {
		return Config{}, fmt.Errorf("GACHIFY_CACHE_TTL: %w", err)
	}
	cfg.MetricsEnabled = getEnv("GACHIFY_METRICS_ENABLED", "true") == "true"
	cfg.SpotifyClientID = os.Getenv("GACHIFY_SPOTIFY_CLIENT_ID")
	cfg.SpotifyClientSecret = os.Getenv("GACHIFY_SPOTIFY_CLIENT_SECRET")
	cfg.YouTubeAPIKey = os.Getenv("GACHIFY_YOUTUBE_API_KEY")
	cfg.VAPIDPublicKey = os.Getenv("GACHIFY_VAPID_PUBLIC_KEY")
	cfg.VAPIDPrivateKey = os.Getenv("GACHIFY_VAPID_PRIVATE_KEY")
	cfg.VAPIDSubject = getEnv("GACHIFY_VAPID_SUBJECT", "mailto:push@gachify.local")
	cfg.OfflineMaxDownloads = parseIntDefault(getEnv("GACHIFY_OFFLINE_MAX_DOWNLOADS", "25"), 25)
	cfg.OfflineSegmentTTL, err = time.ParseDuration(getEnv("GACHIFY_OFFLINE_SEGMENT_TTL", "168h"))
	if err != nil {
		return Config{}, fmt.Errorf("GACHIFY_OFFLINE_SEGMENT_TTL: %w", err)
	}
	cfg.SMTP = email.SMTPConfig{
		Host:     os.Getenv("GACHIFY_SMTP_HOST"),
		Port:     parseIntDefault(getEnv("GACHIFY_SMTP_PORT", "587"), 587),
		User:     os.Getenv("GACHIFY_SMTP_USER"),
		Password: os.Getenv("GACHIFY_SMTP_PASSWORD"),
		From:     os.Getenv("GACHIFY_SMTP_FROM"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("GACHIFY_DATABASE_URL is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return Config{}, fmt.Errorf("GACHIFY_JWT_SECRET must be at least 32 characters")
	}
	normalizeStoragePublicURL(&cfg)
	return cfg, nil
}

// When MinIO is proxied on the same host as the site (Caddy :80), presigned HLS URLs must not use :9000.
func normalizeStoragePublicURL(cfg *Config) {
	if cfg.CDNBaseURL != "" {
		return
	}
	site := strings.TrimRight(cfg.PublicAPIBaseURL, "/")
	pub := strings.TrimRight(cfg.S3PublicEndpoint, "/")
	if site == "" || pub == "" || !strings.Contains(pub, ":9000") {
		return
	}
	siteURL, err1 := url.Parse(site)
	pubURL, err2 := url.Parse(pub)
	if err1 != nil || err2 != nil {
		return
	}
	if siteURL.Hostname() != "" && siteURL.Hostname() == pubURL.Hostname() {
		cfg.S3PublicEndpoint = site
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parseIntDefault(s string, def int) int {
	if s == "" {
		return def
	}
	var n int
	if _, err := fmt.Sscanf(s, "%d", &n); err != nil || n < 0 {
		return def
	}
	return n
}

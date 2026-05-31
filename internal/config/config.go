package config

import (
	"fmt"
	"os"
	"time"
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
	GoogleClientSecret string
	GoogleRedirectURL  string
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
		GoogleRedirectURL: getEnv("GACHIFY_GOOGLE_REDIRECT_URL", "http://localhost:5173/auth/callback/google"),
		S3Endpoint:       getEnv("GACHIFY_S3_ENDPOINT", "http://localhost:9000"),
		S3PublicEndpoint: getEnv("GACHIFY_S3_PUBLIC_ENDPOINT", "http://localhost:9000"),
		S3Region:         getEnv("GACHIFY_S3_REGION", "us-east-1"),
		S3BucketMasters:  getEnv("GACHIFY_S3_BUCKET_MASTERS", "gachify-masters"),
		S3AccessKey:      getEnv("GACHIFY_S3_ACCESS_KEY", "gachify"),
		S3SecretKey:      getEnv("GACHIFY_S3_SECRET_KEY", "gachifysecret"),
		S3UsePathStyle:   getEnv("GACHIFY_S3_PATH_STYLE", "true") == "true",
		UploadMaxBytes:     100 * 1024 * 1024,
		PublicAPIBaseURL:   getEnv("GACHIFY_PUBLIC_API_URL", "http://localhost:8080"),
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

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("GACHIFY_DATABASE_URL is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return Config{}, fmt.Errorf("GACHIFY_JWT_SECRET must be at least 32 characters")
	}
	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

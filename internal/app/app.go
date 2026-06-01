package app

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/gachify/gachify/internal/config"
	"github.com/gachify/gachify/api"
	authmod "github.com/gachify/gachify/internal/modules/auth"
	"github.com/gachify/gachify/internal/modules/admin"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/modules/creator"
	"github.com/gachify/gachify/internal/modules/health"
	"github.com/gachify/gachify/internal/modules/library"
	"github.com/gachify/gachify/internal/modules/seed"
	searchmod "github.com/gachify/gachify/internal/modules/search"
	"github.com/gachify/gachify/internal/modules/share"
	"github.com/gachify/gachify/internal/modules/streaming"
	"github.com/gachify/gachify/internal/modules/users"
	streamtoken "github.com/gachify/gachify/internal/platform/streaming"
	platformauth "github.com/gachify/gachify/internal/platform/auth"
	"github.com/gachify/gachify/internal/platform/cache"
	"github.com/gachify/gachify/internal/platform/database"
	"github.com/gachify/gachify/internal/platform/email"
	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/gachify/gachify/internal/platform/metrics"
	"github.com/gachify/gachify/internal/platform/observability"
	"github.com/gachify/gachify/internal/platform/queue"
	"github.com/gachify/gachify/internal/platform/ratelimit"
	"github.com/gachify/gachify/internal/platform/recent"
	"github.com/gachify/gachify/internal/platform/storage"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type App struct {
	cfg         config.Config
	log         *slog.Logger
	pool        *pgxpool.Pool
	server      *http.Server
	flushSentry func()
}

func New(ctx context.Context) (*App, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, err
	}

	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	flushSentry := observability.InitSentry(cfg.SentryDSN, cfg.Env, log)

	pool, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("database: %w", err)
	}

	tokens := platformauth.NewTokenService(cfg.JWTSecret, cfg.JWTAccessTTL, cfg.JWTRefreshTTL)

	s3, err := storage.NewClient(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("s3: %w", err)
	}
	redisQ, err := queue.NewRedisQueue(cfg.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("redis: %w", err)
	}
	rateLimiter := ratelimit.New(redisQ.Client(), "gachify:rl", cfg.RateLimit.Enabled, log)
	tokenBlacklist := platformauth.NewTokenBlacklist(redisQ.Client())

	var cacheStore *cache.Store
	if cfg.CacheEnabled {
		cacheStore = cache.New(redisQ.Client(), "gachify:cache", cfg.CacheTTL)
	}
	recentStore := recent.NewStore(redisQ.Client())

	healthH := health.NewHandler(pool, redisQ, s3)
	userRepo := users.NewRepository(pool)
	userH := users.NewHandler(userRepo)
	catalogRepo := catalog.NewRepository(pool)
	catalogH := catalog.NewHandler(catalogRepo, rateLimiter, cfg.RateLimit.Search, cacheStore)
	searchH := searchmod.NewHandler(userRepo, rateLimiter, cfg.RateLimit.Search)

	mailer, err := email.NewMailer(cfg.Env, cfg.SMTP, log)
	if err != nil {
		return nil, fmt.Errorf("mailer: %w", err)
	}

	authRepo := authmod.NewRepository(pool)
	authSvc := authmod.NewService(authRepo, userRepo, tokens, cfg.JWTAccessTTL, mailer, cfg.FrontendURL)
	oidcSvc := authmod.NewOIDCService(authRepo, userRepo, authSvc, tokens, redisQ.Client(), cfg)
	authH := authmod.NewHandler(authSvc, oidcSvc, userRepo, cfg)

	playbackSigner := streamtoken.NewTokenSigner(cfg.JWTSecret, cfg.PlaybackTokenTTL)
	streamSvc := streaming.NewService(catalogRepo, s3, playbackSigner, redisQ.Client(), cfg.PlaybackSegmentTTL)
	streamH := streaming.NewHandler(streamSvc, catalogRepo, playbackSigner, cfg.PublicAPIBaseURL)
	adminH := admin.NewHandler(catalogRepo, userRepo, redisQ, streamSvc, playbackSigner)

	libRepo := library.NewRepository(pool)
	libH := library.NewHandler(libRepo, catalogRepo, recentStore)
	shareH := share.NewHandler(catalogRepo, libRepo, cfg.PublicAPIBaseURL, cfg.FrontendURL)

	creatorSvc := creator.NewService(catalogRepo, s3, redisQ)
	creatorH := creator.NewHandler(creatorSvc, rateLimiter, cfg.RateLimit.UploadInit)
	seedH := seed.NewHandler(userH, catalogH)

	r := chi.NewRouter()
	r.Use(httpserver.CORS(cfg.CORSOrigins))
	r.Use(httpserver.CommonMiddleware(log)...)
	if cfg.MetricsEnabled {
		r.Use(metrics.Middleware())
	}
	r.Get("/health/live", healthH.Live)
	r.Get("/health/ready", healthH.Ready)
	r.Get("/api/v1/openapi.yaml", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/yaml")
		_, _ = w.Write(api.OpenAPI)
	})
	r.Mount("/share", shareH.Routes())
	if cfg.MetricsEnabled {
		r.Handle("/metrics", metrics.Handler())
		go reportQueueDepth(ctx, redisQ, log)
		go reportReadiness(ctx, pool, redisQ, s3, log)
	}

	r.Route("/internal/seed", func(seedR chi.Router) {
		seedR.Use(platformauth.SeedGuard(cfg.Env, cfg.SeedSecret))
		seedR.Mount("/", seedH.Routes())
	})

	r.Route("/internal/admin", func(adminR chi.Router) {
		adminR.Use(admin.Guard(cfg.AdminSecret))
		adminR.Mount("/", adminH.Routes())
	})

	r.Route("/api/v1", func(api chi.Router) {
		api.Get("/", func(w http.ResponseWriter, _ *http.Request) {
			httpserver.JSON(w, http.StatusOK, map[string]string{
				"name":    "Gachify API",
				"version": "0.5.0",
				"tagline": "Deep Dark Fantasy, delivered at scale.",
			})
		})
		api.Mount("/auth", authH.Routes(tokens, rateLimiter, tokenBlacklist))
		api.Mount("/users", userH.Routes())
		api.Mount("/tracks", catalogH.Routes())
		api.Mount("/playlists", libH.PublicRoutes())
		api.Mount("/search", searchH.Routes())
		api.Mount("/stream", streamH.Routes())

		api.Group(func(me chi.Router) {
			me.Use(platformauth.Middleware(tokens, tokenBlacklist))
			me.Mount("/me", libH.Routes())
			me.Mount("/creator", creatorH.Routes())
		})
	})

	srv := &http.Server{
		Addr:         cfg.HTTPAddr,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return &App{cfg: cfg, log: log, pool: pool, server: srv, flushSentry: flushSentry}, nil
}

func (a *App) Run(ctx context.Context) error {
	a.log.Info("starting gachify api", "addr", a.cfg.HTTPAddr, "env", a.cfg.Env)

	errCh := make(chan error, 1)
	go func() {
		if err := a.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		return a.Shutdown(context.Background())
	case err := <-errCh:
		return err
	}
}

func (a *App) Shutdown(ctx context.Context) error {
	a.log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	if err := a.server.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("http shutdown: %w", err)
	}
	a.pool.Close()
	if a.flushSentry != nil {
		a.flushSentry()
	}
	return nil
}

package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gachify/gachify/internal/config"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/modules/push"
	"github.com/gachify/gachify/internal/modules/social"
	"github.com/gachify/gachify/internal/modules/users"
	"github.com/gachify/gachify/internal/platform/database"
	"github.com/gachify/gachify/internal/platform/metrics"
	"github.com/gachify/gachify/internal/platform/observability"
	"github.com/gachify/gachify/internal/platform/queue"
	"github.com/gachify/gachify/internal/platform/storage"
	"github.com/gachify/gachify/internal/worker"
	"github.com/redis/go-redis/v9"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config", "error", err)
		os.Exit(1)
	}

	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	flushSentry := observability.InitSentry(cfg.SentryDSN, cfg.Env, log)
	defer flushSentry()

	pool, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	q, err := queue.NewRedisQueue(cfg.RedisURL)
	if err != nil {
		log.Error("redis", "error", err)
		os.Exit(1)
	}
	defer q.Close()

	cat := catalog.NewRepository(pool)
	userRepo := users.NewRepository(pool)
	socialRepo := social.NewRepository(pool)
	pushRepo := push.NewRepository(pool)
	pushSvc := push.NewService(push.Config{
		VAPIDPublicKey:  cfg.VAPIDPublicKey,
		VAPIDPrivateKey: cfg.VAPIDPrivateKey,
		VAPIDSubject:    cfg.VAPIDSubject,
		FrontendURL:     cfg.FrontendURL,
	}, pushRepo)
	notify := social.NewPublishNotifier(socialRepo, userRepo, pushSvc)
	st, err := storage.NewClient(ctx, cfg)
	if err != nil {
		log.Error("s3", "error", err)
		os.Exit(1)
	}

	log.Info("transcode worker started",
		"queue", queue.TranscodeQueueKey,
		"processing", queue.TranscodeProcessingKey,
		"visibility", cfg.TranscodeVisibilityTimeout.String(),
		"max_attempts", cfg.TranscodeMaxAttempts,
		"concurrency", cfg.WorkerConcurrency,
	)

	var (
		wg          sync.WaitGroup
		activeJob   *queue.TranscodeJob
		activeJobMu sync.Mutex
	)

	workerCtx, cancelWorker := context.WithCancel(ctx)
	defer cancelWorker()

	go reportQueueDepth(ctx, q, log)
	go worker.RunScheduledPublishLoop(workerCtx, log, cat, notify)

	jobSlots := make(chan struct{}, cfg.WorkerConcurrency)

	for {
		select {
		case <-ctx.Done():
			log.Info("shutdown signal received, draining in-flight job")
			cancelWorker()
			done := make(chan struct{})
			go func() {
				wg.Wait()
				close(done)
			}()
			select {
			case <-done:
			case <-time.After(cfg.WorkerShutdownTimeout):
				log.Warn("shutdown timeout, re-queueing in-flight job if any")
				activeJobMu.Lock()
				job := activeJob
				activeJobMu.Unlock()
				if job != nil {
					if err := q.RequeueTranscode(context.Background(), *job); err != nil {
						log.Error("requeue on shutdown failed", "error", err)
					}
				}
			}
			log.Info("worker stopped")
			return
		default:
		}

		if err := q.PromoteReadyRetries(workerCtx); err != nil && workerCtx.Err() == nil {
			log.Warn("promote retries error", "error", err)
		}
		if err := q.ReclaimStaleProcessing(workerCtx); err != nil && workerCtx.Err() == nil {
			log.Warn("reclaim stale error", "error", err)
		}

		select {
		case jobSlots <- struct{}{}:
		case <-workerCtx.Done():
			continue
		}

		job, err := q.DequeueTranscode(workerCtx, 5*time.Second, cfg.TranscodeVisibilityTimeout)
		if err != nil {
			<-jobSlots
			if errors.Is(err, redis.Nil) || workerCtx.Err() != nil {
				continue
			}
			log.Warn("dequeue error", "error", err)
			continue
		}

		activeJobMu.Lock()
		activeJob = &job
		activeJobMu.Unlock()

		wg.Add(1)
		go func(job queue.TranscodeJob) {
			defer wg.Done()
			defer func() { <-jobSlots }()
			defer func() {
				activeJobMu.Lock()
				activeJob = nil
				activeJobMu.Unlock()
			}()

			runErr := worker.RunTranscodeJob(workerCtx, log, cat, st, q, job, cfg.ModerationEnabled, notify)
			_ = q.AckTranscode(context.Background(), job)
			if runErr != nil {
				observability.CaptureException(runErr)
				worker.HandleFailure(context.Background(), cat, q, cfg, job, runErr)
			}
		}(job)
	}
}

func reportQueueDepth(ctx context.Context, q *queue.RedisQueue, log *slog.Logger) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			depths, err := q.Depths(ctx)
			if err != nil {
				log.Warn("queue depth error", "error", err)
				continue
			}
			metrics.SetQueueDepth("pending", float64(depths.Pending))
			metrics.SetQueueDepth("processing", float64(depths.Processing))
			metrics.SetQueueDepth("retry", float64(depths.Retry))
			metrics.SetQueueDepth("dlq", float64(depths.DLQ))
		}
	}
}

package main

import (
	"context"
	"errors"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gachify/gachify/internal/config"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/platform/database"
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
		log.Fatalf("config: %v", err)
	}

	pool, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	q, err := queue.NewRedisQueue(cfg.RedisURL)
	if err != nil {
		log.Fatalf("redis: %v", err)
	}
	defer q.Close()

	cat := catalog.NewRepository(pool)
	st, err := storage.NewClient(ctx, cfg)
	if err != nil {
		log.Fatalf("s3: %v", err)
	}
	log.Printf("transcode worker started — queue=%s retry=%s dlq=%s max_attempts=%d",
		queue.TranscodeQueueKey, queue.TranscodeRetryQueueKey, queue.TranscodeDLQKey, cfg.TranscodeMaxAttempts)

	for {
		select {
		case <-ctx.Done():
			log.Println("shutting down worker")
			return
		default:
		}

		if err := q.PromoteReadyRetries(ctx); err != nil {
			log.Printf("promote retries error: %v", err)
		}

		job, err := q.DequeueTranscode(ctx, 5*time.Second)
		if err != nil {
			if errors.Is(err, redis.Nil) || ctx.Err() != nil {
				continue
			}
			log.Printf("dequeue error: %v", err)
			continue
		}

		log.Printf("processing track=%s job=%s", job.TrackID, job.JobID)
		if err := worker.RunTranscode(ctx, cat, st, job.TrackID, job.JobID); err != nil {
			worker.HandleFailure(ctx, cat, q, cfg, job, err)
		} else {
			log.Printf("transcode done track=%s", job.TrackID)
		}
	}
}

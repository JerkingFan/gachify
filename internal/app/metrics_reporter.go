package app

import (
	"context"
	"log/slog"
	"time"

	"github.com/gachify/gachify/internal/platform/metrics"
	"github.com/gachify/gachify/internal/platform/queue"
	"github.com/gachify/gachify/internal/platform/storage"
	"github.com/jackc/pgx/v5/pgxpool"
)

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
				log.Warn("queue depth metrics error", "error", err)
				continue
			}
			metrics.SetQueueDepth("pending", float64(depths.Pending))
			metrics.SetQueueDepth("processing", float64(depths.Processing))
			metrics.SetQueueDepth("retry", float64(depths.Retry))
			metrics.SetQueueDepth("dlq", float64(depths.DLQ))
		}
	}
}

func reportReadiness(ctx context.Context, pool *pgxpool.Pool, q *queue.RedisQueue, s3 *storage.Client, log *slog.Logger) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	check := func() bool {
		cctx, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		if err := pool.Ping(cctx); err != nil {
			return false
		}
		if err := q.Ping(cctx); err != nil {
			return false
		}
		if err := s3.Ping(cctx); err != nil {
			return false
		}
		return true
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			metrics.SetReady(check())
		}
	}
}

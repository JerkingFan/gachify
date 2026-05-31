package health

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/gachify/gachify/internal/platform/httpserver"
	"github.com/gachify/gachify/internal/platform/queue"
	"github.com/gachify/gachify/internal/platform/storage"
	"github.com/jackc/pgx/v5/pgxpool"
)

type dependencyCheck struct {
	name string
	fn   func(context.Context) error
}

type Handler struct {
	checks []dependencyCheck
}

func NewHandler(pool *pgxpool.Pool, redisQ *queue.RedisQueue, s3 *storage.Client) *Handler {
	return &Handler{
		checks: []dependencyCheck{
			{name: "database", fn: func(ctx context.Context) error { return pool.Ping(ctx) }},
			{name: "redis", fn: redisQ.Ping},
			{name: "storage", fn: s3.Ping},
		},
	}
}

func (h *Handler) Live(w http.ResponseWriter, _ *http.Request) {
	httpserver.JSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "gachify-api",
	})
}

func (h *Handler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	status := make(map[string]string, len(h.checks))
	allUp := true

	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, check := range h.checks {
		wg.Add(1)
		go func(c dependencyCheck) {
			defer wg.Done()
			state := "up"
			if err := c.fn(ctx); err != nil {
				state = "down"
				mu.Lock()
				allUp = false
				mu.Unlock()
			}
			mu.Lock()
			status[c.name] = state
			mu.Unlock()
		}(check)
	}
	wg.Wait()

	resp := map[string]string{"status": "ok"}
	for k, v := range status {
		resp[k] = v
	}
	if !allUp {
		resp["status"] = "degraded"
		httpserver.JSON(w, http.StatusServiceUnavailable, resp)
		return
	}
	httpserver.JSON(w, http.StatusOK, resp)
}

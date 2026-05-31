package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

const TranscodeQueueKey = "gachify:transcode:queue"

type TranscodeJob struct {
	TrackID   uuid.UUID `json:"track_id"`
	JobID     uuid.UUID `json:"job_id"`
	EnqueuedAt time.Time `json:"enqueued_at"`
}

type RedisQueue struct {
	client *redis.Client
}

func NewRedisQueue(redisURL string) (*RedisQueue, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	return &RedisQueue{client: redis.NewClient(opts)}, nil
}

func (q *RedisQueue) Ping(ctx context.Context) error {
	return q.client.Ping(ctx).Err()
}

func (q *RedisQueue) EnqueueTranscode(ctx context.Context, job TranscodeJob) error {
	raw, err := json.Marshal(job)
	if err != nil {
		return err
	}
	return q.client.LPush(ctx, TranscodeQueueKey, raw).Err()
}

func (q *RedisQueue) DequeueTranscode(ctx context.Context, timeout time.Duration) (TranscodeJob, error) {
	res, err := q.client.BRPop(ctx, timeout, TranscodeQueueKey).Result()
	if err != nil {
		return TranscodeJob{}, err
	}
	if len(res) < 2 {
		return TranscodeJob{}, fmt.Errorf("unexpected brpop response")
	}
	var job TranscodeJob
	if err := json.Unmarshal([]byte(res[1]), &job); err != nil {
		return TranscodeJob{}, err
	}
	return job, nil
}

func (q *RedisQueue) Close() error {
	return q.client.Close()
}

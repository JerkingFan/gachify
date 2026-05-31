package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

const (
	TranscodeQueueKey      = "gachify:transcode:queue"
	TranscodeRetryQueueKey = "gachify:transcode:retry"
	TranscodeDLQKey        = "gachify:transcode:dlq"
)

type TranscodeJob struct {
	TrackID    uuid.UUID `json:"track_id"`
	JobID      uuid.UUID `json:"job_id"`
	EnqueuedAt time.Time `json:"enqueued_at"`
}

type DLQEntry struct {
	Job      TranscodeJob `json:"job"`
	Error    string       `json:"error"`
	FailedAt time.Time    `json:"failed_at"`
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

func NewRedisQueueFromClient(client *redis.Client) *RedisQueue {
	return &RedisQueue{client: client}
}

func (q *RedisQueue) Ping(ctx context.Context) error {
	return q.client.Ping(ctx).Err()
}

func (q *RedisQueue) Client() *redis.Client {
	return q.client
}

func (q *RedisQueue) EnqueueTranscode(ctx context.Context, job TranscodeJob) error {
	raw, err := json.Marshal(job)
	if err != nil {
		return err
	}
	return q.client.LPush(ctx, TranscodeQueueKey, raw).Err()
}

func (q *RedisQueue) EnqueueTranscodeDelayed(ctx context.Context, job TranscodeJob, delay time.Duration) error {
	if delay < 0 {
		delay = 0
	}
	raw, err := json.Marshal(job)
	if err != nil {
		return err
	}
	score := float64(time.Now().Add(delay).Unix())
	return q.client.ZAdd(ctx, TranscodeRetryQueueKey, redis.Z{
		Score:  score,
		Member: raw,
	}).Err()
}

func (q *RedisQueue) PromoteReadyRetries(ctx context.Context) error {
	now := float64(time.Now().Unix())
	members, err := q.client.ZRangeByScore(ctx, TranscodeRetryQueueKey, &redis.ZRangeBy{
		Min: "-inf",
		Max: fmt.Sprintf("%f", now),
	}).Result()
	if err != nil {
		return err
	}
	for _, member := range members {
		pipe := q.client.Pipeline()
		pipe.LPush(ctx, TranscodeQueueKey, member)
		pipe.ZRem(ctx, TranscodeRetryQueueKey, member)
		if _, err := pipe.Exec(ctx); err != nil {
			return err
		}
	}
	return nil
}

func (q *RedisQueue) EnqueueDLQ(ctx context.Context, job TranscodeJob, errMsg string) error {
	entry := DLQEntry{
		Job:      job,
		Error:    errMsg,
		FailedAt: time.Now().UTC(),
	}
	raw, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	return q.client.LPush(ctx, TranscodeDLQKey, raw).Err()
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

// RetryDelay returns exponential backoff for attempt N (1-based).
func RetryDelay(base time.Duration, attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	delay := base
	for i := 1; i < attempt; i++ {
		delay *= 2
	}
	const maxDelay = 30 * time.Minute
	if delay > maxDelay {
		return maxDelay
	}
	return delay
}

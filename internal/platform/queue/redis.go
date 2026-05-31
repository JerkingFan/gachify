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
	TranscodeQueueKey        = "gachify:transcode:queue"
	TranscodeProcessingKey   = "gachify:transcode:processing"
	TranscodeRetryQueueKey   = "gachify:transcode:retry"
	TranscodeDLQKey          = "gachify:transcode:dlq"
	HLSKeyPrefix             = "gachify:stream:hlskey"
)

type TranscodeJob struct {
	TrackID    uuid.UUID `json:"track_id"`
	JobID      uuid.UUID `json:"job_id"`
	EnqueuedAt time.Time `json:"enqueued_at"`
	RequestID  string    `json:"request_id,omitempty"`
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

func (q *RedisQueue) ReclaimStaleProcessing(ctx context.Context) error {
	now := float64(time.Now().Unix())
	members, err := q.client.ZRangeByScore(ctx, TranscodeProcessingKey, &redis.ZRangeBy{
		Min: "-inf",
		Max: fmt.Sprintf("%f", now),
	}).Result()
	if err != nil {
		return err
	}
	for _, member := range members {
		pipe := q.client.Pipeline()
		pipe.LPush(ctx, TranscodeQueueKey, member)
		pipe.ZRem(ctx, TranscodeProcessingKey, member)
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

// DequeueTranscode pops a job and marks it in the processing set with a visibility deadline.
func (q *RedisQueue) DequeueTranscode(ctx context.Context, timeout, visibility time.Duration) (TranscodeJob, error) {
	if visibility <= 0 {
		visibility = 30 * time.Minute
	}
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
	deadline := float64(time.Now().Add(visibility).Unix())
	if err := q.client.ZAdd(ctx, TranscodeProcessingKey, redis.Z{
		Score:  deadline,
		Member: res[1],
	}).Err(); err != nil {
		_ = q.client.LPush(ctx, TranscodeQueueKey, res[1]).Err()
		return TranscodeJob{}, err
	}
	return job, nil
}

func (q *RedisQueue) AckTranscode(ctx context.Context, job TranscodeJob) error {
	raw, err := json.Marshal(job)
	if err != nil {
		return err
	}
	return q.client.ZRem(ctx, TranscodeProcessingKey, raw).Err()
}

func (q *RedisQueue) RequeueTranscode(ctx context.Context, job TranscodeJob) error {
	if err := q.AckTranscode(ctx, job); err != nil {
		return err
	}
	return q.EnqueueTranscode(ctx, job)
}

type QueueDepths struct {
	Pending    int64
	Processing int64
	Retry      int64
	DLQ        int64
}

func (q *RedisQueue) Depths(ctx context.Context) (QueueDepths, error) {
	pending, err := q.client.LLen(ctx, TranscodeQueueKey).Result()
	if err != nil {
		return QueueDepths{}, err
	}
	processing, err := q.client.ZCard(ctx, TranscodeProcessingKey).Result()
	if err != nil {
		return QueueDepths{}, err
	}
	retry, err := q.client.ZCard(ctx, TranscodeRetryQueueKey).Result()
	if err != nil {
		return QueueDepths{}, err
	}
	dlq, err := q.client.LLen(ctx, TranscodeDLQKey).Result()
	if err != nil {
		return QueueDepths{}, err
	}
	return QueueDepths{Pending: pending, Processing: processing, Retry: retry, DLQ: dlq}, nil
}

func (q *RedisQueue) StoreHLSKey(ctx context.Context, trackID uuid.UUID, key []byte) error {
	if len(key) == 0 {
		return nil
	}
	return q.client.Set(ctx, HLSKeyPrefix+":"+trackID.String(), key, 0).Err()
}

func (q *RedisQueue) Close() error {
	return q.client.Close()
}

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

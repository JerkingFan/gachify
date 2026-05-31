package queue

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

func newTestQueue(t *testing.T) (*RedisQueue, *miniredis.Miniredis) {
	t.Helper()
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	return NewRedisQueueFromClient(client), mr
}

func TestEnqueueDequeueTranscode(t *testing.T) {
	q, mr := newTestQueue(t)
	defer mr.Close()
	ctx := context.Background()

	job := TranscodeJob{
		TrackID:    uuid.New(),
		JobID:      uuid.New(),
		EnqueuedAt: time.Now().UTC(),
	}
	if err := q.EnqueueTranscode(ctx, job); err != nil {
		t.Fatal(err)
	}
	got, err := q.DequeueTranscode(ctx, time.Second, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if got.TrackID != job.TrackID || got.JobID != job.JobID {
		t.Fatalf("job mismatch: %+v vs %+v", got, job)
	}
}

func TestPromoteReadyRetries(t *testing.T) {
	q, mr := newTestQueue(t)
	defer mr.Close()
	ctx := context.Background()
	job := TranscodeJob{TrackID: uuid.New(), JobID: uuid.New(), EnqueuedAt: time.Now().UTC()}

	if err := q.EnqueueTranscodeDelayed(ctx, job, 0); err != nil {
		t.Fatal(err)
	}
	if err := q.PromoteReadyRetries(ctx); err != nil {
		t.Fatal(err)
	}
	got, err := q.DequeueTranscode(ctx, time.Second, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if got.JobID != job.JobID {
		t.Fatalf("expected promoted job %s, got %s", job.JobID, got.JobID)
	}
}

func TestEnqueueDLQ(t *testing.T) {
	q, mr := newTestQueue(t)
	defer mr.Close()
	ctx := context.Background()
	job := TranscodeJob{TrackID: uuid.New(), JobID: uuid.New()}
	if err := q.EnqueueDLQ(ctx, job, "ffmpeg failed"); err != nil {
		t.Fatal(err)
	}
	raw, err := mr.Lpop(TranscodeDLQKey)
	if err != nil {
		t.Fatal(err)
	}
	var entry DLQEntry
	if err := json.Unmarshal([]byte(raw), &entry); err != nil {
		t.Fatal(err)
	}
	if entry.Error != "ffmpeg failed" {
		t.Fatalf("unexpected dlq error: %s", entry.Error)
	}
}

func TestRetryDelay(t *testing.T) {
	base := 30 * time.Second
	if RetryDelay(base, 1) != 30*time.Second {
		t.Fatal("attempt 1 delay")
	}
	if RetryDelay(base, 2) != 60*time.Second {
		t.Fatal("attempt 2 delay")
	}
	if RetryDelay(base, 3) != 120*time.Second {
		t.Fatal("attempt 3 delay")
	}
}

func TestRetryDLQJob(t *testing.T) {
	q, mr := newTestQueue(t)
	defer mr.Close()
	ctx := context.Background()
	job := TranscodeJob{TrackID: uuid.New(), JobID: uuid.New()}
	if err := q.EnqueueDLQ(ctx, job, "boom"); err != nil {
		t.Fatal(err)
	}
	got, err := q.RetryDLQJob(ctx, job.TrackID)
	if err != nil {
		t.Fatal(err)
	}
	if got.TrackID != job.TrackID {
		t.Fatalf("track id mismatch")
	}
	depths, err := q.Depths(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if depths.DLQ != 0 {
		t.Fatal("dlq should be empty")
	}
	if depths.Pending != 1 {
		t.Fatalf("job should be requeued, pending=%d", depths.Pending)
	}
	_, err = q.RetryDLQJob(ctx, uuid.New())
	if err != ErrDLQNotFound {
		t.Fatalf("expected ErrDLQNotFound, got %v", err)
	}
}

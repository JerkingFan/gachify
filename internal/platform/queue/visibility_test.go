package queue

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestDequeueVisibilityAndAck(t *testing.T) {
	q, mr := newTestQueue(t)
	defer mr.Close()
	ctx := context.Background()

	job := TranscodeJob{TrackID: uuid.New(), JobID: uuid.New(), EnqueuedAt: time.Now().UTC()}
	if err := q.EnqueueTranscode(ctx, job); err != nil {
		t.Fatal(err)
	}

	got, err := q.DequeueTranscode(ctx, time.Second, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if got.JobID != job.JobID {
		t.Fatalf("job mismatch")
	}
	depths, err := q.Depths(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if depths.Processing != 1 {
		t.Fatalf("expected 1 processing, got %d", depths.Processing)
	}

	if err := q.AckTranscode(ctx, got); err != nil {
		t.Fatal(err)
	}
	depths, err = q.Depths(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if depths.Processing != 0 {
		t.Fatalf("expected processing cleared")
	}
}

func TestReclaimStaleProcessing(t *testing.T) {
	q, mr := newTestQueue(t)
	defer mr.Close()
	ctx := context.Background()

	job := TranscodeJob{TrackID: uuid.New(), JobID: uuid.New()}
	raw, err := json.Marshal(job)
	if err != nil {
		t.Fatal(err)
	}
	mr.ZAdd(TranscodeProcessingKey, float64(time.Now().Add(-time.Minute).Unix()), string(raw))

	if err := q.ReclaimStaleProcessing(ctx); err != nil {
		t.Fatal(err)
	}
	got, err := q.DequeueTranscode(ctx, time.Second, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if got.JobID != job.JobID {
		t.Fatalf("expected reclaimed job")
	}
}

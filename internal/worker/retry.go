package worker

import (
	"context"
	"log"

	"github.com/gachify/gachify/internal/config"
	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/platform/queue"
)

// HandleFailure schedules a retry with backoff or moves the job to the dead-letter queue.
func HandleFailure(ctx context.Context, cat *catalog.Repository, q *queue.RedisQueue, cfg config.Config, job queue.TranscodeJob, runErr error) {
	errMsg := runErr.Error()
	jobRow, err := cat.GetTranscodeJob(ctx, job.JobID)
	if err != nil {
		log.Printf("transcode failure lookup failed job=%s: %v (original: %v)", job.JobID, err, runErr)
		_ = cat.MarkJobFailed(ctx, job.JobID, errMsg)
		_ = cat.UpdateStatus(ctx, job.TrackID, domain.TrackDraft, &errMsg)
		_ = q.EnqueueDLQ(ctx, job, errMsg)
		return
	}

	if jobRow.Attempts < cfg.TranscodeMaxAttempts {
		if err := cat.ResetJobPending(ctx, job.JobID, errMsg); err != nil {
			log.Printf("transcode retry reset failed job=%s: %v", job.JobID, err)
		}
		_ = cat.UpdateStatus(ctx, job.TrackID, domain.TrackProcessing, &errMsg)
		delay := queue.RetryDelay(cfg.TranscodeRetryBase, jobRow.Attempts)
		if err := q.EnqueueTranscodeDelayed(ctx, job, delay); err != nil {
			log.Printf("transcode retry enqueue failed job=%s: %v", job.JobID, err)
		} else {
			log.Printf("transcode retry scheduled track=%s job=%s attempt=%d delay=%s: %v",
				job.TrackID, job.JobID, jobRow.Attempts, delay, runErr)
		}
		return
	}

	_ = cat.MarkJobFailed(ctx, job.JobID, errMsg)
	_ = cat.UpdateStatus(ctx, job.TrackID, domain.TrackDraft, &errMsg)
	if err := q.EnqueueDLQ(ctx, job, errMsg); err != nil {
		log.Printf("transcode dlq enqueue failed job=%s: %v", job.JobID, err)
	} else {
		log.Printf("transcode dead-lettered track=%s job=%s after %d attempts: %v",
			job.TrackID, job.JobID, jobRow.Attempts, runErr)
	}
}

package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/platform/metrics"
	"github.com/gachify/gachify/internal/platform/observability"
	"github.com/gachify/gachify/internal/platform/queue"
	"github.com/gachify/gachify/internal/platform/storage"
	"github.com/gachify/gachify/internal/platform/trace"
	"github.com/gachify/gachify/internal/platform/transcode"
	"github.com/google/uuid"
)

func RunTranscode(ctx context.Context, cat *catalog.Repository, st *storage.Client, q *queue.RedisQueue, trackID, jobID uuid.UUID, moderationEnabled bool) error {
	start := time.Now()
	if err := cat.MarkJobRunning(ctx, jobID); err != nil {
		return err
	}

	track, err := cat.GetByID(ctx, trackID)
	if err != nil {
		return err
	}
	if track.MasterObjectKey == nil || *track.MasterObjectKey == "" {
		return fmt.Errorf("missing master object key")
	}

	tmp, err := os.MkdirTemp("", "gachify-transcode-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmp)

	ext := ".audio"
	if track.SourceFilename != nil && *track.SourceFilename != "" {
		ext = filepath.Ext(*track.SourceFilename)
		if ext == "" {
			ext = ".audio"
		}
	}
	inputPath := filepath.Join(tmp, "source"+ext)
	if err := st.DownloadToFile(ctx, *track.MasterObjectKey, inputPath); err != nil {
		return err
	}

	meta := map[string]any{}
	if len(track.GachiMetadata) > 0 {
		_ = json.Unmarshal(track.GachiMetadata, &meta)
	}
	if analyzed, err := runGachiAnalyzer(ctx, slog.Default(), inputPath); err != nil {
		slog.Warn("gachi analyzer skipped", "track_id", trackID, "error", err)
		meta["analyzer_skipped"] = true
		meta["analyzer_error"] = err.Error()
	} else if len(analyzed) > 0 {
		meta = mergeMetadata(meta, analyzed)
		delete(meta, "analyzer_skipped")
		delete(meta, "analyzer_error")
	}

	hlsDir := filepath.Join(tmp, "hls")
	result, err := transcode.TranscodeToHLS(ctx, inputPath, hlsDir)
	if err != nil {
		observability.CaptureException(err)
		return err
	}

	prefix := transcode.PrefixKey(trackID.String())
	if err := st.UploadDirectory(ctx, hlsDir, prefix); err != nil {
		return err
	}

	if q != nil && len(result.AESKey) > 0 {
		if err := q.StoreHLSKey(ctx, trackID, result.AESKey); err != nil {
			return fmt.Errorf("store hls key: %w", err)
		}
	}

	manifestKey := transcode.ManifestObjectKey(trackID.String())
	meta["hls"] = map[string]any{
		"manifest_key": manifestKey,
		"prefix":       prefix,
		"encrypted":    true,
		"variants":     []string{"64k", "128k", "256k"},
	}
	meta["transcoded"] = true
	meta["transcode_engine"] = transcode.HLSEngineVersion
	delete(meta, "preview_url")
	raw, _ := json.Marshal(meta)

	if result.DurationMs > 0 {
		_ = cat.UpdateDuration(ctx, trackID, result.DurationMs)
	}
	if err := cat.UpdateGachiMetadata(ctx, trackID, raw); err != nil {
		return err
	}
	publishStatus := domain.TrackPublished
	if moderationEnabled {
		publishStatus = domain.TrackPendingReview
	}
	if err := cat.UpdateStatus(ctx, trackID, publishStatus, nil); err != nil {
		return err
	}
	metrics.ObserveTranscode(time.Since(start))
	return cat.MarkJobCompleted(ctx, jobID)
}

func RunTranscodeJob(ctx context.Context, log *slog.Logger, cat *catalog.Repository, st *storage.Client, q *queue.RedisQueue, job queue.TranscodeJob, moderationEnabled bool) error {
	ctx = trace.WithRequestID(ctx, job.RequestID)
	log = log.With("track_id", job.TrackID, "job_id", job.JobID, "request_id", trace.RequestIDFromContext(ctx))
	log.Info("transcode started")
	err := RunTranscode(ctx, cat, st, q, job.TrackID, job.JobID, moderationEnabled)
	if err != nil {
		log.Error("transcode failed", "error", err)
		return err
	}
	log.Info("transcode completed")
	return nil
}

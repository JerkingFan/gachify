package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/platform/storage"
	"github.com/gachify/gachify/internal/platform/transcode"
	"github.com/google/uuid"
)

func RunTranscode(ctx context.Context, cat *catalog.Repository, st *storage.Client, trackID, jobID uuid.UUID) error {
	if err := cat.MarkJobRunning(ctx, jobID); err != nil {
		return err
	}

	track, err := cat.GetByID(ctx, trackID)
	if err != nil {
		_ = cat.MarkJobFailed(ctx, jobID, err.Error())
		return err
	}
	if track.MasterObjectKey == nil || *track.MasterObjectKey == "" {
		errMsg := "missing master object key"
		_ = cat.MarkJobFailed(ctx, jobID, errMsg)
		_ = cat.UpdateStatus(ctx, trackID, domain.TrackDraft, &errMsg)
		return fmt.Errorf(errMsg)
	}

	tmp, err := os.MkdirTemp("", "gachify-transcode-*")
	if err != nil {
		return failJob(ctx, cat, jobID, trackID, err)
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
		return failJob(ctx, cat, jobID, trackID, err)
	}

	hlsDir := filepath.Join(tmp, "hls")
	result, err := transcode.TranscodeToHLS(ctx, inputPath, hlsDir)
	if err != nil {
		return failJob(ctx, cat, jobID, trackID, err)
	}

	prefix := transcode.PrefixKey(trackID.String())
	if err := st.UploadDirectory(ctx, hlsDir, prefix); err != nil {
		return failJob(ctx, cat, jobID, trackID, err)
	}

	manifestKey := transcode.ManifestObjectKey(trackID.String())
	meta := map[string]any{}
	if len(track.GachiMetadata) > 0 {
		_ = json.Unmarshal(track.GachiMetadata, &meta)
	}
	meta["hls"] = map[string]any{
		"manifest_key": manifestKey,
		"prefix":       prefix,
	}
	meta["transcoded"] = true
	meta["transcode_engine"] = "ffmpeg-hls-v1"
	delete(meta, "preview_url") // prefer HLS
	raw, _ := json.Marshal(meta)

	if result.DurationMs > 0 {
		_ = cat.UpdateDuration(ctx, trackID, result.DurationMs)
	}
	if err := cat.UpdateGachiMetadata(ctx, trackID, raw); err != nil {
		return failJob(ctx, cat, jobID, trackID, err)
	}
	if err := cat.UpdateStatus(ctx, trackID, domain.TrackPublished, nil); err != nil {
		return failJob(ctx, cat, jobID, trackID, err)
	}
	return cat.MarkJobCompleted(ctx, jobID)
}

func failJob(ctx context.Context, cat *catalog.Repository, jobID, trackID uuid.UUID, err error) error {
	msg := err.Error()
	_ = cat.MarkJobFailed(ctx, jobID, msg)
	_ = cat.UpdateStatus(ctx, trackID, domain.TrackDraft, &msg)
	return err
}

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

	hlsDir := filepath.Join(tmp, "hls")
	result, err := transcode.TranscodeToHLS(ctx, inputPath, hlsDir)
	if err != nil {
		return err
	}

	prefix := transcode.PrefixKey(trackID.String())
	if err := st.UploadDirectory(ctx, hlsDir, prefix); err != nil {
		return err
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
	delete(meta, "preview_url")
	raw, _ := json.Marshal(meta)

	if result.DurationMs > 0 {
		_ = cat.UpdateDuration(ctx, trackID, result.DurationMs)
	}
	if err := cat.UpdateGachiMetadata(ctx, trackID, raw); err != nil {
		return err
	}
	if err := cat.UpdateStatus(ctx, trackID, domain.TrackPublished, nil); err != nil {
		return err
	}
	return cat.MarkJobCompleted(ctx, jobID)
}

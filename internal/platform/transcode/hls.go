package transcode

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type HLSResult struct {
	OutputDir    string
	ManifestName string
	ManifestKey  string
	DurationMs   int
}

// TranscodeToHLS runs ffmpeg to produce a single-bitrate HLS VOD package in destDir.
func TranscodeToHLS(ctx context.Context, inputPath, destDir string) (HLSResult, error) {
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return HLSResult{}, err
	}
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return HLSResult{}, fmt.Errorf("ffmpeg not found in PATH: install ffmpeg for HLS transcoding")
	}

	manifestName := "master.m3u8"
	segmentPattern := filepath.Join(destDir, "seg_%03d.ts")
	manifestPath := filepath.Join(destDir, manifestName)

	args := []string{
		"-y", "-i", inputPath,
		"-codec:a", "aac",
		"-b:a", "128k",
		"-ac", "2",
		"-ar", "44100",
		"-f", "hls",
		"-hls_time", "6",
		"-hls_playlist_type", "vod",
		"-hls_segment_filename", segmentPattern,
		"-hls_flags", "independent_segments",
		manifestPath,
	}
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return HLSResult{}, fmt.Errorf("ffmpeg: %w: %s", err, truncate(string(out), 500))
	}

	durationMs, _ := probeDurationMs(ctx, inputPath)

	return HLSResult{
		OutputDir:    destDir,
		ManifestName: manifestName,
		DurationMs:   durationMs,
	}, nil
}

func probeDurationMs(ctx context.Context, inputPath string) (int, error) {
	if _, err := exec.LookPath("ffprobe"); err != nil {
		return 0, err
	}
	cmd := exec.CommandContext(ctx, "ffprobe",
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		inputPath,
	)
	out, err := cmd.Output()
	if err != nil {
		return 0, err
	}
	sec, err := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	if err != nil {
		return 0, err
	}
	return int(sec * 1000), nil
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

// PrefixKey builds the S3 key prefix for a track's HLS package.
func PrefixKey(trackID string) string {
	return fmt.Sprintf("hls/%s", trackID)
}

func ManifestObjectKey(trackID string) string {
	return PrefixKey(trackID) + "/master.m3u8"
}

// UploadSleep is a tiny hook for tests; production uses immediate upload.
var UploadSleep = 0 * time.Millisecond

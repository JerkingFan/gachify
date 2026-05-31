package transcode

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	HLSEngineVersion     = "ffmpeg-hls-v2-abr-aes"
	HLSKeyURIPlaceholder = "__GACHIFY_HLS_KEY_URI__"
)

type HLSResult struct {
	OutputDir    string
	ManifestName string
	DurationMs   int
	AESKey       []byte
	AESIV        []byte
}

type audioVariant struct {
	Name      string
	Bitrate   string
	Bandwidth int
}

var audioVariants = []audioVariant{
	{Name: "64k", Bitrate: "64k", Bandwidth: 64000},
	{Name: "128k", Bitrate: "128k", Bandwidth: 128000},
	{Name: "256k", Bitrate: "256k", Bandwidth: 256000},
}

// TranscodeToHLS runs ffmpeg to produce a multi-bitrate AES-128 encrypted HLS VOD package.
func TranscodeToHLS(ctx context.Context, inputPath, destDir string) (HLSResult, error) {
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return HLSResult{}, err
	}
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return HLSResult{}, fmt.Errorf("ffmpeg not found in PATH: install ffmpeg for HLS transcoding")
	}

	key := make([]byte, 16)
	iv := make([]byte, 16)
	if _, err := rand.Read(key); err != nil {
		return HLSResult{}, fmt.Errorf("generate aes key: %w", err)
	}
	if _, err := rand.Read(iv); err != nil {
		return HLSResult{}, fmt.Errorf("generate aes iv: %w", err)
	}

	keyPath := filepath.Join(destDir, "encrypt.key")
	keyInfoPath := filepath.Join(destDir, "keyinfo.txt")
	if err := os.WriteFile(keyPath, key, 0o600); err != nil {
		return HLSResult{}, err
	}
	ivHex := hex.EncodeToString(iv)
	// FFmpeg keyinfo: line 1 = key URI in playlist, line 2 = local key file path, line 3 = IV (hex).
	keyInfo := fmt.Sprintf("%s\n%s\n%s\n", HLSKeyURIPlaceholder, keyPath, ivHex)
	if err := os.WriteFile(keyInfoPath, []byte(keyInfo), 0o600); err != nil {
		return HLSResult{}, err
	}

	for _, v := range audioVariants {
		variantDir := filepath.Join(destDir, v.Name)
		if err := os.MkdirAll(variantDir, 0o755); err != nil {
			return HLSResult{}, err
		}
		segmentPattern := filepath.Join(variantDir, "seg_%03d.ts")
		playlistPath := filepath.Join(variantDir, "playlist.m3u8")
		args := []string{
			"-y", "-i", inputPath,
			"-codec:a", "aac",
			"-b:a", v.Bitrate,
			"-ac", "2",
			"-ar", "44100",
			"-f", "hls",
			"-hls_time", "6",
			"-hls_playlist_type", "vod",
			"-hls_key_info_file", keyInfoPath,
			"-hls_segment_filename", segmentPattern,
			"-hls_flags", "independent_segments",
			playlistPath,
		}
		cmd := exec.CommandContext(ctx, "ffmpeg", args...)
		out, err := cmd.CombinedOutput()
		if err != nil {
			return HLSResult{}, fmt.Errorf("ffmpeg %s: %w: %s", v.Name, err, truncate(string(out), 800))
		}
	}

	manifestName := "master.m3u8"
	masterPath := filepath.Join(destDir, manifestName)
	var master strings.Builder
	master.WriteString("#EXTM3U\n")
	master.WriteString("#EXT-X-VERSION:6\n")
	for _, v := range audioVariants {
		master.WriteString(fmt.Sprintf("#EXT-X-STREAM-INF:BANDWIDTH=%d,CODECS=\"mp4a.40.2\"\n", v.Bandwidth))
		master.WriteString(v.Name + "/playlist.m3u8\n")
	}
	if err := os.WriteFile(masterPath, []byte(master.String()), 0o644); err != nil {
		return HLSResult{}, err
	}

	_ = os.Remove(keyPath)
	_ = os.Remove(keyInfoPath)

	durationMs, _ := probeDurationMs(ctx, inputPath)

	return HLSResult{
		OutputDir:    destDir,
		ManifestName: manifestName,
		DurationMs:   durationMs,
		AESKey:       key,
		AESIV:        iv,
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
	// FFmpeg prints its banner first; keep the tail where the actual error lives.
	if max > 20 && len(s) > max {
		return "…" + s[len(s)-max+1:]
	}
	return s[:max] + "…"
}

func PrefixKey(trackID string) string {
	return fmt.Sprintf("hls/%s", trackID)
}

func ManifestObjectKey(trackID string) string {
	return PrefixKey(trackID) + "/master.m3u8"
}

var UploadSleep = 0 * time.Millisecond

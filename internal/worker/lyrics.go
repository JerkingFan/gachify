package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/gachify/gachify/internal/platform/lyrics"
)

func lyricsEnabled() bool {
	return analyzerEnabled()
}

func pendingLRCText(meta map[string]any) string {
	if meta == nil {
		return ""
	}
	if v, ok := meta["lyrics_lrc"].(string); ok {
		return v
	}
	return ""
}

func runLyricsExtract(ctx context.Context, log *slog.Logger, inputPath string, meta map[string]any) (map[string]any, error) {
	if !lyricsEnabled() {
		return nil, nil
	}

	root := analyzerRoot()
	script := filepath.Join(root, "extract_lyrics.py")
	if _, err := os.Stat(script); err != nil {
		return nil, fmt.Errorf("lyrics script missing: %w", err)
	}

	outPath := filepath.Join(filepath.Dir(inputPath), "lyrics.json")
	lrcText := pendingLRCText(meta)

	extractCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(
		extractCtx,
		analyzerPython(),
		script,
		"--input", inputPath,
		"--lrc-text", lrcText,
		"--out", outPath,
	)
	cmd.Env = append(os.Environ(), "PYTHONPATH="+root)
	cmd.Dir = root

	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("lyrics extract: %w: %s", err, strings.TrimSpace(string(out)))
	}

	raw, err := os.ReadFile(outPath)
	if err != nil {
		return nil, err
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}

	// Fallback: parse LRC in Go if Python returned empty but user uploaded text.
	if lines, _ := doc["lines"].([]any); len(lines) == 0 && lrcText != "" {
		parsed := lyrics.ParseLRC(lrcText)
		if len(parsed.Lines) > 0 {
			b, _ := json.Marshal(parsed)
			_ = json.Unmarshal(b, &doc)
			doc["source"] = "upload"
		}
	}

	delete(meta, "lyrics_lrc")
	n := lyricLineCount(doc)
	if n > 0 || doc["source"] != "none" {
		meta["lyrics"] = doc
		log.Info("lyrics extracted", "lines", n, "source", doc["source"])
	}
	return meta, nil
}

func lyricLineCount(doc map[string]any) int {
	lines, ok := doc["lines"].([]any)
	if !ok {
		return 0
	}
	return len(lines)
}

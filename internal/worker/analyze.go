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
)

const (
	analyzerModuleFlag = "GACHIFY_ANALYZER_ENABLED"
	analyzerPythonFlag = "GACHIFY_ANALYZER_PYTHON"
	analyzerRootFlag   = "GACHIFY_ANALYZER_ROOT"
)

// analyzerEnabled reports whether the transcode worker should run gachi_analyzer.
func analyzerEnabled() bool {
	v := strings.TrimSpace(os.Getenv(analyzerModuleFlag))
	if v == "" {
		return false
	}
	return v == "1" || strings.EqualFold(v, "true") || strings.EqualFold(v, "yes")
}

func analyzerPython() string {
	if p := strings.TrimSpace(os.Getenv(analyzerPythonFlag)); p != "" {
		return p
	}
	return "python3"
}

func analyzerRoot() string {
	if r := strings.TrimSpace(os.Getenv(analyzerRootFlag)); r != "" {
		return r
	}
	return "/opt/gachify-analyzer"
}

// runGachiAnalyzer executes gachi_analyzer on the local master file and returns gachi_metadata fields.
func runGachiAnalyzer(ctx context.Context, log *slog.Logger, inputPath string) (map[string]any, error) {
	if !analyzerEnabled() {
		log.Info("gachi analyzer disabled",
			"hint", "set GACHIFY_ANALYZER_ENABLED=true and rebuild worker image with Python venv")
		return nil, nil
	}

	log.Info("gachi analyzer starting", "input", filepath.Base(inputPath))

	outPath := filepath.Join(filepath.Dir(inputPath), "gachi_analysis.json")
	mapPath := filepath.Join(filepath.Dir(inputPath), "gachi_metadata.json")

	root := analyzerRoot()
	analyzeScript := filepath.Join(root, "run_analyze.py")
	if _, err := os.Stat(analyzeScript); err != nil {
		return nil, fmt.Errorf("analyzer not installed at %s: %w", root, err)
	}

	analyzeCtx, cancel := context.WithTimeout(ctx, 15*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(
		analyzeCtx,
		analyzerPython(),
		analyzeScript,
		"--input", inputPath,
		"--analysis-out", outPath,
		"--metadata-out", mapPath,
	)
	cmd.Env = append(os.Environ(), "PYTHONPATH="+root)
	cmd.Dir = root

	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("gachi_analyzer: %w: %s", err, strings.TrimSpace(string(out)))
	}

	raw, err := os.ReadFile(mapPath)
	if err != nil {
		return nil, fmt.Errorf("read metadata map: %w", err)
	}
	var meta map[string]any
	if err := json.Unmarshal(raw, &meta); err != nil {
		return nil, fmt.Errorf("parse metadata map: %w", err)
	}
	log.Info("gachi analyzer completed", "fields", len(meta))
	return meta, nil
}

// mergeMetadata overlays analyzer fields onto existing upload metadata (HLS block preserved later).
func mergeMetadata(existing map[string]any, analyzed map[string]any) map[string]any {
	if existing == nil {
		existing = map[string]any{}
	}
	for k, v := range analyzed {
		existing[k] = v
	}
	return existing
}

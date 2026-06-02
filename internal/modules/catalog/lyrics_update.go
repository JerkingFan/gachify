package catalog

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/platform/lyrics"
	"github.com/google/uuid"
)

func (r *Repository) UpdateOwnedLyricsLRC(ctx context.Context, trackID, creatorID uuid.UUID, lrc string) (domain.Track, error) {
	track, err := r.GetOwned(ctx, trackID, creatorID)
	if err != nil {
		return domain.Track{}, err
	}
	switch track.Status {
	case domain.TrackDraft, domain.TrackProcessing, domain.TrackPendingReview, domain.TrackPublished:
	default:
		return domain.Track{}, ErrNotFound
	}

	meta := map[string]any{}
	if len(track.GachiMetadata) > 0 {
		_ = json.Unmarshal(track.GachiMetadata, &meta)
	}
	lrc = trimLyricsLRC(lrc)
	if lrc == "" {
		delete(meta, "lyrics_lrc")
		delete(meta, "lyrics")
	} else {
		meta["lyrics_lrc"] = lrc
		doc := lyrics.ParseLRC(lrc)
		lines := make([]map[string]any, 0, len(doc.Lines))
		for _, ln := range doc.Lines {
			lines = append(lines, map[string]any{
				"start_ms": ln.StartMs,
				"text":     ln.Text,
			})
		}
		meta["lyrics"] = map[string]any{
			"lines":  lines,
			"format": doc.Format,
			"source": doc.Source,
		}
	}
	raw, err := json.Marshal(meta)
	if err != nil {
		return domain.Track{}, fmt.Errorf("marshal metadata: %w", err)
	}
	if err := r.UpdateGachiMetadata(ctx, trackID, raw); err != nil {
		return domain.Track{}, err
	}
	return r.GetOwned(ctx, trackID, creatorID)
}

func trimLyricsLRC(s string) string {
	const maxLen = 64_000
	s = strings.TrimSpace(s)
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen]
}

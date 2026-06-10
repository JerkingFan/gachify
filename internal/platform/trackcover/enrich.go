package trackcover

import (
	"context"
	"encoding/json"
	"time"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/platform/storage"
)

const PresignTTL = 24 * time.Hour

// Enrich sets gachi_metadata.cover_url from a presigned GET when cover_object_key is set.
func Enrich(ctx context.Context, st *storage.Client, t *domain.Track) {
	if st == nil || t == nil || t.CoverObjectKey == nil || *t.CoverObjectKey == "" {
		return
	}
	url, err := st.PresignGet(ctx, *t.CoverObjectKey, PresignTTL)
	if err != nil {
		return
	}
	t.GachiMetadata = mergeCoverURL(t.GachiMetadata, url)
}

func EnrichSlice(ctx context.Context, st *storage.Client, tracks []domain.Track) {
	for i := range tracks {
		Enrich(ctx, st, &tracks[i])
	}
}

func EnrichWithCreatorSlice(ctx context.Context, st *storage.Client, tracks []domain.TrackWithCreator) {
	for i := range tracks {
		Enrich(ctx, st, &tracks[i].Track)
	}
}

func EnrichChartSlice(ctx context.Context, st *storage.Client, tracks []domain.ChartTrack) {
	for i := range tracks {
		Enrich(ctx, st, &tracks[i].Track)
	}
}

func mergeCoverURL(meta json.RawMessage, url string) json.RawMessage {
	m := map[string]any{}
	if len(meta) > 0 {
		_ = json.Unmarshal(meta, &m)
	}
	m["cover_url"] = url
	b, err := json.Marshal(m)
	if err != nil {
		return meta
	}
	return b
}

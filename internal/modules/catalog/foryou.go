package catalog

import (
	"context"

	"github.com/gachify/gachify/internal/domain"
	"github.com/google/uuid"
)

// ListForYou returns personalized tracks from seed IDs (recent, likes, follows).
// Falls back to trending when no seeds or not enough results.
func (r *Repository) ListForYou(ctx context.Context, seedIDs []uuid.UUID, limit int) ([]domain.TrackWithCreator, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}

	seeds := dedupeUUIDs(seedIDs)
	if len(seeds) > 8 {
		seeds = seeds[:8]
	}

	if len(seeds) == 0 {
		return r.listTrending(ctx, limit)
	}

	seen := map[uuid.UUID]bool{}
	exclude := append([]uuid.UUID{}, seeds...)
	for _, id := range seeds {
		seen[id] = true
	}

	perSeed := limit/len(seeds) + 2
	if perSeed < 3 {
		perSeed = 3
	}

	var out []domain.TrackWithCreator
	for _, seed := range seeds {
		if len(out) >= limit {
			break
		}
		recs, err := r.ListRecommendNext(ctx, seed, exclude, perSeed)
		if err != nil {
			return nil, err
		}
		for _, t := range recs {
			if seen[t.ID] {
				continue
			}
			seen[t.ID] = true
			exclude = append(exclude, t.ID)
			out = append(out, t)
			if len(out) >= limit {
				break
			}
		}
	}

	if len(out) < limit {
		trending, err := r.listTrending(ctx, limit*2)
		if err != nil {
			return out, nil
		}
		for _, t := range trending {
			if seen[t.ID] {
				continue
			}
			out = append(out, t)
			if len(out) >= limit {
				break
			}
		}
	}

	if out == nil {
		out = []domain.TrackWithCreator{}
	}
	return out, nil
}

func (r *Repository) listTrending(ctx context.Context, limit int) ([]domain.TrackWithCreator, error) {
	return r.List(ctx, domain.ListTracksFilter{Sort: "trending", Limit: limit, Offset: 0})
}

func dedupeUUIDs(ids []uuid.UUID) []uuid.UUID {
	seen := map[uuid.UUID]bool{}
	var out []uuid.UUID
	for _, id := range ids {
		if id == uuid.Nil || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

package imports

import (
	"context"
	"strings"

	"github.com/gachify/gachify/internal/domain"
	"github.com/gachify/gachify/internal/modules/catalog"
)

type Matcher struct {
	catalog *catalog.Repository
}

func NewMatcher(cat *catalog.Repository) *Matcher {
	return &Matcher{catalog: cat}
}

func (m *Matcher) MatchAll(ctx context.Context, tracks []ExternalTrack) []MatchResult {
	published := domain.TrackPublished
	out := make([]MatchResult, 0, len(tracks))
	for i, ext := range tracks {
		item := MatchResult{
			Position:     i + 1,
			SourceTitle:  ext.Title,
			SourceArtist: ext.Artist,
		}
		if hit := m.matchOne(ctx, ext, &published); hit != nil {
			item.Matched = hit
		}
		out = append(out, item)
	}
	return out
}

func (m *Matcher) matchOne(ctx context.Context, ext ExternalTrack, status *domain.TrackStatus) *MatchedTrack {
	queries := buildQueries(ext)
	seen := map[string]struct{}{}
	for _, q := range queries {
		if q == "" {
			continue
		}
		items, err := m.catalog.List(ctx, domain.ListTracksFilter{
			Status: status,
			Query:  q,
			Limit:  8,
		})
		if err != nil || len(items) == 0 {
			continue
		}
		for _, t := range items {
			if _, ok := seen[t.ID.String()]; ok {
				continue
			}
			seen[t.ID.String()] = struct{}{}
			if score := scoreMatch(ext, t); score >= 0.35 {
				return &MatchedTrack{
					ID:         t.ID.String(),
					Title:      t.Title,
					Artist:     t.Creator.DisplayName,
					DurationMs: t.DurationMs,
				}
			}
		}
		// Fall back to top search hit if title tokens overlap
		if len(items) > 0 && tokenOverlap(ext.Title, items[0].Title) >= 0.5 {
			t := items[0]
			return &MatchedTrack{
				ID:         t.ID.String(),
				Title:      t.Title,
				Artist:     t.Creator.DisplayName,
				DurationMs: t.DurationMs,
			}
		}
	}
	return nil
}

func buildQueries(ext ExternalTrack) []string {
	title := strings.TrimSpace(ext.Title)
	artist := strings.TrimSpace(ext.Artist)
	if title == "" {
		return nil
	}
	if artist != "" {
		return []string{title + " " + artist, title, artist + " " + title}
	}
	return []string{title}
}

func scoreMatch(ext ExternalTrack, t domain.TrackWithCreator) float64 {
	titleScore := tokenOverlap(ext.Title, t.Title)
	artistScore := 0.0
	if ext.Artist != "" {
		artistScore = tokenOverlap(ext.Artist, t.Creator.DisplayName)
		if artistScore == 0 {
			artistScore = tokenOverlap(ext.Artist, t.Creator.Handle)
		}
	} else {
		artistScore = 0.5
	}
	return titleScore*0.75 + artistScore*0.25
}

func tokenOverlap(a, b string) float64 {
	ta := tokenSet(a)
	tb := tokenSet(b)
	if len(ta) == 0 || len(tb) == 0 {
		return 0
	}
	inter := 0
	for k := range ta {
		if tb[k] {
			inter++
		}
	}
	union := len(ta)
	for k := range tb {
		if !ta[k] {
			union++
		}
	}
	if union == 0 {
		return 0
	}
	return float64(inter) / float64(union)
}

func tokenSet(s string) map[string]bool {
	s = strings.ToLower(s)
	s = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			return r
		}
		return ' '
	}, s)
	parts := strings.Fields(s)
	out := make(map[string]bool, len(parts))
	for _, p := range parts {
		if len(p) > 1 {
			out[p] = true
		}
	}
	return out
}

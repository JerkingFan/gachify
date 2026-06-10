package catalog

import (
	"context"
	"fmt"

	"github.com/gachify/gachify/internal/domain"
)

// ListTopWeekly ranks published tracks by plays in the last 7 days (track_play_daily).
func (r *Repository) ListTopWeekly(ctx context.Context, limit, offset int) ([]domain.ChartTrack, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	rows, err := r.pool.Query(ctx, `
		SELECT `+trackColumnsAliased+`, u.handle, u.display_name,
			COALESCE(SUM(d.play_count), 0)::bigint AS weekly_plays
		FROM tracks t
		JOIN users u ON u.id = t.creator_id
		LEFT JOIN track_play_daily d
			ON d.track_id = t.id AND d.play_date >= CURRENT_DATE - INTERVAL '6 days'
		WHERE t.status = 'published'
		GROUP BY t.id, u.handle, u.display_name
		ORDER BY weekly_plays DESC, t.play_count DESC, t.created_at DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list top weekly: %w", err)
	}
	defer rows.Close()

	var out []domain.ChartTrack
	for rows.Next() {
		var t domain.Track
		var handle, displayName string
		var weekly int64
		if err := rows.Scan(
			&t.ID, &t.CreatorID, &t.Title, &t.Description, &t.DurationMs, &t.Status, &t.GachiMetadata,
			&t.MasterObjectKey, &t.CoverObjectKey, &t.SourceContentType, &t.SourceFilename, &t.ProcessingError,
			&t.PlayCount, &t.ScheduledPublishAt, &t.ApprovedAt, &t.CreatedAt, &t.UpdatedAt,
			&handle, &displayName, &weekly,
		); err != nil {
			return nil, fmt.Errorf("scan chart track: %w", err)
		}
		out = append(out, domain.ChartTrack{
			TrackWithCreator: domain.TrackWithCreator{
				Track: t,
				Creator: domain.CreatorSummary{
					ID:          t.CreatorID,
					Handle:      handle,
					DisplayName: displayName,
				},
			},
			WeeklyPlays: weekly,
		})
	}
	if out == nil {
		out = []domain.ChartTrack{}
	}
	return out, rows.Err()
}

// ListDistinctMoodTags returns mood tags used on published tracks (for sitemap/SEO).
func (r *Repository) ListDistinctMoodTags(ctx context.Context, limit int) ([]string, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT tag
		FROM tracks t,
			LATERAL jsonb_array_elements_text(
				CASE WHEN jsonb_typeof(t.gachi_metadata->'mood_tags') = 'array'
					THEN t.gachi_metadata->'mood_tags' ELSE '[]'::jsonb END
			) AS tag
		WHERE t.status = 'published'
		ORDER BY tag
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var tags []string
	for rows.Next() {
		var tag string
		if err := rows.Scan(&tag); err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	if tags == nil {
		tags = []string{}
	}
	return tags, rows.Err()
}

// ListByMoodTag lists published tracks with a mood tag.
func (r *Repository) ListByMoodTag(ctx context.Context, mood string, limit, offset int) ([]domain.TrackWithCreator, error) {
	f := domain.ListTracksFilter{
		MoodTag: mood,
		Status:  ptrStatus(domain.TrackPublished),
		Limit:   limit,
		Offset:  offset,
		Sort:    "trending",
	}
	return r.List(ctx, f)
}

func ptrStatus(s domain.TrackStatus) *domain.TrackStatus {
	return &s
}

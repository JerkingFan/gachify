package catalog

import (
	"context"
	"fmt"

	"github.com/gachify/gachify/internal/domain"
	"github.com/google/uuid"
)

const recommendScoreExpr = `
	(
		COALESCE((
			SELECT COUNT(*)::float
			FROM jsonb_array_elements_text(COALESCE(t.gachi_metadata->'mood_tags', '[]'::jsonb)) tag
			WHERE tag IN (
				SELECT jsonb_array_elements_text(COALESCE(ref.gachi_metadata->'mood_tags', '[]'::jsonb))
			)
		), 0) * 4.0
		+ CASE WHEN t.creator_id = ref.creator_id THEN 2.5 ELSE 0 END
		+ CASE
			WHEN COALESCE(t.gachi_metadata->>'dominant_male_sample', '') <> ''
			 AND t.gachi_metadata->>'dominant_male_sample' = ref.gachi_metadata->>'dominant_male_sample'
			THEN 2.0 ELSE 0 END
		+ GREATEST(0, 4 - ABS(
			COALESCE((t.gachi_metadata->>'gachi_power_level')::float, 50)
			- COALESCE((ref.gachi_metadata->>'gachi_power_level')::float, 50)
		) / 12.5)
		+ GREATEST(0, 3 - ABS(
			COALESCE((t.gachi_metadata->>'deepness_score')::float, 5)
			- COALESCE((ref.gachi_metadata->>'deepness_score')::float, 5)
		) / 2.5)
		+ GREATEST(0, 3 - ABS(
			COALESCE((t.gachi_metadata->>'bpm')::float, 120)
			- COALESCE((ref.gachi_metadata->>'bpm')::float, 120)
		) / 25)
		+ CASE
			WHEN COALESCE((t.gachi_metadata->>'is_continuous_mix')::boolean, false)
			   = COALESCE((ref.gachi_metadata->>'is_continuous_mix')::boolean, false)
			THEN 1.5 ELSE 0 END
		+ GREATEST(0, 2 - ABS(
			COALESCE((t.gachi_metadata->>'wessratost_level')::float, 5)
			- COALESCE((ref.gachi_metadata->>'wessratost_level')::float, 5)
		) / 2.5)
		+ GREATEST(0, 2 - ABS(
			COALESCE((t.gachi_metadata->>'energy')::float, 0.5)
			- COALESCE((ref.gachi_metadata->>'energy')::float, 0.5)
		) * 4)
		+ GREATEST(0, 2 - ABS(
			COALESCE((t.gachi_metadata->>'valence')::float, 0.5)
			- COALESCE((ref.gachi_metadata->>'valence')::float, 0.5)
		) * 4)
		+ GREATEST(0, 1.5 - ABS(
			COALESCE((t.gachi_metadata->>'danceability')::float, 0.5)
			- COALESCE((ref.gachi_metadata->>'danceability')::float, 0.5)
		) * 3)
	)
`

// ListRecommendNext returns published tracks ranked by gachi-metadata similarity to the reference track.
func (r *Repository) ListRecommendNext(ctx context.Context, trackID uuid.UUID, exclude []uuid.UUID, limit int) ([]domain.TrackWithCreator, error) {
	if limit <= 0 {
		limit = 1
	}
	if limit > 50 {
		limit = 50
	}
	if exclude == nil {
		exclude = []uuid.UUID{}
	}

	q := `SELECT ` + trackColumnsAliased + `, u.handle, u.display_name, ` + recommendScoreExpr + ` AS match_score
		FROM tracks ref
		JOIN tracks t ON t.status = 'published' AND t.id != ref.id
		JOIN users u ON u.id = t.creator_id
		WHERE ref.id = $1
		AND (cardinality($3::uuid[]) = 0 OR NOT (t.id = ANY($3::uuid[])))
		ORDER BY match_score DESC, t.play_count DESC, t.created_at DESC
		LIMIT $2`

	rows, err := r.pool.Query(ctx, q, trackID, limit, exclude)
	if err != nil {
		return nil, fmt.Errorf("list recommend next: %w", err)
	}
	defer rows.Close()

	var tracks []domain.TrackWithCreator
	for rows.Next() {
		item, err := scanTrackWithCreatorAndScore(rows)
		if err != nil {
			return nil, err
		}
		tracks = append(tracks, item)
	}
	if tracks == nil {
		tracks = []domain.TrackWithCreator{}
	}
	return tracks, rows.Err()
}

func scanTrackWithCreatorAndScore(row interface {
	Scan(dest ...any) error
}) (domain.TrackWithCreator, error) {
	var t domain.Track
	var handle, displayName string
	var score float64
	err := row.Scan(
		&t.ID, &t.CreatorID, &t.Title, &t.Description, &t.DurationMs, &t.Status, &t.GachiMetadata,
		&t.MasterObjectKey, &t.CoverObjectKey, &t.SourceContentType, &t.SourceFilename, &t.ProcessingError,
		&t.PlayCount, &t.ScheduledPublishAt, &t.ApprovedAt, &t.CreatedAt, &t.UpdatedAt,
		&handle, &displayName,
		&score,
	)
	if err != nil {
		return domain.TrackWithCreator{}, err
	}
	_ = score
	return domain.TrackWithCreator{
		Track: t,
		Creator: domain.CreatorSummary{
			ID:          t.CreatorID,
			Handle:      handle,
			DisplayName: displayName,
		},
	}, nil
}

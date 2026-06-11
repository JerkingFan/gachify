package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/gachify/gachify/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("track not found")

const trackColumns = `id, creator_id, title, description, duration_ms, status, gachi_metadata,
	master_object_key, cover_object_key, source_content_type, source_filename, processing_error, play_count,
	scheduled_publish_at, approved_at, created_at, updated_at`

// trackColumnsAliased is for SELECTs that JOIN users (both tables have id).
const trackColumnsAliased = `t.id, t.creator_id, t.title, t.description, t.duration_ms, t.status, t.gachi_metadata,
	t.master_object_key, t.cover_object_key, t.source_content_type, t.source_filename, t.processing_error, t.play_count,
	t.scheduled_publish_at, t.approved_at, t.created_at, t.updated_at`

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func scanTrack(row pgx.Row) (domain.Track, error) {
	var t domain.Track
	err := row.Scan(
		&t.ID, &t.CreatorID, &t.Title, &t.Description, &t.DurationMs, &t.Status, &t.GachiMetadata,
		&t.MasterObjectKey, &t.CoverObjectKey, &t.SourceContentType, &t.SourceFilename, &t.ProcessingError,
		&t.PlayCount, &t.ScheduledPublishAt, &t.ApprovedAt, &t.CreatedAt, &t.UpdatedAt,
	)
	return t, err
}

func (r *Repository) SetCoverObjectKey(ctx context.Context, trackID, creatorID uuid.UUID, objectKey string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE tracks SET cover_object_key = $3, updated_at = now()
		WHERE id = $1 AND creator_id = $2
			AND status IN ('draft', 'processing', 'pending_review', 'approved', 'published')
	`, trackID, creatorID, objectKey)
	if err != nil {
		return fmt.Errorf("set cover object key: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) Create(ctx context.Context, in domain.CreateTrackInput) (domain.Track, error) {
	status := in.Status
	if status == "" {
		status = domain.TrackDraft
	}
	meta := in.GachiMetadata
	if len(meta) == 0 {
		meta = json.RawMessage(`{}`)
	}

	q := `INSERT INTO tracks (creator_id, title, description, duration_ms, status, gachi_metadata)
		VALUES ($1, $2, '', $3, $4, $5) RETURNING ` + trackColumns
	row := r.pool.QueryRow(ctx, q, in.CreatorID, in.Title, in.DurationMs, string(status), meta)
	t, err := scanTrack(row)
	if err != nil {
		return domain.Track{}, fmt.Errorf("insert track: %w", err)
	}
	return t, nil
}

func (r *Repository) CreateMetadataDraft(ctx context.Context, creatorID uuid.UUID, title, description string, meta json.RawMessage) (domain.Track, error) {
	if len(meta) == 0 {
		meta = json.RawMessage(`{}`)
	}
	q := `INSERT INTO tracks (creator_id, title, description, duration_ms, status, gachi_metadata)
		VALUES ($1, $2, $3, 0, 'draft', $4) RETURNING ` + trackColumns
	row := r.pool.QueryRow(ctx, q, creatorID, title, description, meta)
	t, err := scanTrack(row)
	if err != nil {
		return domain.Track{}, fmt.Errorf("insert metadata draft: %w", err)
	}
	return t, nil
}

func (r *Repository) UpdateDraftMetadata(ctx context.Context, id, creatorID uuid.UUID, title, description string, meta json.RawMessage) (domain.Track, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE tracks SET title = $3, description = $4, gachi_metadata = $5, updated_at = now()
		WHERE id = $1 AND creator_id = $2 AND status = 'draft'
		RETURNING `+trackColumns, id, creatorID, title, description, meta)
	t, err := scanTrack(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Track{}, ErrNotFound
	}
	if err != nil {
		return domain.Track{}, fmt.Errorf("update draft metadata: %w", err)
	}
	return t, nil
}

func (r *Repository) AttachDraftMaster(ctx context.Context, id, creatorID uuid.UUID, objectKey, contentType, filename string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE tracks SET master_object_key = $3, source_content_type = $4, source_filename = $5, updated_at = now()
		WHERE id = $1 AND creator_id = $2 AND status = 'draft'
	`, id, creatorID, objectKey, contentType, filename)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) CreateDraftUpload(ctx context.Context, creatorID uuid.UUID, title, description string, durationMs int, meta json.RawMessage, objectKey, contentType, filename string) (domain.Track, error) {
	if len(meta) == 0 {
		meta = json.RawMessage(`{}`)
	}
	q := `INSERT INTO tracks (creator_id, title, description, duration_ms, status, gachi_metadata,
		master_object_key, source_content_type, source_filename)
		VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8) RETURNING ` + trackColumns
	row := r.pool.QueryRow(ctx, q, creatorID, title, description, durationMs, meta, objectKey, contentType, filename)
	t, err := scanTrack(row)
	if err != nil {
		return domain.Track{}, fmt.Errorf("insert draft: %w", err)
	}
	return t, nil
}

func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (domain.Track, error) {
	q := `SELECT ` + trackColumns + ` FROM tracks WHERE id = $1`
	t, err := scanTrack(r.pool.QueryRow(ctx, q, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Track{}, ErrNotFound
	}
	if err != nil {
		return domain.Track{}, fmt.Errorf("get track: %w", err)
	}
	return t, nil
}

func (r *Repository) GetByIDWithCreator(ctx context.Context, id uuid.UUID) (domain.TrackWithCreator, error) {
	q := `SELECT ` + trackColumnsAliased + `, u.handle, u.display_name
		FROM tracks t
		JOIN users u ON u.id = t.creator_id
		WHERE t.id = $1`
	item, err := scanTrackWithCreator(r.pool.QueryRow(ctx, q, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.TrackWithCreator{}, ErrNotFound
	}
	if err != nil {
		return domain.TrackWithCreator{}, fmt.Errorf("get track with creator: %w", err)
	}
	return item, nil
}

func (r *Repository) GetOwned(ctx context.Context, id, creatorID uuid.UUID) (domain.Track, error) {
	q := `SELECT ` + trackColumns + ` FROM tracks WHERE id = $1 AND creator_id = $2`
	t, err := scanTrack(r.pool.QueryRow(ctx, q, id, creatorID))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Track{}, ErrNotFound
	}
	if err != nil {
		return domain.Track{}, fmt.Errorf("get owned track: %w", err)
	}
	return t, nil
}

func (r *Repository) UpdateStatus(ctx context.Context, id uuid.UUID, status domain.TrackStatus, processingError *string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE tracks SET status = $2, processing_error = $3 WHERE id = $1
	`, id, string(status), processingError)
	return err
}

func (r *Repository) UpdateDuration(ctx context.Context, id uuid.UUID, durationMs int) error {
	_, err := r.pool.Exec(ctx, `UPDATE tracks SET duration_ms = $2 WHERE id = $1`, id, durationMs)
	return err
}

func (r *Repository) UpdateGachiMetadata(ctx context.Context, id uuid.UUID, meta json.RawMessage) error {
	_, err := r.pool.Exec(ctx, `UPDATE tracks SET gachi_metadata = $2, updated_at = now() WHERE id = $1`, id, meta)
	return err
}

func (r *Repository) UpdateModeration(ctx context.Context, id uuid.UUID, title string, meta json.RawMessage) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE tracks SET title = $2, gachi_metadata = $3, updated_at = now()
		WHERE id = $1 AND status = 'pending_review'
	`, id, title, meta)
	if err != nil {
		return fmt.Errorf("update moderation: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) AdminApprove(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE tracks SET status = 'approved', approved_at = now(), processing_error = NULL, updated_at = now()
		WHERE id = $1 AND status = 'pending_review'
	`, id)
	if err != nil {
		return fmt.Errorf("admin approve: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) SetScheduledPublish(ctx context.Context, id, creatorID uuid.UUID, at time.Time) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE tracks SET scheduled_publish_at = $3, updated_at = now()
		WHERE id = $1 AND creator_id = $2 AND status = 'approved'
	`, id, creatorID, at)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) CreatorPublishNow(ctx context.Context, id, creatorID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE tracks SET status = 'published', scheduled_publish_at = NULL, updated_at = now()
		WHERE id = $1 AND creator_id = $2 AND status = 'approved'
	`, id, creatorID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) PublishScheduledTrack(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE tracks SET status = 'published', scheduled_publish_at = NULL, updated_at = now()
		WHERE id = $1 AND status = 'approved'
		  AND scheduled_publish_at IS NOT NULL AND scheduled_publish_at <= now()
	`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) ListDueScheduledPublish(ctx context.Context, limit int) ([]uuid.UUID, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id FROM tracks
		WHERE status = 'approved'
		  AND scheduled_publish_at IS NOT NULL
		  AND scheduled_publish_at <= now()
		ORDER BY scheduled_publish_at ASC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *Repository) AdminPublish(ctx context.Context, id, creatorID uuid.UUID, title string, meta json.RawMessage) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE tracks
		SET creator_id = $2, title = $3, gachi_metadata = $4, status = 'published',
		    processing_error = NULL, approved_at = COALESCE(approved_at, now()), updated_at = now()
		WHERE id = $1 AND status IN ('pending_review', 'approved', 'draft')
	`, id, creatorID, title, meta)
	if err != nil {
		return fmt.Errorf("admin publish: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) CreateTranscodeJob(ctx context.Context, trackID uuid.UUID) (uuid.UUID, error) {
	var jobID uuid.UUID
	err := r.pool.QueryRow(ctx, `
		INSERT INTO transcode_jobs (track_id, status) VALUES ($1, 'pending') RETURNING id
	`, trackID).Scan(&jobID)
	return jobID, err
}

func (r *Repository) MarkJobRunning(ctx context.Context, jobID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE transcode_jobs SET status = 'running', started_at = now(), attempts = attempts + 1
		WHERE id = $1
	`, jobID)
	return err
}

func (r *Repository) MarkJobCompleted(ctx context.Context, jobID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE transcode_jobs SET status = 'completed', completed_at = now() WHERE id = $1
	`, jobID)
	return err
}

func (r *Repository) MarkJobFailed(ctx context.Context, jobID uuid.UUID, errMsg string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE transcode_jobs SET status = 'failed', last_error = $2, completed_at = now() WHERE id = $1
	`, jobID, errMsg)
	return err
}

func (r *Repository) ResetJobPending(ctx context.Context, jobID uuid.UUID, errMsg string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE transcode_jobs SET status = 'pending', last_error = $2, completed_at = NULL WHERE id = $1
	`, jobID, errMsg)
	return err
}

func (r *Repository) GetTranscodeJob(ctx context.Context, jobID uuid.UUID) (domain.TranscodeJob, error) {
	var j domain.TranscodeJob
	var lastError *string
	err := r.pool.QueryRow(ctx, `
		SELECT id, track_id, status, attempts, last_error, created_at
		FROM transcode_jobs WHERE id = $1
	`, jobID).Scan(&j.ID, &j.TrackID, &j.Status, &j.Attempts, &lastError, &j.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.TranscodeJob{}, ErrNotFound
	}
	if err != nil {
		return domain.TranscodeJob{}, fmt.Errorf("get transcode job: %w", err)
	}
	j.LastError = lastError
	return j, nil
}

func (r *Repository) GetLatestTranscodeJob(ctx context.Context, trackID uuid.UUID) (domain.TranscodeJob, error) {
	var j domain.TranscodeJob
	var lastError *string
	err := r.pool.QueryRow(ctx, `
		SELECT id, track_id, status, attempts, last_error, created_at
		FROM transcode_jobs WHERE track_id = $1
		ORDER BY created_at DESC LIMIT 1
	`, trackID).Scan(&j.ID, &j.TrackID, &j.Status, &j.Attempts, &lastError, &j.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.TranscodeJob{}, ErrNotFound
	}
	if err != nil {
		return domain.TranscodeJob{}, fmt.Errorf("get latest transcode job: %w", err)
	}
	j.LastError = lastError
	return j, nil
}

func normalizeListFilter(f *domain.ListTracksFilter) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 20
	}
	if f.Offset < 0 {
		f.Offset = 0
	}
	f.Query = strings.TrimSpace(f.Query)
}

func buildListWhere(f domain.ListTracksFilter, tableAlias string) (string, []any) {
	prefix := ""
	if tableAlias != "" {
		prefix = strings.TrimSuffix(tableAlias, ".") + "."
	}
	q := " WHERE 1=1"
	args := []any{}
	n := 1
	if f.Status != nil {
		q += fmt.Sprintf(" AND %sstatus = $%d", prefix, n)
		args = append(args, string(*f.Status))
		n++
	}
	if f.CreatorID != nil {
		q += fmt.Sprintf(" AND %screator_id = $%d", prefix, n)
		args = append(args, *f.CreatorID)
		n++
	}
	if f.Query != "" {
		q += searchWhereSQL(n)
		args = append(args, f.Query)
		n++
	}
	if f.MoodTag != "" {
		q += fmt.Sprintf(" AND %sgachi_metadata->'mood_tags' ? $%d", prefix, n)
		args = append(args, f.MoodTag)
		n++
	}
	if f.Sample != "" {
		q += fmt.Sprintf(" AND %sgachi_metadata->>'dominant_male_sample' = $%d", prefix, n)
		args = append(args, f.Sample)
		n++
	}
	if f.MinPower != nil {
		q += fmt.Sprintf(" AND (%sgachi_metadata->>'gachi_power_level')::int >= $%d", prefix, n)
		args = append(args, *f.MinPower)
		n++
	}
	if f.MaxPower != nil {
		q += fmt.Sprintf(" AND (%sgachi_metadata->>'gachi_power_level')::int <= $%d", prefix, n)
		args = append(args, *f.MaxPower)
		n++
	}
	if f.MinDeepness != nil {
		q += fmt.Sprintf(" AND (%sgachi_metadata->>'deepness_score')::float >= $%d", prefix, n)
		args = append(args, *f.MinDeepness)
		n++
	}
	if f.MaxDeepness != nil {
		q += fmt.Sprintf(" AND (%sgachi_metadata->>'deepness_score')::float <= $%d", prefix, n)
		args = append(args, *f.MaxDeepness)
		n++
	}
	if f.MinBPM != nil {
		q += fmt.Sprintf(" AND (%sgachi_metadata->>'bpm')::float >= $%d", prefix, n)
		args = append(args, *f.MinBPM)
		n++
	}
	if f.MaxBPM != nil {
		q += fmt.Sprintf(" AND (%sgachi_metadata->>'bpm')::float <= $%d", prefix, n)
		args = append(args, *f.MaxBPM)
		n++
	}
	if f.HasLyrics != nil && *f.HasLyrics {
		q += fmt.Sprintf(` AND jsonb_typeof(%sgachi_metadata->'lyrics') = 'object'
			AND jsonb_array_length(COALESCE(%sgachi_metadata->'lyrics'->'lines', '[]'::jsonb)) > 0`, prefix, prefix)
	}
	return q, args
}

func scanTrackWithCreator(row pgx.Row) (domain.TrackWithCreator, error) {
	var t domain.Track
	var handle, displayName string
	err := row.Scan(
		&t.ID, &t.CreatorID, &t.Title, &t.Description, &t.DurationMs, &t.Status, &t.GachiMetadata,
		&t.MasterObjectKey, &t.CoverObjectKey, &t.SourceContentType, &t.SourceFilename, &t.ProcessingError,
		&t.PlayCount, &t.ScheduledPublishAt, &t.ApprovedAt, &t.CreatedAt, &t.UpdatedAt,
		&handle, &displayName,
	)
	if err != nil {
		return domain.TrackWithCreator{}, err
	}
	return domain.TrackWithCreator{
		Track: t,
		Creator: domain.CreatorSummary{
			ID:          t.CreatorID,
			Handle:      handle,
			DisplayName: displayName,
		},
	}, nil
}

func (r *Repository) Count(ctx context.Context, f domain.ListTracksFilter) (int, error) {
	normalizeListFilter(&f)
	where, args := buildListWhere(f, "t.")
	q := `SELECT COUNT(*) FROM tracks t`
	if f.Query != "" {
		q += ` JOIN users u ON u.id = t.creator_id`
	}
	q += where
	var total int64
	if err := r.pool.QueryRow(ctx, q, args...).Scan(&total); err != nil {
		return 0, fmt.Errorf("count tracks: %w", err)
	}
	return int(total), nil
}

func (r *Repository) List(ctx context.Context, f domain.ListTracksFilter) ([]domain.TrackWithCreator, error) {
	normalizeListFilter(&f)

	q := `SELECT ` + trackColumnsAliased + `, u.handle, u.display_name
		FROM tracks t
		JOIN users u ON u.id = t.creator_id`
	where, args := buildListWhere(f, "t.")
	q += where
	if f.Query != "" {
		rankIdx := len(args)
		q += fmt.Sprintf(" ORDER BY %s DESC, t.created_at DESC LIMIT $%d OFFSET $%d",
			searchRankSQL(rankIdx), len(args)+1, len(args)+2)
	} else if f.Sort == "trending" {
		n := len(args) + 1
		q += fmt.Sprintf(" ORDER BY t.play_count DESC, t.created_at DESC LIMIT $%d OFFSET $%d", n, n+1)
	} else {
		n := len(args) + 1
		q += fmt.Sprintf(" ORDER BY t.created_at DESC LIMIT $%d OFFSET $%d", n, n+1)
	}
	args = append(args, f.Limit, f.Offset)

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("list tracks: %w", err)
	}
	defer rows.Close()

	var tracks []domain.TrackWithCreator
	for rows.Next() {
		item, err := scanTrackWithCreator(rows)
		if err != nil {
			return nil, fmt.Errorf("scan track: %w", err)
		}
		tracks = append(tracks, item)
	}
	if tracks == nil {
		tracks = []domain.TrackWithCreator{}
	}
	return tracks, rows.Err()
}

func (r *Repository) IncrementPlayCount(ctx context.Context, id uuid.UUID, source string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE tracks SET play_count = play_count + 1, updated_at = now()
		WHERE id = $1 AND status = 'published'
	`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO track_play_daily (track_id, play_date, play_count)
		VALUES ($1, CURRENT_DATE, 1)
		ON CONFLICT (track_id, play_date) DO UPDATE SET play_count = track_play_daily.play_count + 1
	`, id)
	if err != nil {
		return err
	}
	if source := normalizePlaySource(source); source != "" {
		_, err = tx.Exec(ctx, `
			INSERT INTO track_play_sources (track_id, source, play_count)
			VALUES ($1, $2, 1)
			ON CONFLICT (track_id, source) DO UPDATE SET play_count = track_play_sources.play_count + 1
		`, id, source)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func normalizePlaySource(source string) string {
	switch source {
	case "home", "search", "discover", "playlist", "artist", "track_page", "share", "embed", "library", "following", "radio", "direct":
		return source
	default:
		return ""
	}
}

func (r *Repository) ListTrackPlaySources(ctx context.Context, trackID uuid.UUID) ([]domain.PlaySourceStat, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT source, play_count
		FROM track_play_sources
		WHERE track_id = $1
		ORDER BY play_count DESC
	`, trackID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.PlaySourceStat
	for rows.Next() {
		var s domain.PlaySourceStat
		if err := rows.Scan(&s.Source, &s.PlayCount); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	if out == nil {
		out = []domain.PlaySourceStat{}
	}
	return out, rows.Err()
}

func (r *Repository) ListTrackPlayDaily(ctx context.Context, trackID uuid.UUID, days int) ([]domain.DailyPlayStat, error) {
	if days <= 0 {
		days = 30
	}
	rows, err := r.pool.Query(ctx, `
		SELECT play_date, play_count
		FROM track_play_daily
		WHERE track_id = $1 AND play_date >= CURRENT_DATE - $2::int
		ORDER BY play_date ASC
	`, trackID, days-1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.DailyPlayStat
	for rows.Next() {
		var d time.Time
		var n int64
		if err := rows.Scan(&d, &n); err != nil {
			return nil, err
		}
		out = append(out, domain.DailyPlayStat{Date: d.Format("2006-01-02"), PlayCount: n})
	}
	if out == nil {
		out = []domain.DailyPlayStat{}
	}
	return out, rows.Err()
}

func (r *Repository) ListPublishedByCreators(ctx context.Context, creatorIDs []uuid.UUID, limit, offset int) ([]domain.TrackWithCreator, error) {
	if len(creatorIDs) == 0 {
		return []domain.TrackWithCreator{}, nil
	}
	if limit <= 0 {
		limit = 20
	}
	q := `SELECT ` + trackColumnsAliased + `, u.handle, u.display_name
		FROM tracks t
		JOIN users u ON u.id = t.creator_id
		WHERE t.status = 'published' AND t.creator_id = ANY($1)
		ORDER BY t.created_at DESC
		LIMIT $2 OFFSET $3`
	rows, err := r.pool.Query(ctx, q, creatorIDs, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list feed: %w", err)
	}
	defer rows.Close()
	var tracks []domain.TrackWithCreator
	for rows.Next() {
		item, err := scanTrackWithCreator(rows)
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

func (r *Repository) ListSimilar(ctx context.Context, trackID uuid.UUID, limit int) ([]domain.TrackWithCreator, error) {
	return r.ListRecommendNext(ctx, trackID, []uuid.UUID{trackID}, limit)
}

func (r *Repository) ListPublishedByIDs(ctx context.Context, ids []uuid.UUID) ([]domain.TrackWithCreator, error) {
	if len(ids) == 0 {
		return []domain.TrackWithCreator{}, nil
	}
	q := `SELECT ` + trackColumnsAliased + `, u.handle, u.display_name
		FROM tracks t
		JOIN users u ON u.id = t.creator_id
		WHERE t.status = 'published' AND t.id = ANY($1)`
	rows, err := r.pool.Query(ctx, q, ids)
	if err != nil {
		return nil, fmt.Errorf("list tracks by ids: %w", err)
	}
	defer rows.Close()
	byID := make(map[uuid.UUID]domain.TrackWithCreator, len(ids))
	for rows.Next() {
		item, err := scanTrackWithCreator(rows)
		if err != nil {
			return nil, err
		}
		byID[item.ID] = item
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]domain.TrackWithCreator, 0, len(ids))
	for _, id := range ids {
		if t, ok := byID[id]; ok {
			out = append(out, t)
		}
	}
	return out, nil
}

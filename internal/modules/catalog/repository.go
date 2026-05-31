package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/gachify/gachify/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("track not found")

const trackColumns = `id, creator_id, title, duration_ms, status, gachi_metadata,
	master_object_key, source_content_type, source_filename, processing_error, created_at, updated_at`

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func scanTrack(row pgx.Row) (domain.Track, error) {
	var t domain.Track
	err := row.Scan(
		&t.ID, &t.CreatorID, &t.Title, &t.DurationMs, &t.Status, &t.GachiMetadata,
		&t.MasterObjectKey, &t.SourceContentType, &t.SourceFilename, &t.ProcessingError,
		&t.CreatedAt, &t.UpdatedAt,
	)
	return t, err
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

	q := `INSERT INTO tracks (creator_id, title, duration_ms, status, gachi_metadata)
		VALUES ($1, $2, $3, $4, $5) RETURNING ` + trackColumns
	row := r.pool.QueryRow(ctx, q, in.CreatorID, in.Title, in.DurationMs, string(status), meta)
	t, err := scanTrack(row)
	if err != nil {
		return domain.Track{}, fmt.Errorf("insert track: %w", err)
	}
	return t, nil
}

func (r *Repository) CreateDraftUpload(ctx context.Context, creatorID uuid.UUID, title string, durationMs int, meta json.RawMessage, objectKey, contentType, filename string) (domain.Track, error) {
	if len(meta) == 0 {
		meta = json.RawMessage(`{}`)
	}
	q := `INSERT INTO tracks (creator_id, title, duration_ms, status, gachi_metadata,
		master_object_key, source_content_type, source_filename)
		VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7) RETURNING ` + trackColumns
	row := r.pool.QueryRow(ctx, q, creatorID, title, durationMs, meta, objectKey, contentType, filename)
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
	_, err := r.pool.Exec(ctx, `UPDATE tracks SET gachi_metadata = $2 WHERE id = $1`, id, meta)
	return err
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
		prefix = tableAlias + "."
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
	}
	return q, args
}

func scanTrackWithCreator(row pgx.Row) (domain.TrackWithCreator, error) {
	var t domain.Track
	var handle, displayName string
	err := row.Scan(
		&t.ID, &t.CreatorID, &t.Title, &t.DurationMs, &t.Status, &t.GachiMetadata,
		&t.MasterObjectKey, &t.SourceContentType, &t.SourceFilename, &t.ProcessingError,
		&t.CreatedAt, &t.UpdatedAt,
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
	q := `SELECT COUNT(*) FROM tracks t JOIN users u ON u.id = t.creator_id`
	where, args := buildListWhere(f, "t.")
	q += where
	var total int
	if err := r.pool.QueryRow(ctx, q, args...).Scan(&total); err != nil {
		return 0, fmt.Errorf("count tracks: %w", err)
	}
	return total, nil
}

func (r *Repository) List(ctx context.Context, f domain.ListTracksFilter) ([]domain.TrackWithCreator, error) {
	normalizeListFilter(&f)

	q := `SELECT ` + trackColumns + `, u.handle, u.display_name
		FROM tracks t
		JOIN users u ON u.id = t.creator_id`
	where, args := buildListWhere(f, "t.")
	q += where
	if f.Query != "" {
		rankIdx := len(args)
		q += fmt.Sprintf(" ORDER BY %s DESC, t.created_at DESC LIMIT $%d OFFSET $%d",
			searchRankSQL(rankIdx), len(args)+1, len(args)+2)
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

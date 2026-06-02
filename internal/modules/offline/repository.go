package offline

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrLimitReached = errors.New("offline download limit reached")
var ErrNotAllowed = errors.New("track must be liked before offline download")

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) CountByUser(ctx context.Context, userID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM offline_downloads WHERE user_id = $1`, userID).Scan(&n)
	return n, err
}

func (r *Repository) Has(ctx context.Context, userID, trackID uuid.UUID) (bool, error) {
	var n int
	err := r.pool.QueryRow(ctx, `
		SELECT 1 FROM offline_downloads WHERE user_id = $1 AND track_id = $2
	`, userID, trackID).Scan(&n)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return n == 1, nil
}

func (r *Repository) Record(ctx context.Context, userID, trackID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO offline_downloads (user_id, track_id) VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, userID, trackID)
	return err
}

func (r *Repository) Remove(ctx context.Context, userID, trackID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM offline_downloads WHERE user_id = $1 AND track_id = $2
	`, userID, trackID)
	return err
}

func (r *Repository) ListTrackIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT track_id FROM offline_downloads WHERE user_id = $1 ORDER BY created_at DESC
	`, userID)
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
	if ids == nil {
		ids = []uuid.UUID{}
	}
	return ids, rows.Err()
}

package library

import (
	"context"

	"github.com/google/uuid"
)

func (r *Repository) Follow(ctx context.Context, followerID, followeeID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO user_follows (follower_id, followee_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, followerID, followeeID)
	return err
}

func (r *Repository) Unfollow(ctx context.Context, followerID, followeeID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM user_follows WHERE follower_id = $1 AND followee_id = $2
	`, followerID, followeeID)
	return err
}

func (r *Repository) IsFollowing(ctx context.Context, followerID, followeeID uuid.UUID) (bool, error) {
	var n int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM user_follows WHERE follower_id = $1 AND followee_id = $2
	`, followerID, followeeID).Scan(&n)
	return n > 0, err
}

func (r *Repository) ListFollowingIDs(ctx context.Context, followerID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT followee_id FROM user_follows WHERE follower_id = $1 ORDER BY created_at DESC
	`, followerID)
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

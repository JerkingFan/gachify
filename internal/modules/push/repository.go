package push

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotConfigured = errors.New("web push not configured")

type Subscription struct {
	Endpoint string
	P256dh   string
	Auth     string
}

type Target struct {
	UserID uuid.UUID
	Subscription
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) UpsertSubscription(ctx context.Context, userID uuid.UUID, sub Subscription) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
	`, userID, sub.Endpoint, sub.P256dh, sub.Auth)
	return err
}

func (r *Repository) DeleteSubscription(ctx context.Context, userID uuid.UUID, endpoint string) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2
	`, userID, endpoint)
	return err
}

func (r *Repository) DeleteByEndpoint(ctx context.Context, endpoint string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM push_subscriptions WHERE endpoint = $1`, endpoint)
	return err
}

func (r *Repository) ListFollowerTargets(ctx context.Context, creatorID uuid.UUID) ([]Target, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT ps.user_id, ps.endpoint, ps.p256dh, ps.auth
		FROM user_follows uf
		JOIN users u ON u.id = uf.follower_id
		JOIN push_subscriptions ps ON ps.user_id = uf.follower_id
		WHERE uf.followee_id = $1 AND u.push_notifications = 'following'
	`, creatorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Target
	for rows.Next() {
		var t Target
		if err := rows.Scan(&t.UserID, &t.Endpoint, &t.P256dh, &t.Auth); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

type Payload struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
	Tag   string `json:"tag,omitempty"`
}

func (p Payload) JSON() ([]byte, error) {
	return json.Marshal(p)
}

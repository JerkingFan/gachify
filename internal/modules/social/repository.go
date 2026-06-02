package social

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gachify/gachify/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) NotifyFollowersNewRelease(ctx context.Context, creatorID, trackID uuid.UUID, trackTitle, creatorHandle string) error {
	handle := creatorHandle
	if handle == "" {
		handle = "artist"
	}
	body := fmt.Sprintf("@%s dropped a new remix: %s", handle, trackTitle)
	_, err := r.pool.Exec(ctx, `
		INSERT INTO notifications (user_id, type, actor_id, track_id, body)
		SELECT uf.follower_id, $4, $1, $2, $3
		FROM user_follows uf
		WHERE uf.followee_id = $1
	`, creatorID, trackID, body, domain.NotificationNewRelease)
	return err
}

func (r *Repository) ListNotifications(ctx context.Context, userID uuid.UUID, limit int) ([]domain.Notification, error) {
	if limit <= 0 || limit > 50 {
		limit = 30
	}
	rows, err := r.pool.Query(ctx, `
		SELECT n.id, n.type, n.actor_id, n.track_id, n.body, n.read_at, n.created_at,
			u.handle, u.display_name, u.avatar_url, t.title
		FROM notifications n
		LEFT JOIN users u ON u.id = n.actor_id
		LEFT JOIN tracks t ON t.id = n.track_id
		WHERE n.user_id = $1
		ORDER BY n.created_at DESC
		LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Notification
	for rows.Next() {
		var n domain.Notification
		var actorID, trackID *uuid.UUID
		var readAt *time.Time
		var handle, displayName *string
		var avatar *string
		var trackTitle *string
		if err := rows.Scan(
			&n.ID, &n.Type, &actorID, &trackID, &n.Body, &readAt, &n.CreatedAt,
			&handle, &displayName, &avatar, &trackTitle,
		); err != nil {
			return nil, err
		}
		n.ActorID = actorID
		n.TrackID = trackID
		n.ReadAt = readAt
		if handle != nil && displayName != nil && actorID != nil {
			n.Actor = &domain.PublicUserSummary{
				ID:          *actorID,
				Handle:      *handle,
				DisplayName: *displayName,
				AvatarURL:   avatar,
			}
		}
		if trackTitle != nil {
			n.TrackTitle = *trackTitle
		}
		out = append(out, n)
	}
	if out == nil {
		out = []domain.Notification{}
	}
	return out, rows.Err()
}

func (r *Repository) CountUnread(ctx context.Context, userID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL
	`, userID).Scan(&n)
	return n, err
}

func (r *Repository) MarkAllRead(ctx context.Context, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL
	`, userID)
	return err
}

func (r *Repository) SetReaction(ctx context.Context, userID, trackID uuid.UUID, reaction string) error {
	reaction = strings.TrimSpace(strings.ToLower(reaction))
	_, err := r.pool.Exec(ctx, `
		INSERT INTO track_reactions (user_id, track_id, reaction)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, track_id) DO UPDATE SET reaction = EXCLUDED.reaction, created_at = now()
	`, userID, trackID, reaction)
	return err
}

func (r *Repository) ClearReaction(ctx context.Context, userID, trackID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM track_reactions WHERE user_id = $1 AND track_id = $2`, userID, trackID)
	return err
}

func (r *Repository) GetReactions(ctx context.Context, trackID uuid.UUID, viewerID *uuid.UUID) (domain.TrackReactionsSummary, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT reaction, COUNT(*)::int FROM track_reactions WHERE track_id = $1 GROUP BY reaction
	`, trackID)
	if err != nil {
		return domain.TrackReactionsSummary{}, err
	}
	defer rows.Close()
	counts := map[string]int{"power": 0, "fire": 0, "brotherhood": 0}
	total := 0
	for rows.Next() {
		var reaction string
		var c int
		if err := rows.Scan(&reaction, &c); err != nil {
			return domain.TrackReactionsSummary{}, err
		}
		counts[reaction] = c
		total += c
	}
	var userReaction *string
	if viewerID != nil {
		var rx string
		err := r.pool.QueryRow(ctx, `
			SELECT reaction FROM track_reactions WHERE track_id = $1 AND user_id = $2
		`, trackID, *viewerID).Scan(&rx)
		if err == nil {
			userReaction = &rx
		} else if err != pgx.ErrNoRows {
			return domain.TrackReactionsSummary{}, err
		}
	}
	return domain.TrackReactionsSummary{Counts: counts, UserReaction: userReaction, Total: total}, nil
}

func (r *Repository) AddComment(ctx context.Context, userID, trackID uuid.UUID, body string, parentID *uuid.UUID) (domain.TrackComment, error) {
	body = strings.TrimSpace(body)
	var c domain.TrackComment
	err := r.pool.QueryRow(ctx, `
		INSERT INTO track_comments (track_id, user_id, body, parent_id)
		VALUES ($1, $2, $3, $4)
		RETURNING id, track_id, user_id, body, parent_id, created_at
	`, trackID, userID, body, parentID).Scan(&c.ID, &c.TrackID, &c.UserID, &c.Body, &c.ParentID, &c.CreatedAt)
	if err != nil {
		return domain.TrackComment{}, err
	}
	err = r.pool.QueryRow(ctx, `
		SELECT handle, display_name, avatar_url FROM users WHERE id = $1
	`, userID).Scan(&c.Author.Handle, &c.Author.DisplayName, &c.Author.AvatarURL)
	c.Author.ID = userID
	return c, err
}

func (r *Repository) GetComment(ctx context.Context, commentID uuid.UUID) (domain.TrackComment, error) {
	var c domain.TrackComment
	var avatar *string
	err := r.pool.QueryRow(ctx, `
		SELECT c.id, c.track_id, c.user_id, c.body, c.parent_id, c.created_at,
			u.handle, u.display_name, u.avatar_url
		FROM track_comments c
		JOIN users u ON u.id = c.user_id
		WHERE c.id = $1
	`, commentID).Scan(
		&c.ID, &c.TrackID, &c.UserID, &c.Body, &c.ParentID, &c.CreatedAt,
		&c.Author.Handle, &c.Author.DisplayName, &avatar,
	)
	if err != nil {
		return domain.TrackComment{}, err
	}
	c.Author.ID = c.UserID
	c.Author.AvatarURL = avatar
	return c, nil
}

func (r *Repository) NotifyCommentReply(ctx context.Context, parentAuthorID, actorID, trackID uuid.UUID, trackTitle, actorHandle string) error {
	if parentAuthorID == actorID {
		return nil
	}
	body := fmt.Sprintf("@%s replied on %s", actorHandle, trackTitle)
	_, err := r.pool.Exec(ctx, `
		INSERT INTO notifications (user_id, type, actor_id, track_id, body)
		VALUES ($1, $2, $3, $4, $5)
	`, parentAuthorID, domain.NotificationReply, actorID, trackID, body)
	return err
}

func (r *Repository) NotifyMentions(ctx context.Context, actorID, trackID uuid.UUID, handles []string, trackTitle, actorHandle string) error {
	if len(handles) == 0 {
		return nil
	}
	body := fmt.Sprintf("@%s mentioned you on %s", actorHandle, trackTitle)
	for _, handle := range handles {
		var mentionedID uuid.UUID
		err := r.pool.QueryRow(ctx, `SELECT id FROM users WHERE lower(handle) = lower($1)`, handle).Scan(&mentionedID)
		if err != nil || mentionedID == actorID {
			continue
		}
		_, _ = r.pool.Exec(ctx, `
			INSERT INTO notifications (user_id, type, actor_id, track_id, body)
			VALUES ($1, $2, $3, $4, $5)
		`, mentionedID, domain.NotificationMention, actorID, trackID, body)
	}
	return nil
}

func (r *Repository) AddTrackReport(ctx context.Context, reporterID, trackID uuid.UUID, reason, detail string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO track_reports (track_id, reporter_id, reason, detail)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (reporter_id, track_id) DO UPDATE SET reason = EXCLUDED.reason, detail = EXCLUDED.detail, created_at = now()
	`, trackID, reporterID, reason, strings.TrimSpace(detail))
	return err
}

func (r *Repository) ListTrackReports(ctx context.Context, limit int) ([]domain.TrackReport, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT tr.id, tr.track_id, tr.reporter_id, tr.reason, tr.detail, tr.created_at,
			t.title, u.handle
		FROM track_reports tr
		JOIN tracks t ON t.id = tr.track_id
		JOIN users u ON u.id = tr.reporter_id
		ORDER BY tr.created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.TrackReport
	for rows.Next() {
		var rep domain.TrackReport
		if err := rows.Scan(
			&rep.ID, &rep.TrackID, &rep.ReporterID, &rep.Reason, &rep.Detail, &rep.CreatedAt,
			&rep.TrackTitle, &rep.ReporterHandle,
		); err != nil {
			return nil, err
		}
		out = append(out, rep)
	}
	if out == nil {
		out = []domain.TrackReport{}
	}
	return out, rows.Err()
}

func (r *Repository) ListComments(ctx context.Context, trackID uuid.UUID, limit int) ([]domain.TrackComment, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT c.id, c.track_id, c.user_id, c.body, c.parent_id, c.created_at,
			u.handle, u.display_name, u.avatar_url
		FROM track_comments c
		JOIN users u ON u.id = c.user_id
		WHERE c.track_id = $1
		ORDER BY COALESCE(c.parent_id, c.id), c.parent_id NULLS FIRST, c.created_at ASC
		LIMIT $2
	`, trackID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.TrackComment
	for rows.Next() {
		var c domain.TrackComment
		var avatar *string
		if err := rows.Scan(
			&c.ID, &c.TrackID, &c.UserID, &c.Body, &c.ParentID, &c.CreatedAt,
			&c.Author.Handle, &c.Author.DisplayName, &avatar,
		); err != nil {
			return nil, err
		}
		c.Author.ID = c.UserID
		c.Author.AvatarURL = avatar
		out = append(out, c)
	}
	if out == nil {
		out = []domain.TrackComment{}
	}
	return out, rows.Err()
}

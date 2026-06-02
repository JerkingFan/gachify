package worker

import (
	"context"
	"log/slog"
	"time"

	"github.com/gachify/gachify/internal/modules/catalog"
	"github.com/gachify/gachify/internal/modules/social"
)

// RunScheduledPublishLoop publishes approved tracks when scheduled_publish_at is due.
func RunScheduledPublishLoop(ctx context.Context, log *slog.Logger, cat *catalog.Repository, notify *social.PublishNotifier) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			publishDue(ctx, log, cat, notify)
		}
	}
}

func publishDue(ctx context.Context, log *slog.Logger, cat *catalog.Repository, notify *social.PublishNotifier) {
	ids, err := cat.ListDueScheduledPublish(ctx, 50)
	if err != nil {
		log.Warn("scheduled publish list failed", "error", err)
		return
	}
	for _, id := range ids {
		track, err := cat.GetByID(ctx, id)
		if err != nil {
			log.Warn("scheduled publish load failed", "track_id", id, "error", err)
			continue
		}
		if err := cat.PublishScheduledTrack(ctx, id); err != nil {
			log.Warn("scheduled publish failed", "track_id", id, "error", err)
			continue
		}
		log.Info("scheduled publish completed", "track_id", id)
		if notify != nil {
			notify.NotifyPublished(ctx, track.CreatorID, id, track.Title)
		}
	}
}

// PublishScheduledOnce is useful in tests.
func PublishScheduledOnce(ctx context.Context, cat *catalog.Repository, notify *social.PublishNotifier) int {
	ids, _ := cat.ListDueScheduledPublish(ctx, 50)
	for _, id := range ids {
		track, err := cat.GetByID(ctx, id)
		if err != nil {
			continue
		}
		if cat.PublishScheduledTrack(ctx, id) == nil && notify != nil {
			notify.NotifyPublished(ctx, track.CreatorID, id, track.Title)
		}
	}
	return len(ids)
}

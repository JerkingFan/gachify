package social

import (
	"context"

	"github.com/gachify/gachify/internal/modules/push"
	"github.com/gachify/gachify/internal/modules/users"
	"github.com/google/uuid"
)

// PublishNotifier sends follower notifications when a track goes live.
type PublishNotifier struct {
	repo  *Repository
	users *users.Repository
	push  *push.Service
}

func NewPublishNotifier(repo *Repository, users *users.Repository, pushSvc *push.Service) *PublishNotifier {
	return &PublishNotifier{repo: repo, users: users, push: pushSvc}
}

func (n *PublishNotifier) NotifyPublished(ctx context.Context, creatorID, trackID uuid.UUID, trackTitle string) {
	if n == nil || n.repo == nil {
		return
	}
	handle := "artist"
	if n.users != nil {
		if u, err := n.users.GetByID(ctx, creatorID); err == nil && u.Handle != "" {
			handle = u.Handle
		}
	}
	_ = n.repo.NotifyFollowersNewRelease(ctx, creatorID, trackID, trackTitle, handle)
	if n.push != nil {
		n.push.NotifyFollowersNewRelease(ctx, creatorID, trackID, trackTitle, handle)
	}
}

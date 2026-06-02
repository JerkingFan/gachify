package library

import (
	"context"

	"github.com/gachify/gachify/internal/domain"
	"github.com/google/uuid"
)

// PublicUserLister loads public profile summaries (avoids import cycle with users package).
type PublicUserLister interface {
	ListPublicSummaries(ctx context.Context, ids []uuid.UUID) ([]domain.PublicUserSummary, error)
}

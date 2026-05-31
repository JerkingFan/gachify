package recent

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

const (
	keyPrefix = "gachify:recent"
	maxItems  = 50
)

type Store struct {
	client *redis.Client
}

func NewStore(client *redis.Client) *Store {
	return &Store{client: client}
}

func (s *Store) Add(ctx context.Context, userID, trackID uuid.UUID) error {
	key := s.key(userID)
	score := float64(time.Now().UnixMilli())
	pipe := s.client.Pipeline()
	pipe.ZAdd(ctx, key, redis.Z{Score: score, Member: trackID.String()})
	pipe.ZRemRangeByRank(ctx, key, 0, int64(-maxItems-1))
	_, err := pipe.Exec(ctx)
	return err
}

func (s *Store) List(ctx context.Context, userID uuid.UUID, limit int) ([]uuid.UUID, error) {
	if limit <= 0 || limit > maxItems {
		limit = maxItems
	}
	members, err := s.client.ZRevRange(ctx, s.key(userID), 0, int64(limit-1)).Result()
	if err != nil {
		return nil, err
	}
	out := make([]uuid.UUID, 0, len(members))
	for _, m := range members {
		id, err := uuid.Parse(m)
		if err != nil {
			continue
		}
		out = append(out, id)
	}
	return out, nil
}

func (s *Store) key(userID uuid.UUID) string {
	return fmt.Sprintf("%s:%s", keyPrefix, userID)
}

package cache

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

const defaultPrefix = "gachify:cache"

type Store struct {
	client *redis.Client
	prefix string
	ttl    time.Duration
}

func New(client *redis.Client, prefix string, ttl time.Duration) *Store {
	if prefix == "" {
		prefix = defaultPrefix
	}
	if ttl <= 0 {
		ttl = 30 * time.Second
	}
	return &Store{client: client, prefix: prefix, ttl: ttl}
}

func (s *Store) key(parts ...string) string {
	raw := s.prefix
	for _, p := range parts {
		raw += ":" + p
	}
	sum := sha256.Sum256([]byte(raw))
	return s.prefix + ":" + hex.EncodeToString(sum[:16])
}

func (s *Store) GetJSON(ctx context.Context, key string, dest any) (bool, error) {
	raw, err := s.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if err := json.Unmarshal(raw, dest); err != nil {
		return false, err
	}
	return true, nil
}

func (s *Store) SetJSON(ctx context.Context, key string, value any, ttl time.Duration) error {
	if ttl <= 0 {
		ttl = s.ttl
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return s.client.Set(ctx, key, raw, ttl).Err()
}

func (s *Store) TracksListKey(status, query string, limit, offset int, creatorID string) string {
	return s.key("tracks", status, query, fmt.Sprintf("%d", limit), fmt.Sprintf("%d", offset), creatorID)
}

func (s *Store) InvalidateTracks(ctx context.Context) error {
	pattern := s.prefix + ":*"
	var cursor uint64
	for {
		keys, next, err := s.client.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return err
		}
		if len(keys) > 0 {
			if err := s.client.Del(ctx, keys...).Err(); err != nil {
				return err
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return nil
}

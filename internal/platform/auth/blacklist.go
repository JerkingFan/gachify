package auth

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

const tokenBlacklistPrefix = "gachify:auth:bl"

type TokenBlacklist struct {
	client *redis.Client
}

func NewTokenBlacklist(client *redis.Client) *TokenBlacklist {
	return &TokenBlacklist{client: client}
}

func (b *TokenBlacklist) Revoke(ctx context.Context, jti string, ttl time.Duration) error {
	if jti == "" || ttl <= 0 {
		return nil
	}
	return b.client.Set(ctx, b.key(jti), "1", ttl).Err()
}

func (b *TokenBlacklist) IsRevoked(ctx context.Context, jti string) (bool, error) {
	if jti == "" {
		return false, nil
	}
	n, err := b.client.Exists(ctx, b.key(jti)).Result()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func (b *TokenBlacklist) key(jti string) string {
	return fmt.Sprintf("%s:%s", tokenBlacklistPrefix, jti)
}
